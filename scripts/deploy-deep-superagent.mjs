// Trusted executor only: provider keys remain in their existing proxy Workers.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const REVISION='ltzzz.deep-superagent.v1';
export const ORIGIN='https://ltzzz-deep-superagent.ltzyz2181.workers.dev';
export const BOOTSTRAP_COMMENT='LTZZZ_DEEP_SUPERAGENT_BOOTSTRAP DEEP-SUPERAGENT-20261103';
export const BOOTSTRAP_JOB=Object.freeze({
 task_id:'DEEP-SUPERAGENT-20261103-BOOTSTRAP',
 package_id:'BOOTSTRAP-PUBLIC-01',
 prompt:'LTZZZ-owned public bootstrap test. Produce a source-check checklist for this fictional public dataset: source A says build DEMO-20261103 version 1.0 passed three offline tests; source B is a draft release note for that build and contains no production deployment or customer acceptance evidence. Evaluate the claim "three tests passed, therefore this version is deployed and accepted by customers". DeepSeek must plan EXACTLY THREE tasks: one doubao, one qianwen, one kimi, each once, covering evidence extraction, claim verification and citation/format checking. Each worker must use only the supplied public dataset. DeepSeek then independently reviews all three outputs and states the observed versus unverified stages. Do not browse, contact anyone, purchase, sign, move money or claim customer acceptance. This is an internal test, not a real customer order.',
 data_classification:'public_distributable',
 platform:'internal'
});
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const bootstrapInputHash=()=>digest(JSON.stringify(BOOTSTRAP_JOB));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const SHA=/^[a-f0-9]{40}$/;
const resultDir='knowledge/results/deep-superagent';
const code=error=>/^[a-z0-9_:-]{1,160}$/.test(error?.message||'')?error.message:'executor_or_transport_error';

export function authorizedBootstrapComment(event){
 return event?.action==='created'&&event.repository?.full_name==='ltzyz2181-collab/ltzzz'&&event.comment?.user?.id===261544579&&event.comment.body===BOOTSTRAP_COMMENT&&Number.isSafeInteger(event.comment.id)&&event.comment.id>0;
}
export function trustedContext(env=process.env,{readEvent=file=>JSON.parse(fs.readFileSync(file,'utf8'))}={}){
 if(env.GITHUB_REPOSITORY!=='ltzyz2181-collab/ltzzz'||env.GITHUB_REF!=='refs/heads/main'||!['push','workflow_dispatch','issue_comment'].includes(env.GITHUB_EVENT_NAME)||!SHA.test(env.GITHUB_SHA||'')||!/^\d{1,20}$/.test(env.GITHUB_RUN_ID||'')||!/^\d{1,6}$/.test(env.GITHUB_RUN_ATTEMPT||''))throw Error('trusted_main_execution_required');
 const context={source_commit:env.GITHUB_SHA,run_id:env.GITHUB_RUN_ID,run_attempt:env.GITHUB_RUN_ATTEMPT};
 if(env.GITHUB_EVENT_NAME==='issue_comment'){
  let event;try{if(!env.GITHUB_EVENT_PATH)throw Error();event=readEvent(env.GITHUB_EVENT_PATH);}catch{throw Error('trusted_owner_bootstrap_comment_required');}
  if(!authorizedBootstrapComment(event))throw Error('trusted_owner_bootstrap_comment_required');
  Object.assign(context,{owner_bootstrap_comment_verified:true,comment_id:String(event.comment.id),comment_author_id:event.comment.user.id,trigger:'owner_exact_fixed_bootstrap_comment'});
 }
 return context;
}
export function bootstrapRequested(env,context){
 return env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.SUPERAGENT_BOOTSTRAP==='true'||env.GITHUB_EVENT_NAME==='issue_comment'&&context.owner_bootstrap_comment_verified===true;
}
const READSET_ROOTS=['workers/deep-superagent/index.js','scripts/deploy-deep-superagent.mjs','.github/workflows/deep-superagent.yml','wrangler.deep-superagent.toml','tools/push-receipt-commit.mjs'];
export function sourceReadSet({source,run}){
 const pending=[...READSET_ROOTS],seen=new Set();
 while(pending.length){
  const file=pending.shift();if(seen.has(file))continue;seen.add(file);
  const content=run(['show',source+':'+file]);
  if(content.status!==0)throw Error('deployment_source_readset_unavailable');
  if(!/\.(?:mjs|js)$/.test(file))continue;
  // Deployment modules use static relative imports or Node builtins. Refuse an
  // untracked dynamic/npm import rather than silently omit it from provenance.
  if(/\bimport\s*\(/.test(content.stdout))throw Error('untracked_dynamic_deployment_import');
  const imports=content.stdout.matchAll(/(?:^|[;\n])\s*(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/gm);
  for(const [,specifier] of imports){
   if(specifier.startsWith('node:'))continue;
   if(!specifier.startsWith('.'))throw Error('untracked_external_deployment_import');
   const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier));
   if(target.startsWith('../')||!/[.](?:js|mjs|json)$/.test(target))throw Error('invalid_deployment_import_path');
   pending.push(target);
  }
 }
 return [...seen].sort();
}
export function assertCurrentMain({context,run=(args)=>spawnSync('git',args,{encoding:'utf8'})}){
 const head=run(['rev-parse','HEAD']);
 if(head.status!==0||head.stdout.trim()!==context.source_commit)throw Error('stale_deployment_source');
 if(run(['fetch','origin','main']).status!==0)throw Error('main_source_readback_failed');
 const current=run(['rev-parse','origin/main']),observed=current.stdout?.trim();
 if(current.status!==0||!SHA.test(observed||''))throw Error('main_source_readback_failed');
 const entries=[];
 for(const file of sourceReadSet({source:context.source_commit,run})){
  const original=run(['rev-parse',context.source_commit+':'+file]),latest=run(['rev-parse',observed+':'+file]);
  if(original.status!==0||latest.status!==0||!SHA.test(original.stdout?.trim()||'')||original.stdout.trim()!==latest.stdout.trim()){
   const error=Error('stale_deployment_source');error.source_readback={observed_main_commit:observed,source_readset_match:false,source_readset_conflict:{path:file,source_git_blob:original.status===0?original.stdout.trim():null,observed_git_blob:latest.status===0?latest.stdout.trim():null}};throw error;
  }
  entries.push({path:file,git_blob_sha:original.stdout.trim()});
 }
 return {observed_main_commit:observed,source_readset_match:true,source_readset:entries,source_readset_sha256:digest(JSON.stringify(entries)),metadata_only_main_advance:observed!==context.source_commit};
}
export function redact(value,secrets){
 if(typeof value==='string')return secrets.filter(x=>typeof x==='string'&&x.length>0).reduce((s,key)=>s.replaceAll(key,'[REDACTED]'),value);
 if(Array.isArray(value))return value.map(x=>redact(x,secrets));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,redact(item,secrets)]));
 return value;
}
export function validateJob(job){
 if(!job||job.task_id!==BOOTSTRAP_JOB.task_id||job.package_id!==BOOTSTRAP_JOB.package_id||job.input_sha256!==bootstrapInputHash()||!SHA.test(job.source_commit||'')||typeof job.execution_id!=='string'||!job.execution_id||!Number.isSafeInteger(job.model_calls)||job.model_calls<0||job.model_calls>5||!Array.isArray(job.receipts))throw Error('bootstrap_job_binding_invalid');
 return job;
}
export function jobEvidenceIdentity(job){
 const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(key=>[key,canonical(x[key])])):x;
 return digest(JSON.stringify(canonical({execution_id:job.execution_id,input_sha256:job.input_sha256,source_commit:job.source_commit,model_calls:job.model_calls,receipts:job.receipts})));
}
export function validateReplay(before,after){
 validateJob(after);
 if(after.duplicate!==true||before.terminal!==true||after.terminal!==true||jobEvidenceIdentity(before)!==jobEvidenceIdentity(after))throw Error('bootstrap_duplicate_replay_changed_execution');
 return true;
}
export function bootstrapVerdict(job){
 validateJob(job);
 if(job.status!=='completed_pending_external_acceptance'||job.terminal!==true||job.model_calls!==5||job.receipts.length!==5)throw Error('bootstrap_not_successful');
 const expected={deepseek:2,doubao:1,qianwen:1,kimi:1},counts={};
 for(const row of job.receipts){
  if(!Object.hasOwn(expected,row.seat)||typeof row.actual_provider!=='string'||!row.actual_provider||typeof row.actual_model!=='string'||!row.actual_model||row.generation_verified!==true||!['stop','end_turn'].includes(row.finish_reason)||!/^[a-f0-9]{64}$/.test(row.output_sha256||''))throw Error('bootstrap_native_receipt_incomplete');
  counts[row.seat]=(counts[row.seat]||0)+1;
 }
 if(Object.entries(expected).some(([seat,count])=>counts[seat]!==count))throw Error('bootstrap_seat_coverage_incomplete');
 if(job.accepted!==false||job.paid!==false||job.tx_hash!==null)throw Error('bootstrap_inflated_acceptance_or_payment');
 return true;
}
async function requestJson(fetcher,route,{method='GET',token,body}={}){
 const response=await fetcher(ORIGIN+route,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>null);
 return {http:response.status,data};
}
export async function verifyDeployment({source,token,fetcher=fetch,pause=wait,attempts=12}){
 let health;
 for(let i=0;i<attempts;i++){
  try{health=await requestJson(fetcher,'/health');}catch{health={http:null,data:null};}
  if(health.http===200&&health.data?.revision===REVISION&&health.data.source_commit===source&&health.data.generation_verified===false&&health.data.auth_configured===true)break;
  if(i<attempts-1)await pause(2000);
 }
 if(health?.http!==200||health.data?.revision!==REVISION||health.data.source_commit!==source||health.data.generation_verified!==false||health.data.auth_configured!==true)throw Error('deployment_source_or_health_unverified');
 const checks=[];
 for(const [kind,credential,expected] of [['anonymous',null,401],['wrong','deliberately-invalid-superagent-token',401],['valid',token,200]]){
  const observed=await requestJson(fetcher,'/v1/status',{token:credential});
  checks.push({kind,http:observed.http});
  if(observed.http!==expected)throw Error('deployment_auth_acceptance_failed');
  if(kind==='valid'&&(observed.data?.revision!==REVISION||observed.data.source_commit!==source||observed.data.financial_execution!==false||observed.data.external_submissions_enabled!==false||['deepseek','doubao','qianwen','kimi'].some(seat=>observed.data.bindings?.[seat]!==true)||['gpt','claude'].some(seat=>observed.data.reserved_native_seats?.[seat]!=='disabled_reserved')))throw Error('deployment_isolation_or_service_binding_unverified');
 }
 const anonymousPost=await requestJson(fetcher,'/v1/jobs',{method:'POST',body:{}});
 if(anonymousPost.http!==401)throw Error('anonymous_job_submission_not_denied');
 return {health:health.data,auth_checks:checks,anonymous_job_post_http:anonymousPost.http,model_calls:0,generation_verified:false};
}

// A lost POST response is reconciled via GET only. No provider request is retried.
export async function runBootstrap({token,fetcher=fetch,pause=wait,clock=Date.now,timeoutMs=600000,onObservation=()=>{}}){
 const route='/v1/jobs/'+BOOTSTRAP_JOB.task_id+'?package_id='+encodeURIComponent(BOOTSTRAP_JOB.package_id);
 const outcome={task_id:BOOTSTRAP_JOB.task_id,package_id:BOOTSTRAP_JOB.package_id,input_sha256:bootstrapInputHash(),post_attempted:false,first_post_outcome:'not_attempted',reused_existing:false,duplicate_probe:'not_run',status:'bootstrap_pending',model_calls:null};
 let observed=await requestJson(fetcher,route,{token});
 if(observed.http===200){validateJob(observed.data);outcome.reused_existing=true;}
 else if(observed.http===404){
  outcome.post_attempted=true;
  onObservation(outcome);
  try{
   const submitted=await requestJson(fetcher,'/v1/jobs',{method:'POST',token,body:BOOTSTRAP_JOB});
   outcome.first_post_http=submitted.http;
   if(![200,202].includes(submitted.http)){outcome.first_post_outcome='rejected';throw Error('bootstrap_job_post_rejected');}
   if(submitted.data?.task_id!==BOOTSTRAP_JOB.task_id||submitted.data.input_sha256!==bootstrapInputHash())throw Error('bootstrap_submission_binding_invalid');
   outcome.execution_id=submitted.data.execution_id;outcome.first_post_outcome='accepted';
  }catch(error){
   if(['bootstrap_job_post_rejected','bootstrap_submission_binding_invalid'].includes(error?.message))throw error;
   outcome.first_post_outcome='unknown_reconcile_get_only';
  }
  onObservation(outcome);
 }else throw Error('bootstrap_existing_job_readback_failed');
 const deadline=clock()+timeoutMs;
 for(;;){
  try{observed=await requestJson(fetcher,route,{token});}catch{observed={http:null,data:null};}
  if(observed.http===200){
   const job=validateJob(observed.data);
   if(outcome.execution_id&&job.execution_id!==outcome.execution_id)throw Error('bootstrap_execution_changed');
   outcome.execution_id=job.execution_id;outcome.model_calls=job.model_calls;outcome.job=job;onObservation(outcome);
   if(job.terminal===true)break;
  }else if(observed.http!==404&&observed.http!==null)throw Error('bootstrap_poll_rejected');
  if(clock()>=deadline){outcome.status='bootstrap_timeout_reconcile_only';return outcome;}
  await pause(5000);
 }
 if(outcome.job.status==='completed_pending_external_acceptance'){
  bootstrapVerdict(outcome.job);
  if(outcome.first_post_outcome!=='unknown_reconcile_get_only'){
   const replay=await requestJson(fetcher,'/v1/jobs',{method:'POST',token,body:BOOTSTRAP_JOB});
   if(![200,202].includes(replay.http))throw Error('bootstrap_duplicate_probe_rejected');
   validateReplay(outcome.job,replay.data);outcome.duplicate_probe='same_execution_receipts_and_model_count_verified';
  }else outcome.duplicate_probe='skipped_unknown_first_post_get_reconciliation_only';
  outcome.status='bootstrap_native_chain_verified';
 }else outcome.status='bootstrap_terminal_blocked';
 return outcome;
}
export function wranglerFailureEvidence(result,secrets){
 return {exit_code:Number.isInteger(result.status)?result.status:null,process_error:typeof result.error?.code==='string'?result.error.code:null,stdout_tail:redact(String(result.stdout||''),secrets).slice(-4000),stderr_tail:redact(String(result.stderr||''),secrets).slice(-4000),scope:'bounded_known_credentials_redacted_cli_diagnostics_not_provider_output'};
}
function shell(args,secrets){
 const r=spawnSync('npx',['--yes','wrangler@4',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:240000,maxBuffer:256*1024});
 if(r.status!==0){const error=Error('wrangler_command_failed:'+String(r.status??'unknown'));error.command_failure=wranglerFailureEvidence(r,secrets);throw error;}
}
export async function main(mode,{env=process.env}={}){
 const context=trustedContext(env),report={schema:'ltzzz.deep-superagent.executor.v1',task_id:'DEEP-SUPERAGENT-20261103',...context,at_utc:new Date().toISOString(),mode,status:'started',financial_execution:false,transactions:0,paid:false,tx_hash:null,api_bill_verified:false,paid_field_scope:'No financial settlement; paid=false does not mean a native model request has zero API cost.',new_paid_schedules:false,native_gpt_claude_enabled:false};
 if(!['deploy','bootstrap'].includes(mode))throw Error('invalid_superagent_executor_mode');
 const filename=path.join(resultDir,`${mode}-${context.run_id}-attempt-${context.run_attempt}.json`),secrets=[env.LTZZZ_AGENT_TOKEN,env.CLOUDFLARE_API_TOKEN];
 const save=()=>{fs.mkdirSync(resultDir,{recursive:true});fs.writeFileSync(filename,JSON.stringify(redact(report,secrets),null,2)+'\n');};
 let temporary;
 try{
  if(!env.LTZZZ_AGENT_TOKEN)throw Error('existing_service_token_required');
  if(mode==='deploy'){
   report.model_calls=0;
   if(!env.CLOUDFLARE_API_TOKEN||!env.CLOUDFLARE_ACCOUNT_ID)throw Error('existing_cloud_deployment_credentials_required');
   Object.assign(report,assertCurrentMain({context}));report.source_validation_before_initial={observed_main_commit:report.observed_main_commit,source_readset_sha256:report.source_readset_sha256};report.stage='initial_upload';save();
   const deployArgs=['deploy','--keep-vars','-c','wrangler.deep-superagent.toml','--var','SUPERAGENT_SOURCE_COMMIT:'+context.source_commit];
   shell(deployArgs,secrets);
   report.stage='bind_existing_service_identity';save();
   temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ltzzz-superagent-secrets-'));
   const secretFile=path.join(temporary,'service.json');fs.writeFileSync(secretFile,JSON.stringify({LTZZZ_AGENT_TOKEN:env.LTZZZ_AGENT_TOKEN}),{mode:0o600});
   shell(['secret','bulk',secretFile,'-c','wrangler.deep-superagent.toml'],secrets);
   fs.rmSync(temporary,{recursive:true,force:true});temporary=null;
   // Secret binding creates a version; finish with the pinned reviewed source.
   Object.assign(report,assertCurrentMain({context}));report.stage='final_upload';save();shell(deployArgs,secrets);
   report.stage='production_readback';save();
   report.verification=await verifyDeployment({source:context.source_commit,token:env.LTZZZ_AGENT_TOKEN});
   report.status='deployment_health_and_auth_verified';
  }else{
   if(!bootstrapRequested(env,context))throw Error('explicit_authorized_bootstrap_required');
   report.stage='verify_current_deployment';save();
   report.deployment=await verifyDeployment({source:context.source_commit,token:env.LTZZZ_AGENT_TOKEN});
   report.stage='bootstrap_execute_or_reconcile';save();
   report.bootstrap=await runBootstrap({token:env.LTZZZ_AGENT_TOKEN,onObservation:progress=>{report.bootstrap=progress;save();}});
   report.model_calls=report.bootstrap.model_calls;
   report.model_calls_scope='Original task total; reusing an existing job does not establish new calls in this run.';
   report.original_job_source_commit=report.bootstrap.job?.source_commit??null;
   report.status=report.bootstrap.status;
   if(report.status!=='bootstrap_native_chain_verified')process.exitCode=1;
  }
 }catch(error){report.status='blocked';report.error=code(error);if(error?.source_readback)Object.assign(report,error.source_readback);if(error?.command_failure)report.command_failure=error.command_failure;process.exitCode=1;}
 finally{
  if(temporary)fs.rmSync(temporary,{recursive:true,force:true});
  report.finished_at_utc=new Date().toISOString();save();
  console.log(JSON.stringify(redact({status:report.status,stage:report.stage,error:report.error??null,command_failure:report.command_failure??null,receipt:filename,source_commit:report.source_commit,observed_main_commit:report.observed_main_commit??null,source_readset_match:report.source_readset_match??null,source_readset_conflict:report.source_readset_conflict??null,original_job_source_commit:report.original_job_source_commit??null,model_calls:report.model_calls??null,job_status:report.bootstrap?.job?.status??null,job_error:report.bootstrap?.job?.error??null,stages:report.bootstrap?.job?.receipts?.map(r=>({stage:r.stage,seat:r.seat,actual_provider:r.actual_provider,actual_model:r.actual_model,generation_verified:r.generation_verified,finish_reason:r.finish_reason}))??[]},secrets),null,2));
 }
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main(process.argv[2]);
