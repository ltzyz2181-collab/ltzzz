import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {metaExecutorToken} from './lib/meta-executor-auth.mjs';
import {CHANNEL_TARGETS,channelDigest,probeDispatchChannels} from './lib/dispatch-channel-probe.mjs';
import {pulseToken} from './pulse-credentials.mjs';
import {PULSE_URL} from './lib/pulse-client.mjs';
import {callAgent} from './call-qwen.mjs';
const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
if(process.env.GITHUB_REPOSITORY!=='ltzyz2181-collab/ltzzz'||process.env.GITHUB_ACTOR!=='ltzyz2181-collab'||event.action!=='opened'||event.issue?.user?.login!=='ltzyz2181-collab'||!event.issue.title.startsWith('[LTZZZ派单验收]')||!Number.isSafeInteger(event.issue.number))throw Error('owner_probe_issue_required');
const id='DISPATCH-CHANNELS-ISSUE-'+event.issue.number,dir='knowledge/results/dispatch-channels',file=dir+'/'+id+'.json';
const save=record=>{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');};
const phase=process.argv[2];
if(phase==='prepare'){
 const exists=fs.existsSync(file);if(!exists)save({task_id:id,nonce:randomBytes(16).toString('hex'),issued_at:new Date().toISOString(),source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),run_id:process.env.GITHUB_RUN_ID,status:'reserved_before_remote_access',issuer:'owner',dispatcher_role:'qianwen',native_plan:null,model_calls:0,paid:false,tx_hash:null,financial_execution:false});
 fs.appendFileSync(process.env.GITHUB_OUTPUT,'execute='+!exists+'\n');
}else if(phase==='execute'){
 const r=JSON.parse(fs.readFileSync(file));if(r.run_id!==process.env.GITHUB_RUN_ID)throw Error('reservation_run_mismatch');
 const persisted=JSON.parse(execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}));if(persisted.nonce!==r.nonce||persisted.status!=='reserved_before_remote_access')throw Error('committed_reservation_required');
 const token=pulseToken('qianwen');console.log('::add-mask::'+token);
 const fetchJSON=async(url,options={})=>{try{const response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)});return {http:response.status,data:await response.json()};}catch{return {http:null,data:{error:'transport_or_non_json'}};}};
 const runMeta=async({taskId,nonce})=>{
  const url='https://ltzzz-meta-hosted.ltzyz2181.workers.dev',health=await fetchJSON(url+'/health');
  const result={provider:'cloudflare-workers-ai',model_calls:0,native_Meta_client:false,health_http:health.http,health_service:health.data.service||null,model:health.data.model||null,generation_verified:false};
  if(health.data.service!=='ltzzz-meta-hosted'||health.data.ai_binding!==true){result.status='blocked_hosted_endpoint_or_binding';return result;}
  const metaToken=metaExecutorToken();console.log('::add-mask::'+metaToken);
  // Earlier deployment generated a random token only in a temporary file. Keep
  // executor authentication recoverable from managed credentials, never the repo.
  r.meta_auth_install={status:'request_started',credential_source:process.env.META_WORKER_TOKEN?'repository_secret':'isolated_HMAC_from_existing_managed_credential'};save(r);
  try{execFileSync('npx',['--yes','wrangler@4','deploy','-c','wrangler.meta-hosted.toml'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});execFileSync('npx',['--yes','wrangler@4','secret','bulk','-c','wrangler.meta-hosted.toml'],{input:JSON.stringify({META_WORKER_TOKEN:metaToken}),encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:90000});r.meta_auth_install.status='configured';save(r);}catch{r.meta_auth_install.status='blocked_deployment_or_secret_update';save(r);result.status='blocked_executor_auth_setup';return result;}
  let authReady=false;
  for(let attempt=0;attempt<6;attempt++){const auth=await fetchJSON(url+'/auth-check',{method:'POST',headers:{Authorization:'Bearer '+metaToken,'Content-Type':'application/json'},body:'{}'});result.auth_check_http=auth.http;if(auth.http===200&&auth.data.authorized===true&&auth.data.model_calls===0){authReady=true;break;}if(attempt<5)await new Promise(resolve=>setTimeout(resolve,2000));}
  if(!authReady){result.status='blocked_auth_propagation_no_generation';return result;}
  result.model_calls=1;const reply=await fetchJSON(url+'/task',{method:'POST',headers:{Authorization:'Bearer '+metaToken,'Content-Type':'application/json'},body:JSON.stringify({task_id:taskId,kind:'analysis',prompt:'派单通讯测试：只回复编号 '+nonce+'，不要执行任何其他操作。'})});
  result.http=reply.http;result.task_id=reply.data.task_id||null;result.provider=reply.data.provider||null;result.model=reply.data.model||null;result.output=typeof reply.data.output==='string'?reply.data.output:null;result.output_sha256=result.output?channelDigest(result.output):null;
  result.generation_verified=reply.http===200&&reply.data.task_id===taskId&&reply.data.provider==='cloudflare-workers-ai'&&result.output?.includes(nonce)===true;
  result.status=result.generation_verified?'hosted_Llama_nonce_generation_verified':'blocked_or_uncertain_no_model_retry';return result;
 };
 const workbuddyInspect=async({taskId,nonce})=>{const sources=['knowledge/results/dispatch/oversight/latest.json','knowledge/results/control/latest.json'].map(file=>{try{return {path:file,sha256:channelDigest(fs.readFileSync(file,'utf8')),present:true};}catch{return {path:file,present:false};}});return {task_id:taskId,nonce,executed_by:'repository_rules_workbuddy_duties',native_workbuddy_client:false,inspection_verified:sources.every(s=>s.present),sources,model_calls:0};};
 const inspectClaude=async()=>({status:'waiting_external_Claude_repository_client',native_client_verified:false,native_anthropic_calls:0,observations:await Promise.all(['https://api-claude.ltzzz.com/health','https://ltzzz-claude-seat.ltzyz2181.workers.dev/health'].map(async url=>{const reply=await fetchJSON(url);return {url,http:reply.http,metadata_only:reply.data.metadata_only===true,native_api_status:reply.data.native_api_status||null,generation_verified:false};}))});
 await probeDispatchChannels(r,{schema:async()=>(await fetchJSON(PULSE_URL+'/schema')).data,status:async()=>(await fetchJSON(PULSE_URL+'/status')).data,control:body=>fetchJSON(PULSE_URL+'/control',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)}),save,callQwen:prompt=>callAgent({prompt,maxTokens:512}),runMeta,inspectClaude,workbuddyInspect});
 for(const target of CHANNEL_TARGETS){const inbox=`ops/dispatch/inbox/${target}/${id}.json`;fs.mkdirSync(path.dirname(inbox),{recursive:true});if(!fs.existsSync(inbox))fs.writeFileSync(inbox,JSON.stringify({task_id:id+'-'+target,dispatcher:'qianwen',native_qwen_plan_verified:r.native_plan?.verified===true,nonce:r.nonce,source_receipt:file,probe_only:true,expected_return:`knowledge/results/dispatch-channels/external-acks/${id}-${target}.json`,instruction:'仅返回原 task_id、nonce、实际客户端/模型的工具元数据来源及已检查事项；不能自称付款、部署或承诺原生身份；此卡不触发常规业务。',status:'waiting_actual_client_receipt'},null,2)+'\n',{flag:'wx'});}
 console.log(JSON.stringify({task_id:id,status:r.status,channels:r.channels.map(c=>({target:c.target,status:c.status})),model_calls:r.model_calls,financial_execution:false}));
}else throw Error('fixed_prepare_or_execute_required');
