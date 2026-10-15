import {assertCoreMemory} from './lib/core-memory-integrity.mjs';
import {createModelRouter} from './lib/domestic-model-router.mjs';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';import {ownerRequest,digest,deliverOwnerTask} from './lib/owner-inbox.mjs';
let sourceCommit=null;try{sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
const phase=process.argv[2],event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
const request=ownerRequest(event,{actor:process.env.GITHUB_ACTOR,repository:process.env.GITHUB_REPOSITORY});
const file='knowledge/results/owner-inbox/'+request.id+'.json',artifact='knowledge/results/owner-inbox/'+request.id+'.md';
const save=r=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');};
if(phase==='prepare'){
 if(fs.existsSync(file)){if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'execute=false\n');console.log('Existing receipt retained; never repeat uncertain API spend.');}
 else{const record={...request,at:new Date().toISOString(),source_commit:sourceCommit,run_id:process.env.GITHUB_RUN_ID,input_sha256:digest(request.task),status:request.mode==='execute'?'claimed':'recorded_no_model_calls',calls:[],outputs:[],openai_calls:0,financial_execution:false,paid:false,tx_hash:null};save(record);if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'execute='+(request.mode==='execute')+'\n');console.log(record.id,record.status);}
}else if(phase==='execute'){
 const record=JSON.parse(fs.readFileSync(file,'utf8'));if(record.run_id!==process.env.GITHUB_RUN_ID)throw Error('claim_run_mismatch');
 record.execution_source_commit=sourceCommit;assertCoreMemory();
 const names=['魄','识神','梦境数据库','文明研究','项目历史','重要事件'];const memory=names.map(name=>{const file='ltzzz-memory/'+name+'.md',text=fs.readFileSync(file,'utf8');return {file,text,sha256:digest(text)};});record.memory=memory.map(({file,sha256})=>({file,sha256}));
 const secrets=[process.env.DEEPSEEK_API_KEY,process.env.DOUBAO_API_KEY].filter(Boolean);
 const nativeCall=async(agent,prompt)=>{const module=agent==='DeepSeek'?'./call-deepseek.mjs':'./call-doubao.mjs',apiKey=agent==='DeepSeek'?process.env.DEEPSEEK_API_KEY:process.env.DOUBAO_API_KEY;if(!apiKey)return {ok:false,status:'not_configured'};const {callAgent}=await import(module);const r=await callAgent({apiKey,prompt,maxTokens:3000,...(agent==='Doubao'?{thinking:'disabled'}:{})});if(typeof r.output==='string')for(const key of secrets)r.output=r.output.replaceAll(key,'[REDACTED]');return r;};
 const router=createModelRouter({env:{DEEPSEEK_API_KEY:process.env.DEEPSEEK_API_KEY,DOUBAO_API_KEY:process.env.DOUBAO_API_KEY},record:attempt=>{record.provider_attempts||=[];record.provider_attempts.push(attempt);save(record);}});
 const call=record.role_mode==='gpt_claude_delegated'?async(agent,prompt,opts)=>{const r=await router(agent,prompt,{...opts,maxTokens:agent==='GPT'?8192:4096});if(typeof r.output==='string')for(const key of secrets)r.output=r.output.replaceAll(key,'[REDACTED]');return r;}:nativeCall;
 await deliverOwnerTask(record,{call,memory,onCheckpoint:save});
 fs.writeFileSync(artifact,'# 国内执行席工单回执 · '+record.id+'\n\n状态：'+record.status+'；运行：'+record.run_id+'。仅草稿，未验收、未发布、未交易。\n\n'+record.outputs.map(o=>'## '+(o.requested_agent||o.agent)+'岗位 · 实际 '+o.executed_by+' / '+o.model+'\n\n'+o.text).join('\n\n')+'\n');console.log(record.id,record.status,'OpenAI calls=0');if(record.status!=='submitted_pending_review')process.exitCode=1;
}else if(phase==='comment'){
 const record=JSON.parse(fs.readFileSync(file,'utf8'));const url='https://github.com/ltzyz2181-collab/ltzzz/blob/main/'+file;
 const body='LTZZZ 工单状态：`'+record.status+'`。\n\n[持久回执]('+url+')'+(fs.existsSync(artifact)?' · [模型草稿](https://github.com/ltzyz2181-collab/ltzzz/blob/main/'+artifact+')':'')+'\n\n本轮记录 '+record.calls.length+' 次逻辑模型调用；OpenAI 0 次、Anthropic 0 次。实际岗位与执行模型见回执；草稿不代表部署、验收或资金执行。已存在回执的工单不会重复付费执行。';
 const r=await fetch('https://api.github.com/repos/ltzyz2181-collab/ltzzz/issues/'+request.issue_number+'/comments',{method:'POST',headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,'Content-Type':'application/json',Accept:'application/vnd.github+json'},body:JSON.stringify({body}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('github_comment_failed_'+r.status);
}else throw Error('invalid_phase');
