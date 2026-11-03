// Trusted GitHub bridge: queue cards contain public input or bound decisions,
// never endpoint/model/credential options. Provider keys stay in proxy Workers.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {normalizeJob,sha256,REVISION} from '../workers/deep-superagent/index.js';
import {WorkpoolGitHubStore} from './lib/workpool-github.mjs';

export const ORIGIN='https://ltzzz-deep-superagent.ltzyz2181.workers.dev';
export const MAX_WAIT_MS=480000;
const REPOSITORY='ltzyz2181-collab/ltzzz';
const SHA=/^[a-f0-9]{64}$/;
const COMMIT=/^[a-f0-9]{40}$/;
const ID=/^[A-Za-z0-9_-]{6,120}$/;
const KINDS=new Set(['task','decision']);
const DECISIONS=new Set(['approve_internal_draft','request_revision','keep_blocked']);
const STATUSES=new Set(['queued','running','blocked','unknown','needs_gpt_decision','completed_pending_external_acceptance']);
const pauseDefault=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const safeError=error=>/^[a-z0-9_:-]{1,180}$/.test(error?.message||'')?error.message:'queue_executor_or_transport_failed';
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));

export function trustedQueueContext(env=process.env){
 if(env.GITHUB_REPOSITORY!==REPOSITORY||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='push'||!COMMIT.test(env.GITHUB_SHA||'')||!/^\d{1,20}$/.test(env.GITHUB_RUN_ID||'')||!/^\d{1,6}$/.test(env.GITHUB_RUN_ATTEMPT||''))throw Error('trusted_main_push_required');
 return {source_commit:env.GITHUB_SHA,run_id:env.GITHUB_RUN_ID,run_attempt:env.GITHUB_RUN_ATTEMPT};
}

// Only newly added top-level JSON cards are consumable. Modifying an old card
// cannot silently become another execution attempt on a later push.
export function selectQueueCards(changes){
 const selected=[],counts={task:0,decision:0};
 for(const change of changes){
  const name=change?.path;
  if(typeof name!=='string'||!name.startsWith('ops/deep-superagent/'))continue;
  const match=/^ops\/deep-superagent\/(tasks|decisions)\/([A-Za-z0-9_-]{6,160})\.json$/.exec(name);
  if(!match)throw Error('invalid_queue_card_path');
  if(change.status!=='A')throw Error('queue_cards_are_append_only');
  const kind=match[1]==='tasks'?'task':'decision';
  if(++counts[kind]>1)throw Error('maximum_one_new_card_per_kind_per_push');
  selected.push({kind,path:name});
 }
 return selected.sort((a,b)=>a.kind===b.kind?a.path.localeCompare(b.path):a.kind==='task'?-1:1);
}

export function normalizeDecision(body){
 const keys=['task_id','package_id','decision_id','execution_id','reviewed_input_sha256','decision','reason'];
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!keys.includes(k)))throw Error('invalid_decision_card_fields');
 if(!ID.test(body.task_id||'')||!/^(DEEP-|DSA-)/.test(body.task_id))throw Error('invalid_decision_task_id');
 const packageId=body.package_id??'';
 if(typeof packageId!=='string'||packageId.length>160||/[\u0000-\u001f]/.test(packageId))throw Error('invalid_decision_package_id');
 if(!ID.test(body.decision_id||'')||typeof body.execution_id!=='string'||!body.execution_id||body.execution_id.length>160||!SHA.test(body.reviewed_input_sha256||'')||!DECISIONS.has(body.decision)||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>4000)throw Error('invalid_bound_decision_card');
 return {task_id:body.task_id,package_id:packageId,decision_id:body.decision_id,execution_id:body.execution_id,reviewed_input_sha256:body.reviewed_input_sha256,decision:body.decision,reason:body.reason};
}

export function decisionPayload(card){
 return pick(card,['decision_id','execution_id','reviewed_input_sha256','decision','reason']);
}

export function sameDecision(existing,payload){
 return !!existing&&Object.keys(existing).length===5&&JSON.stringify(decisionPayload(existing))===JSON.stringify(payload);
}

function validateJob(job,{task_id,package_id,input_sha256,execution_id}){
 if(!job||job.task_id!==task_id||job.package_id!==package_id||!SHA.test(job.input_sha256||'')||(input_sha256&&job.input_sha256!==input_sha256)||typeof job.execution_id!=='string'||!job.execution_id||(execution_id&&job.execution_id!==execution_id)||!COMMIT.test(job.source_commit||'')||job.revision!==REVISION||!STATUSES.has(job.status)||typeof job.terminal!=='boolean'||!Number.isSafeInteger(job.model_calls)||job.model_calls<0||job.model_calls>5||!Array.isArray(job.receipts)||job.receipts.length>5||job.financial_execution!==false||job.external_submissions_enabled!==false||job.paid!==false||job.tx_hash!==null)throw Error('remote_job_binding_or_isolation_invalid');
 return job;
}

// A public-own-input queue receipt includes actual outputs for the GPT decision
// seat to inspect with GitHub tools. It excludes auth headers and unknown fields.
export function publicJob(job){
 const result=pick(job,['task_id','package_id','input_sha256','execution_id','source_commit','revision','content_guard_revision','created_at','started_at','completed_at','status','terminal','model_calls','model_calls_definition','accepted','platform_accepted','deployed','paid','tx_hash','financial_execution','external_submissions_enabled','weights_trained','error']);
 result.receipts=(job.receipts||[]).map(r=>pick(r,['stage','seat','actual_provider','actual_model','task_id','execution_id','source_commit','started_at','completed_at','status','generation_verified','model_source','model_identity_verification','request_id','upstream_request_id','upstream_request_id_source','provider_response_id','finish_reason','tokens_used','reasoning_tokens','completion_tokens','upstream_http','output_sha256','error','accepted','paid','tx_hash']));
 result.outputs=(job.outputs||[]).map(o=>pick(o,['seat','actual_provider','task','text','sha256','request_id']));
 if(job.plan)result.plan={...pick(job.plan,['summary','needs_gpt_decision','reason']),tasks:(job.plan.tasks||[]).map(t=>pick(t,['seat','task']))};
 if(job.review)result.review={...pick(job.review,['approved','summary','needs_gpt_decision','reason','actual_provider','actual_model','output_sha256','independent_of_worker_providers']),reviewed:(job.review.reviewed||[]).map(v=>pick(v,['seat','sha256']))};
 if(job.content_gate){
  const gate=value=>({...pick(value,['phase','at','revision','source_commit','passed']),findings:(value.findings||[]).map(v=>pick(v,['code','field','line','seat','output_sha256']))});
  result.content_gate={...gate(job.content_gate),checks:(job.content_gate.checks||[]).map(gate)};
 }
 if(job.escalation)result.escalation=pick(job.escalation,['seat','kind','task_id','package_id','execution_id','input_sha256','reason','recipient','delivery','email_sent','gpt_decision_recorded','personal_owner_approval_required']);
 if(job.decision)result.decision={...pick(job.decision,['seat','kind','identity_source','actual_provider','actual_model','at','decision_id']),payload:decisionPayload(job.decision.payload||{})};
 return result;
}

export function redactKnownSecrets(value,secrets){
 if(typeof value==='string')return secrets.filter(s=>typeof s==='string'&&s).reduce((text,s)=>text.replaceAll(s,'[REDACTED]'),value);
 if(Array.isArray(value))return value.map(v=>redactKnownSecrets(v,secrets));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redactKnownSecrets(v,secrets)]));
 return value;
}

// Reuse the reviewed Git-object CAS implementation without mixing its lease
// namespace with ordinary workpool claims. A reservation is never auto-cleared.
export class DeepQueueLatchStore extends WorkpoolGitHubStore {
 constructor({fetcher=fetch,deadline=Date.now()+MAX_WAIT_MS,clock=Date.now,...options}){
  super({...options,fetcher:(url,init={})=>{
   const remaining=deadline-clock();
   if(remaining<=0)throw Error('queue_time_budget_exhausted');
   const budget=AbortSignal.timeout(Math.max(1,Math.min(25000,remaining)));
   return fetcher(url,{...init,signal:init.signal?AbortSignal.any([init.signal,budget]):budget});
  }});
 }
 names(key){
  if(!SHA.test(key))throw Error('invalid_queue_latch_key');
  return {ref:'heads/deep-superagent/attempts/'+key,file:'knowledge/results/deep-superagent/attempts/'+key+'.json'};
 }
}

async function requestJson(fetcher,route,{token,method='GET',body,deadline,clock}){
 const remaining=deadline-clock();
 if(remaining<=0)throw Error('queue_time_budget_exhausted');
 const response=await fetcher(ORIGIN+route,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(30000,remaining)))});
 return {http:response.status,data:await response.json().catch(()=>null)};
}

async function reservePost({store,key,state,outcome}){
 if(!store?.read||!store?.compareAndSwap)throw Error('durable_attempt_store_required');
 const previous=await store.read(key);
 if(previous){
  if(previous.state?.payload_sha256!==state.payload_sha256||previous.state?.kind!==state.kind)throw Error('durable_attempt_payload_conflict');
  outcome.attempt_latch='existing_no_post_replay';return false;
 }
 // Any failure/unknown write outcome prevents this process from issuing POST.
 const acquired=await store.compareAndSwap(key,null,state);
 if(acquired){outcome.attempt_latch='durable_reserved_before_post';return true;}
 const raced=await store.read(key);
 if(!raced||raced.state?.payload_sha256!==state.payload_sha256||raced.state?.kind!==state.kind)throw Error('durable_attempt_reservation_conflict');
 outcome.attempt_latch='concurrent_existing_no_post_replay';return false;
}

export async function runQueueCard({kind,body,source_commit,token,store,fetcher=fetch,pause=pauseDefault,clock=Date.now,deadline=clock()+MAX_WAIT_MS,onObservation=()=>{}}){
 if(!KINDS.has(kind)||!COMMIT.test(source_commit||'')||!token)throw Error('trusted_queue_card_context_required');
 const card=kind==='task'?normalizeJob(body):normalizeDecision(body);
 const payload=kind==='task'?card:decisionPayload(card);
 const inputHash=kind==='task'?await sha256(JSON.stringify(card)):card.reviewed_input_sha256;
 const payloadHash=await sha256(JSON.stringify(payload));
 const key=await sha256(JSON.stringify(['deep_superagent_queue',kind,card.task_id,card.package_id]));
 const outcome={kind,task_id:card.task_id,package_id:card.package_id,queue_card_source_commit:source_commit,input_sha256:inputHash,payload_sha256:payloadHash,attempt_key:key,post_attempted:false,reused_existing:false,first_post_outcome:'not_attempted',status:'started',financial_execution:false,paid:false,tx_hash:null};
 const route='/v1/jobs/'+card.task_id+'?package_id='+encodeURIComponent(card.package_id);
 const req=(url,options={})=>requestJson(fetcher,url,{token,deadline,clock,...options});
 const observe=job=>{
  validateJob(job,{task_id:card.task_id,package_id:card.package_id,input_sha256:inputHash,execution_id:outcome.execution_id});
  outcome.execution_id=job.execution_id;outcome.runtime_source_commit=job.source_commit;outcome.model_calls_original_task_total=job.model_calls;outcome.job=publicJob(job);onObservation(outcome);return job;
 };
 try{
  let existing=await req(route),job;
  if(existing.http===200){job=observe(existing.data);outcome.reused_existing=true;}
  else if(existing.http!==404)throw Error('existing_job_readback_not_verified');
  if(kind==='decision'){
   if(!job)throw Error('decision_target_job_missing');
   if(card.execution_id!==job.execution_id||card.reviewed_input_sha256!==job.input_sha256)throw Error('decision_execution_or_input_mismatch');
   if(!job.terminal)throw Error('decision_target_not_terminal');
   if(job.decision){
    if(!sameDecision(job.decision.payload,payload))throw Error('decision_already_recorded_conflict');
    outcome.status='decision_existing_verified';onObservation(outcome);return outcome;
   }
  }
  if(!job||kind==='decision'){
   if(clock()>=deadline)throw Error('queue_time_budget_exhausted');
   const state={schema:'ltzzz.deep-superagent.queue-attempt.v1',kind,task_id:card.task_id,package_id:card.package_id,payload_sha256:payloadHash,input_sha256:inputHash,source_card_commit:source_commit,status:'post_reserved_no_automatic_replay',created_at_utc:new Date().toISOString()};
   const acquired=await reservePost({store,key,state,outcome});
   onObservation(outcome);
   if(acquired){
    if(clock()>=deadline)throw Error('queue_time_budget_exhausted');
    outcome.post_attempted=true;outcome.first_post_outcome='started';onObservation(outcome);
    try{
     const posted=await req(kind==='task'?'/v1/jobs':'/v1/jobs/'+card.task_id+'/decision?package_id='+encodeURIComponent(card.package_id),{method:'POST',body:payload});
     outcome.first_post_http=posted.http;
     outcome.first_post_outcome=[200,202].includes(posted.http)?'accepted_response_pending_get_readback':'non_success_response_reconcile_get_only';
     if([200,202].includes(posted.http))observe(posted.data);
    }catch{
     outcome.first_post_outcome='unknown_reconcile_get_only';
    }
    onObservation(outcome);
   }
  }
  // Existing jobs are only polled. Neither an alarm delay, lost POST, failed
  // provider nor a workflow rerun authorizes another model-triggering POST.
  for(;;){
   if(clock()>=deadline){outcome.status='pending_reconcile_get_only';break;}
   let current;
   try{current=await req(route);}catch{current={http:null,data:null};}
   if(current.http===200){
    job=observe(current.data);
    if(kind==='decision'&&job.decision){
     if(!sameDecision(job.decision.payload,payload))throw Error('decision_already_recorded_conflict');
     outcome.status='decision_recorded_verified';break;
    }
    if(kind==='task'&&job.terminal){outcome.status='job_terminal_observed';break;}
   }else if(current.http!==404&&current.http!==null)throw Error('job_poll_readback_rejected');
   await pause(Math.max(0,Math.min(5000,deadline-clock())));
  }
 }catch(error){outcome.status='blocked';outcome.error=safeError(error);}
 onObservation(outcome);return outcome;
}

export async function runQueue({cards,source_commit,token,store,fetcher=fetch,pause=pauseDefault,clock=Date.now,timeoutMs=MAX_WAIT_MS,onObservation=()=>{}}){
 if(!Array.isArray(cards)||cards.length>2||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>MAX_WAIT_MS)throw Error('invalid_bounded_queue_run');
 if(cards.some(c=>!KINDS.has(c.kind))||new Set(cards.map(c=>c.kind)).size!==cards.length)throw Error('maximum_one_new_card_per_kind_per_push');
 const deadline=clock()+timeoutMs,items=[];
 for(const card of cards){
  if(clock()>=deadline){items.push({kind:card.kind,path:card.path,status:'pending_reconcile_get_only',error:'queue_time_budget_exhausted',post_attempted:false});continue;}
  const result=await runQueueCard({...card,source_commit,token,store,fetcher,pause,clock,deadline,onObservation:progress=>onObservation([...items,{...progress,path:card.path,card_sha256:card.card_sha256}])});
  items.push({...result,path:card.path,card_sha256:card.card_sha256});onObservation(items);
 }
 return items;
}

export async function main({env=process.env}={}){
 const context=trustedQueueContext(env);
 const resultDir='knowledge/results/deep-superagent';
 const filename=path.join(resultDir,`queue-${context.run_id}-attempt-${context.run_attempt}.json`);
 const secrets=[env.LTZZZ_AGENT_TOKEN,env.GITHUB_TOKEN];
 const report={schema:'ltzzz.deep-superagent.queue.v1',...context,task_id:'DEEP-SUPERAGENT-20261103',at_utc:new Date().toISOString(),status:'started',items:[],financial_execution:false,transactions:0,paid:false,tx_hash:null,api_bill_verified:false,native_gpt_claude_enabled:false,new_paid_schedule:false,queue_status_scope:'Transport/readback only; inspect each durable job status and native receipts separately from draft or platform acceptance.',model_calls_note:'Model counts belong to original durable jobs; queue reuse/poll/decision do not prove new model calls, billing or zero cost.'};
 const save=()=>{fs.mkdirSync(resultDir,{recursive:true});fs.writeFileSync(filename,JSON.stringify(redactKnownSecrets(report,secrets),null,2)+'\n');};
 try{
  const event=JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
  if(event.repository?.full_name!==REPOSITORY||event.ref!=='refs/heads/main'||event.after!==context.source_commit||!COMMIT.test(event.before||'')||/^0+$/.test(event.before))throw Error('trusted_push_range_required');
  if(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==context.source_commit)throw Error('queue_source_checkout_mismatch');
  const diff=execFileSync('git',['diff','--no-renames','--name-status',event.before,event.after,'--','ops/deep-superagent/tasks/','ops/deep-superagent/decisions/'],{encoding:'utf8'});
  const selected=selectQueueCards(diff.trim()?diff.trim().split('\n').map(line=>{const [status,...name]=line.split('\t');return {status,path:name.join('\t')};}):[]);
  if(!selected.length){report.status='no_new_queue_cards';return report;}
  if(!env.LTZZZ_AGENT_TOKEN||!env.GITHUB_TOKEN)throw Error('existing_queue_executor_credentials_required');
  const cards=[];
  for(const card of selected){
   const bytes=execFileSync('git',['show',context.source_commit+':'+card.path]);
   if(bytes.byteLength>32768)throw Error('queue_card_too_large');
   const body=JSON.parse(bytes.toString('utf8'));
   if(card.kind==='task')normalizeJob(body);else normalizeDecision(body);
   cards.push({...card,body,card_sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  const baseTree=execFileSync('git',['rev-parse',context.source_commit+'^{tree}'],{encoding:'utf8'}).trim();
  const store=new DeepQueueLatchStore({repository:REPOSITORY,token:env.GITHUB_TOKEN,baseCommit:context.source_commit,baseTree});
  report.items=await runQueue({cards,source_commit:context.source_commit,token:env.LTZZZ_AGENT_TOKEN,store,onObservation:items=>{report.items=items;save();}});
  report.status=report.items.some(x=>x.status==='blocked')?'queue_blocked':report.items.some(x=>x.status==='pending_reconcile_get_only')?'queue_pending_reconciliation':'queue_results_verified';
  if(report.status!=='queue_results_verified')process.exitCode=1;
 }catch(error){report.status='queue_blocked';report.error=safeError(error);process.exitCode=1;}
 finally{report.finished_at_utc=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,error:report.error??null,receipt:filename,items:report.items.map(x=>({task_id:x.task_id,kind:x.kind,status:x.status,error:x.error??null,post_attempted:x.post_attempted}))}));}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
