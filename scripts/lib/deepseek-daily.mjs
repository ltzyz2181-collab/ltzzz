import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {assertCoreMemory} from './core-memory-integrity.mjs';
const memoryFiles=['魄','识神','梦境数据库','文明研究','项目历史','重要事件','装备论'].map(x=>`ltzzz-memory/${x}.md`);
export async function runDeepseekDaily({root=process.cwd(),env=process.env,call,date=new Date(Date.now()+8*3600000).toISOString().slice(0,10),now=()=>new Date().toISOString()}={}){
  const dir=path.join(root,'knowledge/daily/deepseek');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,`${date}.json`),markdown=path.join(dir,`${date}.md`);
  // Started, interrupted and completed requests all consume the day's claim.
  if(fs.existsSync(file))return {...JSON.parse(fs.readFileSync(file,'utf8')),reused:true};
  const receipt={date,at:now(),execution_id:env.GITHUB_RUN_ID||'local',source_commit:env.GITHUB_SHA||null,
    ok:false,status:'claimed',executed_by:'DeepSeek',model:env.DEEPSEEK_MODEL||null,attempts:0,
    paid:false,tx_hash:null,model_api_cost_unknown:true,automatic_retry_allowed:false};
  let descriptor;
  try{descriptor=fs.openSync(file,'wx');}catch(e){if(e.code==='EEXIST')return {ok:false,status:'day_already_claimed',reused:true};throw e;}
  const save=()=>fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n');
  fs.writeFileSync(descriptor,JSON.stringify(receipt,null,2)+'\n');fs.closeSync(descriptor);
  if(fs.existsSync(markdown)){receipt.status='legacy_record_exists_no_repurchase';save();return receipt;}
  try{
    assertCoreMemory(root);
    const docs=memoryFiles.map(relative=>({path:relative,content:fs.readFileSync(path.join(root,relative),'utf8')}));
    receipt.memory_files=docs.map(d=>({path:d.path,bytes:Buffer.byteLength(d.content),sha256:crypto.createHash('sha256').update(d.content).digest('hex')}));
    if(!env.DEEPSEEK_API_KEY){receipt.status='not_configured';save();}
    else{
      receipt.attempts=1;receipt.model_call_started_at=now();receipt.status='model_call_started';save();
      const ai=await call({apiKey:env.DEEPSEEK_API_KEY,model:env.DEEPSEEK_MODEL||undefined,maxTokens:4096,
        prompt:'阅读以下完整记忆，对照中华传统文化与装备论写一条约400字记录。区分原文、个人观察、AI类比与未验证假设；不声称已部署或付款。最后写【交付结束】。\n\n'+docs.map(d=>`### ${d.path}\n${d.content}`).join('\n\n'),
        onProgress:state=>{receipt.progress=state;save();}});
      const complete=ai.ok===true&&['stop','end_turn'].includes(ai.finish_reason)&&!!ai.output?.trim()&&ai.output.trim().endsWith('【交付结束】');
      Object.assign(receipt,{ok:complete,status:complete?'success':ai.ok?'incomplete_output':ai.status||'provider_incomplete_or_uncertain',model:ai.model||receipt.model,
        finish_reason:ai.finish_reason||null,tokens_used:ai.tokens_used??null,request_id:ai.request_id||null,completion_id:ai.completion_id||null,
        stream_complete:ai.stream_complete??null,output:complete?ai.output:'',partial_output:complete?'':ai.partial_output||ai.output||'',error:ai.error||null});
      save();
    }
  }catch{receipt.status=receipt.model_call_started_at?'provider_incomplete_or_uncertain':'memory_input_error';receipt.ok=false;receipt.error=receipt.model_call_started_at?'generation_or_checkpoint_failed_no_retry':'memory_missing_or_invalid';save();}
  fs.writeFileSync(markdown,`# DeepSeek 每日 · ${date}\n\n> status=${receipt.status}；executed_by=DeepSeek；完成=${receipt.ok}；生成时间(UTC)：${now()}\n\n`+(receipt.ok?receipt.output:`本日没有通过完整性验收的交付：${receipt.error||receipt.status}。部分输出仅保留在 JSON 回执，不视为完成。`)+'\n');
  return receipt;
}
