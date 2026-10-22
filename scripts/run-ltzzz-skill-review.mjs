import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {readSkill} from './lib/ltzzz-skill.mjs';import {prepareSkillReview,executeSkillReviews} from './lib/ltzzz-skill-review.mjs';
import {callAgent as deepseek} from './call-deepseek.mjs';import {callAgent as doubao} from './call-doubao.mjs';import {callAgent as qianwen} from './call-qwen.mjs';import {callAgent as grok} from './call-grok.mjs';import {kimiCN} from './agi-econ/kimi-cn.mjs';import {metaExecutorToken} from './lib/meta-executor-auth.mjs';
const phase=process.argv[2],pack=readSkill(),directory='knowledge/results/skill-review/'+pack.core_sha256.slice(0,16),file=directory+'/review.json';
const save=r=>{fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');};
if(phase==='prepare'){
 const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
 if(process.env.GITHUB_ACTOR!=='ltzyz2181-collab'||event.issue?.user?.login!=='ltzyz2181-collab'||!event.issue.title.startsWith('[LTZZZ技能评审]'))throw Error('owner_skill_review_issue_required');
 const prior=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
 const selection=event.issue.body?.match(/^native-review-seats: ([a-z_,]+)$/m)?.[1]?.split(',');
 const state=prepareSkillReview({selectedSeats:selection,core:pack.core_sha256,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT||'1',issue:event.issue.number,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),prior});
 if(state.execute){state.record.sources=pack.sources.map(({text,...s})=>s);save(state.record);
  for(const seat of ['claude','workbuddy','manus','kimi_global','meta']){
   const target=`ops/dispatch/inbox/${seat}/${state.record.task_id}.md`;fs.mkdirSync(path.dirname(target),{recursive:true});
   fs.writeFileSync(target,`# ${seat}：LTZZZ Skill 评审与补充\n\n- Task ID: ${state.record.task_id}-${seat}\n- 状态：assigned_waiting_actual_client；未代接单。\n- 签发者：GPT/Codex总控规则；实际UTC：${state.record.at_utc}\n- core SHA256：${pack.core_sha256}\n- 输入：skills/ltzzz-task-execution/SKILL.md 及其 references/；读取提交 ${state.record.source_commit}。\n- 固定版本入口：https://github.com/ltzyz2181-collab/ltzzz/blob/${state.record.source_commit}/skills/ltzzz-task-execution/SKILL.md\n- 目标：审核一处会让你误领、漏交、误判完成的条款，提出1—3条具体修改或同意理由。不要仅ACK，不部署，不调用付款/签名，不索要凭证。\n- 输出：knowledge/results/skill-review/${pack.core_sha256.slice(0,16)}/external-${seat}.md，分支+PR；记录原Task ID、读取哈希、实际客户端/provider/model来源和局限。无写权限可在已授权会话返回正文，由总控代入库并注明转交。\n- 资金：无USDC付款；不启用原厂OpenAI/Anthropic付费API；外部客户端是否消耗其积分照实记。\n`,{flag:'wx'});
  }
 }
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'execute='+state.execute+'\n');console.log(JSON.stringify({task_id:state.record.task_id,execute:state.execute,model_calls:0}));
}else if(phase==='execute'){
 const record=JSON.parse(fs.readFileSync(file));const persisted=JSON.parse(execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}));
 if(record.run_id!==process.env.GITHUB_RUN_ID||record.run_attempt!==(process.env.GITHUB_RUN_ATTEMPT||'1')||persisted.status!=='reserved_before_generation'||persisted.core_sha256!==pack.core_sha256)throw Error('committed_same_attempt_reservation_required');
 const env=process.env,dk=env.DEEPSEEK_API_KEY,bk=env.DOUBAO_API_KEY||env.ARK_API_KEY,qk=env.DASHSCOPE_API_KEY||env.QWEN_API_KEY,gk=env.XAI_API_KEY,kk=env.MOONSHOT_API_KEY_CN;
 let mt=null;try{mt=metaExecutorToken(env);}catch{}
 const secrets=[dk,bk,qk,gk,kk,mt,env.CLOUDFLARE_API_TOKEN,env.LTZZZ_AGENT_TOKEN].filter(Boolean);
 const redact=v=>typeof v==='string'?secrets.reduce((s,key)=>s.replaceAll(key,'[REDACTED]'),v):Array.isArray(v)?v.map(redact):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,redact(x)])):v;
 const wrap=fn=>async prompt=>redact(await fn(prompt));
 const meta=async prompt=>{
  try{
   const base='https://ltzzz-meta-hosted.ltzyz2181.workers.dev',auth={Authorization:'Bearer '+mt,'Content-Type':'application/json'};
   const ready=await fetch(base+'/auth-check',{method:'POST',redirect:'error',headers:auth,body:'{}',signal:AbortSignal.timeout(20000)});
   if(ready.status!==200)return {ok:false,status:'auth_check_failed_no_generation',upstream_attempts:0};
   const response=await fetch(base+'/task',{method:'POST',redirect:'error',headers:auth,body:JSON.stringify({task_id:record.task_id+'-meta_hosted',kind:'analysis',prompt}),signal:AbortSignal.timeout(120000)});
   const d=await response.json();return {ok:response.ok&&d.provider==='cloudflare-workers-ai'&&d.task_id===record.task_id+'-meta_hosted',status:d.status||'meta_generation_unverified',output:d.output,model:d.model,model_source:'worker_AI_binding',finish_reason:null,upstream_attempts:1};
  }catch{return {ok:false,status:'meta_outcome_unknown_no_retry',upstream_attempts:1};}
 };
 await executeSkillReviews(record,{pack,save,candidates:{
  deepseek:{configured:!!dk,provider:'deepseek',call:wrap(prompt=>deepseek({apiKey:dk,prompt,maxTokens:3000,thinking:'disabled'}))},
  doubao:{configured:!!bk,provider:'doubao',call:wrap(prompt=>doubao({apiKey:bk,prompt,maxTokens:3000,thinking:'disabled'}))},
  qianwen:{configured:!!qk,provider:'aliyun_dashscope',call:wrap(prompt=>qianwen({apiKey:qk,prompt,maxTokens:2048}))},
  kimi_cn:{configured:!!kk&&!!env.LTZZZ_AGENT_TOKEN,provider:'moonshot_cn',call:wrap(prompt=>kimiCN({apiKey:kk,prompt,maxTokens:16384,model:'auto'}))},
  grok:{configured:!!gk,provider:'xai',call:wrap(prompt=>grok({apiKey:gk,prompt,maxTokens:3000}))},
  meta_hosted:{configured:!!mt,provider:'cloudflare-workers-ai',provider_source:'hosted_Llama_not_external_Meta_client',call:wrap(meta)}
 }});
 console.log(JSON.stringify({task_id:record.task_id,status:record.status,seats:Object.fromEntries(Object.entries(record.seats).map(([seat,r])=>[seat,{status:r.status,model_calls:r.model_calls,model:r.model||null}]))}));
}else throw Error('fixed_prepare_or_execute_phase_required');
