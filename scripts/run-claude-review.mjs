import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {reviewRequest,reviewClaimId,reviewContext,inspectClaude,selectReviewModel,executeReview,REVIEW_LIMITS} from './lib/claude-review.mjs';
const phase=process.argv[2],request=reviewRequest(process.env),run=process.env.GITHUB_RUN_ID||'local',root=process.cwd(),dir='knowledge/results/claude-review';
fs.mkdirSync(dir,{recursive:true});
let sourceCommit=null;try{sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
const claimId=reviewClaimId(request);
const file=dir+'/'+claimId+'.json';
const save=r=>{const {context,...visible}=r;fs.writeFileSync(file,JSON.stringify({...visible,context_part:context?.part_index||null,context_parts:context?.part_count||null,full_topic_input_supplied_in_this_call:context?.complete_source_in_this_part===true,context:{...context,prompt:undefined}},null,2)+'\n');};
const output=v=>{if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'execute='+v+'\n');};
if(phase==='prepare'){
 const readiness=await inspectClaude(process.env.ANTHROPIC_API_KEY);
 fs.writeFileSync(dir+'/readiness-'+run+'.json',JSON.stringify({at:new Date().toISOString(),run_id:run,source_commit:sourceCommit,...readiness,model_generation_calls:0,wallet_permissions:false},null,2)+'\n');
 const context=reviewContext(root,request.topic,{part:request.part});
 const pack=dir+'/context-'+request.topic+'-part-'+context.part_index+'-'+context.prompt_sha256.slice(0,16)+'.md';
 if(!fs.existsSync(pack))fs.writeFileSync(pack,context.prompt+'\n',{flag:'wx'});else if(fs.readFileSync(pack,'utf8')!==context.prompt+'\n')throw Error('immutable_context_pack_changed');
 if(request.mode==='inspect'){output(false);console.log(JSON.stringify({mode:'inspect',status:readiness.status,model_generation_calls:0,credits_status:'unknown',context_pack:pack,part_index:context.part_index,part_count:context.part_count,complete_source_in_this_part:context.complete_source_in_this_part}));}
 else if(fs.existsSync(file)){output(false);console.log(JSON.stringify({status:'existing_claim_retained_no_repurchase',task_id:request.task_id}));}
 else{
  const model=selectReviewModel(readiness.model_ids,process.env.ANTHROPIC_MODEL||'');
  if(!model){const r={...request,run_id:run,at:new Date().toISOString(),source_commit:sourceCommit,status:'blocked_no_verified_eligible_model',model:null,model_calls:0,context,limits:REVIEW_LIMITS,api_cost_usd:null,real_wages_paid:false,transactions_sent:0,wallet_permissions:false};save(r);output(false);console.log('No verified eligible model; generation not attempted.');process.exitCode=1;}
  else{const r={...request,run_id:run,at:new Date().toISOString(),source_commit:sourceCommit,status:'claimed_before_api',model,model_calls:0,context,limits:REVIEW_LIMITS,api_cost_usd:null,real_wages_paid:false,transactions_sent:0,wallet_permissions:false};save(r);output(true);console.log(JSON.stringify({status:r.status,task_id:r.task_id,model}));}
 }
}else if(phase==='execute'){
 const r=JSON.parse(fs.readFileSync(file,'utf8'));if(r.run_id!==run||r.mode!=='review')throw Error('claim_run_mismatch');
 const context=reviewContext(root,r.topic,{part:r.part||1});if(context.prompt_sha256!==r.context.prompt_sha256)throw Error('context_changed_since_claim');r.context=context;r.execution_source_commit=sourceCommit;
 const {callAgent}=await import('./call-claude.mjs');
 const result=await executeReview(r,{apiKey:process.env.ANTHROPIC_API_KEY,call:callAgent,onCheckpoint:save});
 if(result.output){fs.writeFileSync(dir+'/'+claimId+'.md','# Claude 按需审稿 · '+request.task_id+'\n\n实际模型：'+result.actual_model+'；来源提交：'+result.source_commit+'。待审核；不是部署、资金执行或长期记忆事实。\n\n'+result.output+'\n');}
 console.log(JSON.stringify({task_id:r.task_id,status:r.status,model_calls:r.model_calls,actual_model:r.actual_model,tokens_used:r.tokens_used,transactions_sent:0}));if(r.status!=='submitted_pending_review')process.exitCode=1;
}else throw Error('invalid_phase');
