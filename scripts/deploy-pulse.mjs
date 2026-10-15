import {createHash} from 'node:crypto';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {pulseToken} from './pulse-credentials.mjs';import {PULSE_URL} from './lib/pulse-client.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ltzzz-pulse-')),secret=path.join(dir,'secrets.json');
const expectedVersion=JSON.parse(fs.readFileSync('workers/pulse-worker/pulse.json','utf8')).version;
const tokens={PULSE_TOKEN:pulseToken('gpt'),PULSE_QIANWEN_TOKEN:pulseToken('qianwen')};for(const token of Object.values(tokens))console.log('::add-mask::'+token);
async function read(r){const text=await r.text();try{return JSON.parse(text);}catch{return {error:'non_json_response',response_sample:text.slice(0,180)}}}
const receipt={at:new Date().toISOString(),run_id:process.env.GITHUB_RUN_ID,run_attempt:process.env.GITHUB_RUN_ATTEMPT||'1',source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),status:'deploy_started',model_calls:0,financial_execution:false};
try{
 fs.writeFileSync(secret,JSON.stringify(tokens),{mode:0o600});
 receipt.wrangler_version=execFileSync('npx',['--yes','wrangler@4','--version'],{encoding:'utf8'}).trim();
 execFileSync('npx',['--yes','wrangler@4','deploy','-c','workers/pulse-worker/wrangler.toml'],{stdio:'inherit'});
 execFileSync('npx',['--yes','wrangler@4','secret','bulk',secret,'-c','workers/pulse-worker/wrangler.toml'],{stdio:'inherit'});
 let protocolReady=false;receipt.readiness_attempts=0;
 // HTTP gateway and durable instances can receive new code at different times.
 // Wait for the actual durable protocol as well as the outer health version.
 for(let i=0;i<60;i++){
  receipt.readiness_attempts=i+1;
  try{
   receipt.health=await fetch(PULSE_URL+'/health',{signal:AbortSignal.timeout(10000)}).then(read);
   const response=await fetch(PULSE_URL+'/status',{signal:AbortSignal.timeout(10000)}),status=await read(response);
   const tasks=await fetch(PULSE_URL+'/tasks',{signal:AbortSignal.timeout(10000)}),board=await read(tasks);
   receipt.durable_readiness={http:response.status,version:status.version||null,task_http:tasks.status};
   if(receipt.health.version===expectedVersion&&receipt.health.auth_configured&&receipt.health.qianwen_control_configured&&status.version===expectedVersion&&tasks.ok&&Array.isArray(board.tasks)){protocolReady=true;break;}
  }catch{}
  await new Promise(r=>setTimeout(r,2000));
 }
 if(!protocolReady)throw Error('durable_protocol_not_ready');
 receipt.route_attempts=[];
 let ready=false;
 for(let i=0;i<12;i++){
  const blocked=await fetch(PULSE_URL+'/run',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});receipt.anonymous_run_http=blocked.status;
  const getRun=await fetch(PULSE_URL+'/run');receipt.get_run_http=getRun.status;
  const probe=await fetch(PULSE_URL+'/control',{method:'POST',headers:{Authorization:'Bearer '+tokens.PULSE_QIANWEN_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({id:'qianwen-probe-'+process.env.GITHUB_RUN_ID,action:'probe',reason:'Deployment acceptance of deputy operational authority; not a Qianwen model generation'})});receipt.qianwen_control_http=probe.status;receipt.qianwen_control=await read(probe);
  receipt.route_attempts.push({anonymous:blocked.status,get:getRun.status,probe:probe.status,version:getRun.headers.get('x-pulse-version'),probe_response:receipt.qianwen_control});
  if(blocked.status===401&&getRun.status===405&&probe.status===200){ready=true;break;}
  await new Promise(r=>setTimeout(r,3000));
 }
 if(!ready)throw Error('control_routes_not_ready');
 const run=await fetch(PULSE_URL+'/run',{method:'POST',headers:{Authorization:'Bearer '+tokens.PULSE_TOKEN,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(45000)});receipt.run_http=run.status;receipt.status_snapshot=await read(run);
 const board=await fetch(PULSE_URL+'/tasks');receipt.task_board_http=board.status;receipt.task_board=await read(board);
 // The controller's actual self-service handover document is a real artifact,
 // submitted for independent review. This is not a model generation or settlement.
 const continuity=receipt.task_board.tasks?.find(t=>t.date===receipt.task_board.date&&t.id.endsWith('-continuity'));
 receipt.task_protocol={status:'not_available_without_overwriting_other_worker'};
 if(continuity&&(['available'].includes(continuity.status)||continuity.status==='claimed'&&continuity.claimed_by==='gpt')){
  const auth={Authorization:'Bearer '+tokens.PULSE_TOKEN,'Content-Type':'application/json'};
  const claim=await fetch(PULSE_URL+'/control',{method:'POST',headers:auth,body:JSON.stringify({id:'claim-continuity-'+process.env.GITHUB_RUN_ID,action:'claim_task',task_id:continuity.id,agent:'gpt',reason:'Controller implemented the owner-requested daily dispatch and self-service protocol; claim actual continuity work'})});
  const claimResult=await read(claim);if(!claim.ok)throw Error('task_claim_failed');
  const evidence_path='ops/AI-AUTO-WORK.md',evidence_sha256=createHash('sha256').update(fs.readFileSync(evidence_path)).digest('hex');
  const submit=await fetch(PULSE_URL+'/control',{method:'POST',headers:auth,body:JSON.stringify({id:'submit-continuity-'+process.env.GITHUB_RUN_ID,action:'submit_task',task_id:continuity.id,agent:'gpt',reason:'Submit committed operational handover artifact for independent review; do not settle',evidence_path,evidence_sha256})});
  const submitResult=await read(submit);if(!submit.ok)throw Error('task_submit_failed');
  receipt.task_protocol={status:'actual_artifact_submitted_pending_review',task_id:continuity.id,claim_http:claim.status,submit_http:submit.status,evidence_path,evidence_sha256,paid:false,model_calls:0};
 }
 receipt.task_board=await read(await fetch(PULSE_URL+'/tasks',{signal:AbortSignal.timeout(10000)}));
 const status=await fetch(PULSE_URL+'/status',{signal:AbortSignal.timeout(10000)});receipt.public_status_http=status.status;receipt.public_status=await read(status);
 if(receipt.task_board_http!==200||!Array.isArray(receipt.task_board.tasks)||receipt.task_board.tasks.length<5||!run.ok||!receipt.public_status.ran_at||receipt.public_status.stale||!receipt.public_status.alarm_at||receipt.qianwen_control_http!==200||receipt.anonymous_run_http!==401||receipt.get_run_http!==405)throw Error('acceptance_failed');
 receipt.status='deployed_and_live_observations_recorded';receipt.generation_verified=false;receipt.health_failures=Object.entries(receipt.public_status.agents||{}).filter(([,a])=>!a.ok).map(([name])=>name);
}catch{receipt.status='blocked_deployment_or_acceptance';process.exitCode=1;}finally{fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync('knowledge/results/pulse',{recursive:true});const reportText=JSON.stringify(receipt,null,2)+'\n';fs.writeFileSync('knowledge/results/pulse/deploy-'+process.env.GITHUB_RUN_ID+'-attempt-'+receipt.run_attempt+'.json',reportText);fs.writeFileSync('knowledge/results/pulse/deploy-'+process.env.GITHUB_RUN_ID+'.json',reportText);console.log(JSON.stringify({status:receipt.status,run_id:receipt.run_id,model_calls:0}));}
