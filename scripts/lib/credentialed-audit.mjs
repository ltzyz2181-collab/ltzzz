import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import registry from '../../identity/seat-registry.json' with {type:'json'};
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=(root,file)=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const normal=['stop','end_turn'];
export function generationEvidence(root,file,{expectedHash=null,now=Date.now(),maxAgeHours=36,expectedProvider=null}={}){
 try{
  if(!/^knowledge\/results\/(?:daily-board\/artifacts|daily-recovery|wep3\/kimi-native)\/[A-Za-z0-9_.-]+\.json$/.test(file))throw Error('unapproved_evidence_path');
  const bytes=fs.readFileSync(path.join(root,file)),d=JSON.parse(bytes),x=d.execution;
  if(expectedHash&&hash(bytes)!==expectedHash)throw Error('artifact_sha256_mismatch');
  if(!x||x.schema_version!=='ltzzz.provider-execution.v1'||!['worker_code','repository_executor_code','native_executor_code'].includes(x.receipt_source)||x.model_source!=='provider_response'||!x.generation_verified||!x.actual_model)throw Error('code_and_provider_generation_proof_required');
  if(expectedProvider&&x.executed_by!==expectedProvider)throw Error('execution_provider_mismatch');
  const output=d.output;
  if(typeof output!=='string'||!output.trim()||!normal.includes(d.finish_reason||d.provider?.finish_reason)||!normal.includes(x.finish_reason))throw Error('empty_or_incomplete_output');
  if(d.model&&d.model!==x.actual_model||d.actual_model&&d.actual_model!==x.actual_model||(d.model_source||d.provider?.model_source)!=='provider_response')throw Error('model_provenance_mismatch');
  const outputHash=hash(output);if(d.output_sha256&&d.output_sha256!==outputHash)throw Error('output_sha256_mismatch');
  const at=x.completed_at,t=Date.parse(at);if(!Number.isFinite(t)||t>now+60000)throw Error('invalid_generation_time');
  return {status:now-t>maxAgeHours*3600000?'stale_generation_evidence':'generation_evidence_verified',generation_verified:true,fresh:now-t<=maxAgeHours*3600000,source:file,source_sha256:hash(bytes),output_sha256:outputHash,author_provider:x.executed_by,actual_model:x.actual_model,model_source:'provider_response',receipt_source:x.receipt_source,route:x.receipt_source==='worker_code'?'authenticated_worker':'repository_native_adapter',http:x.upstream_http??null,http_observed:x.http_status_observed===true,completed_at:at,tokens_used:x.tokens_used,accepted:false,scope:'actual_generation_only_not_delivery_quality_or_deployment'};
 }catch(e){return {status:'evidence_not_verified',generation_verified:false,source:file,error:e.message};}
}
export function auditGenerationSources(root,{date,now=Date.now()}={}){
 const rows={};let board;try{board=read(root,'knowledge/results/daily-board/'+date+'.json');}catch{}
 for(const id of ['deepseek','grok','qianwen','doubao']){
  const seat=board?.seats?.[id],a=seat?.artifact;
  rows[id]={logical_seat:id,status:'no_current_generation_evidence',generation_verified:false};
  if(a?.path){const e=generationEvidence(root,a.path,{expectedHash:a.sha256,now,expectedProvider:id});rows[id]={logical_seat:id,...e,original_task_status:seat.status,task_claim_verified:seat.claim_verified===true,task_submission_verified:seat.submission_verified===true};}
 }
 // Original failures remain failures. A separately sealed supplemental run can
 // prove the repaired transport without rewriting that original task outcome.
 const candidates=['-pro-key-repair','-pro-repair',''].map(s=>'knowledge/results/daily-recovery/'+date+'-doubao'+s+'.json');
 for(const f of candidates){if(!fs.existsSync(path.join(root,f)))continue;const e=generationEvidence(root,f,{now,expectedProvider:'doubao'});if(e.generation_verified){rows.doubao={logical_seat:'doubao',...e,original_task_status:board?.seats?.doubao?.status||null,supplemental:true,original_on_time_delivery_proven:false};break;}}
 rows.kimi={logical_seat:'kimi',...generationEvidence(root,registry.seats.kimi.generation_evidence,{now,expectedProvider:'kimi'}),note:'This existing native WEP3 generation audited a historical artifact. It is not a new live HTTP contract test.'};
 rows.gpt={logical_seat:'gpt',status:'native_paid_daily_disabled_coordinator_active',generation_verified:false};
 rows.claude={logical_seat:'claude',status:'external_audit_planning_active_native_API_not_scheduled',generation_verified:false,author_provider:null,reported_author_provider:'Anthropic',author_provider_verified:false,github_identity_proves_provider:false};
 return rows;
}
export async function auditProxyGates({token,fetcher=fetch,now=()=>new Date().toISOString()}={}){
 const result=[];
 for(const id of ['qianwen','deepseek','kimi','doubao','grok','gpt']){
  const url=registry.seats[id].health_urls[0],origin=new URL(url).origin,row={seat:id,origin,at:now(),model_calls:0,generation_verified:false};
  try{const r=await fetcher(url,{signal:AbortSignal.timeout(12000),redirect:'error'}),d=await r.json();row.health_http=r.status;row.health_ok=r.ok&&d.ok===true;for(const k of ['configured_model','model_configured','model_configuration_revision','model_config_source','model_override_configured','auth_required','auth_configured'])row[k]=d[k]??null;}catch{row.health_ok=false;row.health_error='transport_or_invalid_health';}
  if(!token){row.status='auth_check_token_not_configured';result.push(row);continue;}
  try{
   row.auth_checks=[];
   for(const [kind,value] of [['anonymous',null],['valid',token]]){
    const r=await fetcher(origin+'/auth/check',{headers:value?{Authorization:'Bearer '+value}:{},signal:AbortSignal.timeout(12000),redirect:'error'}),d=await r.json();
    row.auth_checks.push({kind,http:r.status,authenticated:d.authenticated===true,model_calls:d.model_calls??null});
   }
   row.status=row.health_ok&&row.auth_checks[0].http===401&&row.auth_checks[1].http===200&&row.auth_checks[1].authenticated&&row.auth_checks.every(x=>x.model_calls===0)?'health_and_credential_gate_verified_no_generation':'auth_or_health_not_verified';
  }catch{row.status='credential_gate_transport_unverified';}
  result.push(row);
 }
 return result;
}
