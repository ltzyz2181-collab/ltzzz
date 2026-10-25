import {skillContext} from './lib/ltzzz-skill.mjs';
import fs from 'node:fs';import path from 'node:path';
import {nextSupervision,persistSupervision} from './lib/pending-supervision.mjs';
import {prepareDailyHire,reconcileInternalHire} from './lib/daily-hire-files.mjs';
import {prepareCycle,executeCycle,dayCST,digest} from './lib/ans-cycle.mjs';
import {pulseSnapshot,PULSE_URL,pulseGate} from './lib/pulse-client.mjs';
import {pulseToken} from './pulse-credentials.mjs';
import {cycleClosure} from './lib/ans-review-recovery.mjs';
const phase=process.argv[2],date=process.env.ANS_DATE||dayCST(),runId=process.env.GITHUB_RUN_ID||'local';
const file='knowledge/results/ans-cycle/'+date+'.json';
const save=r=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');};
async function control(body){const token=pulseToken('qianwen');const r=await fetch(PULSE_URL+'/control',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({...body,reason:'Owner priority: close ANS dispatch/execution/feedback loop'}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('pulse_operation_'+r.status);return r.json();}
if(phase==='prepare'){
 const prior=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 const p=prepareCycle({date,runId,sourceCommit:process.env.GITHUB_SHA||'local',prior,repairKnownTruncation:process.env.ANS_REPAIR_KNOWN_TRUNCATION==='1',repairKnownFormat:process.env.ANS_REPAIR_KNOWN_FORMAT==='1'});
 if(p.archive)fs.writeFileSync('knowledge/results/ans-cycle/'+date+'-'+(p.archive_suffix||'before-nonthinking-repair')+'.json',JSON.stringify(p.archive,null,2)+'\n');
 if(p.execute){p.record.supervisory_subject||=nextSupervision();save(p.record);}
 prepareDailyHire({date,mode:'internal',runId,sourceCommit:p.record.source_commit,allowExistingOtherMode:true});
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'execute='+p.execute+'\n');
 if(process.env.GITHUB_ENV)fs.appendFileSync(process.env.GITHUB_ENV,'ANS_DATE='+date+'\n');console.log(date,p.record.status,'execute='+p.execute);
}else if(phase==='execute'){
 const record=JSON.parse(fs.readFileSync(file));if(record.run_id!==runId)throw Error('claim_run_mismatch');
 try{
  const snapshot=await pulseSnapshot();record.pulse_observed_at=snapshot.ran_at||null;record.actual_autonomic_feedback=snapshot.autonomic_feedback||null;
  for(const t of record.tasks){const gate=pulseGate(snapshot,t.agent);if(!gate.allowed)throw Error('pulse_paused_'+t.agent);await control({id:'ans-claim-'+date+'-'+t.agent,action:'claim_task',agent:t.agent,task_id:t.id});}
  record.remote_claims=true;save(record);
  const inputs=['scripts/lib/daily-task-board.mjs','scripts/daily-task-board.mjs','scripts/lib/pulse-client.mjs','workers/pulse-worker/index.js','workers/pulse-worker/engine.js','workers/pulse-worker/tasks.js','scripts/lib/daily-assignment.mjs','scripts/run-autonomous-control.mjs','scripts/run-daily-tasks.mjs','docs/ANS-AUTONOMOUS-PULSE.md','ltzzz-memory/装备论.md'];
  const docs=inputs.map(file=>({file,text:fs.readFileSync(file,'utf8')}));
  const historicalReviews=fs.readdirSync('knowledge/results/ans-cycle').filter(f=>f.endsWith('-reviewer.json')).sort().slice(-1);
  for(const name of historicalReviews){const file='knowledge/results/ans-cycle/'+name;docs.push({file,text:fs.readFileSync(file,'utf8')});}
record.inputs=docs.map(d=>({file:d.file,sha256:digest(d.text)}));
  const {createModelRouter}=await import('./lib/domestic-model-router.mjs');const call=createModelRouter({record:attempt=>{record.provider_attempts||=[];record.provider_attempts.push(attempt);save(record);}});
  const skill=skillContext({scope:'ans-worker-and-independent-review'});record.skill=skill.proof;save(record);
  await executeCycle(record,{call,context:skill.text+'\n'+docs.map(d=>'## '+d.file+'\n'+d.text).join('\n'),save});
 }catch{record.status='blocked_execution_or_claim';save(record);}
 const supervision=persistSupervision(record);if(supervision)record.supervisory_review_reference=supervision;
 for(const a of record.artifacts){a.path='knowledge/results/ans-cycle/'+date+'-'+a.role+'.json';fs.writeFileSync(a.path,a.text);delete a.text;}save(record);
 if(!['draft_independently_reviewed','draft_rejected'].includes(record.status))process.exitCode=1;
 console.log(date,record.status,'OpenAI calls=0; transactions=0');
}else if(phase==='sync'){
 const record=JSON.parse(fs.readFileSync(file));record.submissions||=[];
 for(const a of record.artifacts){if(record.submissions.some(s=>s.task_id===a.task_id))continue;try{const text=fs.readFileSync(a.path);if(digest(text)!==a.sha256)throw Error('artifact_changed');await control({id:'ans-submit-'+date+'-'+a.role,action:'submit_task',agent:record.tasks.find(t=>t.id===a.task_id).agent,task_id:a.task_id,evidence_path:a.path,evidence_sha256:a.sha256});record.submissions.push({task_id:a.task_id,status:'submitted_pending_review',evidence_path:a.path,sha256:a.sha256});}catch{record.sync_status='blocked_remote_submission';save(record);process.exitCode=1;break;}}
 if(record.submissions.length===record.artifacts.length)record.sync_status=record.artifacts.length?'hashed_artifacts_submitted':'no_artifact_available';
 if(record.audit&&record.artifacts.length===2&&record.sync_status==='hashed_artifacts_submitted'){
  const worker=record.artifacts.find(a=>a.role==='worker'),audit=record.artifacts.find(a=>a.role==='reviewer');
  try{await control({id:'ans-review-'+date,action:'review_task',task_id:worker.task_id,agent:'doubao',accepted:record.audit.accepted,reviewed_sha256:worker.sha256,scope:'engineering_draft_only',worker_actual_provider:worker.executed_by.toLowerCase(),reviewer_actual_provider:audit.executed_by.toLowerCase(),review_evidence_path:audit.path,review_evidence_sha256:audit.sha256});record.remote_review_status=record.audit.accepted?'completed_draft_review':'rejected_draft_review';}catch{record.remote_review_status='blocked_remote_review';process.exitCode=1;}
 }
 if(record.remote_review_status&&record.artifacts.length===2){
  const snapshot=await pulseSnapshot(),worker=record.artifacts.find(a=>a.role==='worker'),audit=record.artifacts.find(a=>a.role==='reviewer');
  const w=snapshot.task_board?.find(t=>t.id===worker.task_id),a=snapshot.task_board?.find(t=>t.id===audit.task_id);
  const verified=snapshot.available&&w?.status===record.remote_review_status&&w?.evidence_sha256===worker.sha256&&a?.evidence_sha256===audit.sha256;
  record.board_verification={at:new Date().toISOString(),verified:!!verified,worker_status:w?.status||null,reviewer_status:a?.status||null};
  if(snapshot.available){fs.mkdirSync('knowledge/results/pulse',{recursive:true});fs.writeFileSync('knowledge/results/pulse/latest.json',JSON.stringify(snapshot,null,2)+'\n');}
  if(!verified)process.exitCode=1;
 }
 save(record);
 reconcileInternalHire(date);
}else if(phase==='verify'){
 const record=JSON.parse(fs.readFileSync(file)),verified=cycleClosure(record);
 console.log(JSON.stringify({date,status:record.status,draft_review_closure_verified:verified,deployed:false,model_calls:0,financial_execution:false}));
 if(!verified)process.exitCode=1;
}else throw Error('phase_required');
