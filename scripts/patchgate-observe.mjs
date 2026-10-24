// A1 observes PR data. The only write capability is an isolated observation/CAS branch.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {collectSnapshot} from './patchgate.mjs';
import {evaluate,sha256,TASK,fetchNotificationReadback} from './lib/patchgate.mjs';
const REPO='ltzyz2181-collab/ltzzz',SHA=/^[a-f0-9]{40}$/;
const ROOT='/repos/'+REPO,BRANCH='patchgate-a1-observations/',HASH='[a-f0-9]{64}';
const TRUSTED_AUTHORS=new Set(['OWNER','MEMBER','COLLABORATOR']);
const SAFE_FAILURES=new Set(['diff_limit_exceeded','file_limit_exceeded','diff_base_required','acceptance_injected_failure']);
const validTaskID=value=>typeof value==='string'&&/^[A-Z0-9][A-Z0-9_-]{6,80}$/.test(value);
const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:2*1024*1024,env:{...process.env,GIT_NO_REPLACE_OBJECTS:'1'}}).trim();
export function observerContext({ref,event,runnerSha,checkout,repository}) {
  if(repository!==REPO || ref!=='refs/heads/main' || !['pull_request_target','workflow_dispatch'].includes(event) || !SHA.test(runnerSha||'') || checkout!==runnerSha)throw Error('trusted_main_observer_required');
  return runnerSha;
}
export function candidateIdentity(pr) {
  if(!Number.isSafeInteger(pr?.number)||pr.number<=0||pr.base?.ref!=='main'||pr.base?.repo?.full_name!==REPO||!SHA.test(pr.head?.sha||''))throw Error('invalid_observation_target');
  if(!TRUSTED_AUTHORS.has(pr.author_association))throw Error('trusted_pr_author_required');
  let task='PATCHGATE-PR-'+pr.number;
  try {const text=/^```json\s*\n([\s\S]*?)\n```/.exec(pr.body||'');const id=JSON.parse(text?.[1]||'{}').task_id;if(validTaskID(id))task=id;}catch{}
  return {task_id:task,head_sha:pr.head.sha,pr_number:pr.number};
}
export function observerMode({event,enabled,inputs={},association}) {
  if(event==='workflow_dispatch'&&inputs.mode==='acceptance'&&enabled!=='true')return 'acceptance';
  if(enabled==='true'&&((event==='pull_request_target'&&TRUSTED_AUTHORS.has(association))||(event==='workflow_dispatch'&&inputs.mode==='observe')))return 'observe';
  throw Error('observer_disabled_or_untrusted_event');
}
function isolatedRecord(record,key) {
  if(!record||!validTaskID(record.task_id)||key!==sha256(record.task_id+':'+record.head_sha)||!SHA.test(record.head_sha||'')||!SHA.test(record.source_main_sha||'')
    ||record.phase!=='A1_shadow_readonly'||!Number.isSafeInteger(record.pr_number)||record.pr_number<1||!/^\d+$/.test(record.run_id||'')
    ||!Number.isFinite(Date.parse(record.at_utc))||record.native_model_calls!==0||record.signing_admission!==false
    ||[record.automatic_merge,record.automatic_deploy,record.automatic_rollback,record.financial_execution,record.paid].some(v=>v!==false)||record.tx_hash!==null)throw Error('invalid_transport_observation');
}
// The transport has no generic repository-write capability, even for trusted callers.
export function validateObservationRequest(method,endpoint,body) {
  const only=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
  if(typeof endpoint!=='string'||!endpoint.startsWith(ROOT+'/'))throw Error('fixed_repository_endpoint_required');
  const route=endpoint.slice(ROOT.length);
  if(method==='GET'&&body===undefined&&(/^\/pulls\/[1-9]\d{0,8}$/.test(route)||/^\/issues\/comments\/[1-9]\d{0,18}$/.test(route)
    ||new RegExp('^/git/ref/heads/'+BRANCH+HASH+'$').test(route)))return;
  const read=new RegExp('^/contents/knowledge/results/patchgate/a1/('+HASH+')(?:\\.failure)?\\.json\\?ref='+BRANCH+'('+HASH+')$').exec(route);
  if(method==='GET'&&body===undefined&&read&&read[1]===read[2])return;
  if(method==='POST'&&route==='/git/refs'&&only(body,['ref','sha'])&&new RegExp('^refs/heads/'+BRANCH+HASH+'$').test(body.ref||'')&&SHA.test(body.sha||''))return;
  const write=new RegExp('^/contents/knowledge/results/patchgate/a1/('+HASH+')(\\.failure)?\\.json$').exec(route);
  if(method==='PUT'&&write&&only(body,['branch','message','content'])&&body.branch===BRANCH+write[1]
    &&body.message===(write[2]?'A1 observation failed; retained reservation; no retry':'A1 shadow observation only; no code/merge/deploy authority')
    &&typeof body.content==='string'&&body.content.length<=2800000&&/^[A-Za-z0-9+/]*={0,2}$/.test(body.content)){
    const bytes=Buffer.from(body.content,'base64');if(bytes.toString('base64')!==body.content)throw Error('observation_api_request_not_allowed');
    let r;try{r=JSON.parse(bytes.toString('utf8'));}catch{throw Error('observation_api_request_not_allowed');}
    isolatedRecord(r,write[1]);
    if(write[2]?r.status==='observation_failed':['no_new_diff_no_authorization','observation_complete_no_authorization'].includes(r.status))return;
  }
  throw Error('observation_api_request_not_allowed');
}
export function githubApi({token,fetchImpl=fetch}) {
  return async(method,endpoint,body)=>{
    validateObservationRequest(method,endpoint,body);
    const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
    if(token)headers.Authorization='Bearer '+token;
    const r=await fetchImpl('https://api.github.com'+endpoint,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
    const text=await r.text();if(text.length>2000000)throw Error('github_response_too_large');
    let data;try{data=JSON.parse(text);}catch{data=null;}
    return {status:r.status,data};
  };
}
export async function reserveObservation({api,identity,runnerSha}) {
  if(!SHA.test(runnerSha))throw Error('runner_sha_required');
  const key=sha256(identity.task_id+':'+identity.head_sha),branch='patchgate-a1-observations/'+key,ref='refs/heads/'+branch;
  let response;
  try {response=await api('POST','/repos/'+REPO+'/git/refs',{ref,sha:runnerSha});}
  catch {return {reserved:false,key,branch,status:'claim_outcome_unknown_reconcile_no_retry'};}
  if(response.status===201)return {reserved:true,key,branch,status:'reserved_before_observation_write'};
  if(response.status!==422)throw Error('claim_http_'+response.status);
  // 422 can mean invalid request; only an actual existing ref proves a duplicate.
  const found=await api('GET','/repos/'+REPO+'/git/ref/heads/'+branch);
  if(found.status!==200||found.data?.ref!==ref||!SHA.test(found.data.object?.sha||''))throw Error('claim_422_without_existing_ref');
  return {reserved:false,key,branch,status:'existing_claim_reconcile_no_repeat'};
}
export async function publishObservation({api,claim,record}) {
  if(!claim.reserved)throw Error('new_claim_required_before_write');
  if(!/^[a-f0-9]{64}$/.test(claim.key||'')||claim.branch!=='patchgate-a1-observations/'+claim.key
    ||claim.key!==sha256(record.task_id+':'+record.head_sha)||record.phase!=='A1_shadow_readonly'
    ||[record.automatic_merge,record.automatic_deploy,record.financial_execution].some(v=>v!==false))throw Error('isolated_observation_branch_required');
  const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
  if(!/^\d+$/.test(record.run_id||'')||!SHA.test(record.source_main_sha||'')||!SHA.test(record.diff_base_sha||'')
    ||!Number.isFinite(Date.parse(record.at_utc))||!hash(record.policy_sha256)||!hash(record.trust_sha256)
    ||!Array.isArray(record.changed_files)||record.native_model_calls!==0||record.signing_admission!==false
    ||record.automatic_rollback!==false||record.paid!==false||record.tx_hash!==null)throw Error('complete_shadow_observation_required');
  if(record.status==='no_new_diff_no_authorization'){
    if(record.changed_files.length!==0||record.evaluation!==null)throw Error('invalid_no_diff_observation');
  }else if(record.status==='observation_complete_no_authorization'){
    const s=record.evaluation?.subject;
    if(!record.changed_files.length||s?.base_sha!==record.source_main_sha||s.head_sha!==record.head_sha||s.task_id!==record.task_id
      ||s.policy_sha256!==record.policy_sha256||s.trust_sha256!==record.trust_sha256||record.evaluation.automatic_merge!==false||record.evaluation.automatic_deploy!==false)throw Error('evaluation_subject_mismatch');
  }else throw Error('shadow_observation_status_required');
  const name='knowledge/results/patchgate/a1/'+claim.key+'.json';
  const result=await api('PUT','/repos/'+REPO+'/contents/'+name,{branch:claim.branch,message:'A1 shadow observation only; no code/merge/deploy authority',content:Buffer.from(JSON.stringify(record,null,2)+'\n').toString('base64')});
  if(result.status!==201)throw Error('observation_write_http_'+result.status);
  return {path:name,commit:result.data?.commit?.sha||null,branch:claim.branch};
}
async function publishFailure({api,claim,record}) {
  if(!claim.reserved||claim.branch!==BRANCH+claim.key)throw Error('new_isolated_claim_required');
  isolatedRecord(record,claim.key);
  const name='knowledge/results/patchgate/a1/'+claim.key+'.failure.json';
  const r=await api('PUT',ROOT+'/contents/'+name,{branch:claim.branch,message:'A1 observation failed; retained reservation; no retry',content:Buffer.from(JSON.stringify(record,null,2)+'\n').toString('base64')});
  if(r.status!==201)throw Error('failure_record_write_failed');
  return {path:name,commit:r.data?.commit?.sha||null,branch:claim.branch};
}
export async function observe({api,prNumber,runnerSha,runId,expectedHead,collect=collectSnapshot,gitImpl=git}) {
  if(!Number.isSafeInteger(prNumber)||prNumber<1||!/^\d+$/.test(runId||''))throw Error('executor_run_and_pr_required');
  const got=await api('GET','/repos/'+REPO+'/pulls/'+prNumber);
  if(got.status!==200)throw Error('pull_read_http_'+got.status);
  const identity=candidateIdentity(got.data);
  if(identity.pr_number!==prNumber||(expectedHead!==undefined&&identity.head_sha!==expectedHead))throw Error('observation_target_moved_requalify');
  const claim=await reserveObservation({api,identity,runnerSha});
  const common={observer_task_id:TASK,phase:'A1_shadow_readonly',...identity,source_main_sha:runnerSha,run_id:runId,at_utc:new Date().toISOString(),
    idempotency_key:identity.task_id+':'+identity.head_sha,automatic_merge:false,automatic_deploy:false,automatic_rollback:false,
    signing_admission:false,native_model_calls:0,financial_execution:false,paid:false,tx_hash:null};
  if(!claim.reserved)return {...common,status:claim.status,claim,limitations:['An existing/unknown claim is not deleted or replayed. Reconcile original observation before any new attempt.']};
  let stage='candidate_git',publicationAttempted=false;
  try {
  // Neither checkout nor import candidate code. Git only reads candidate objects and diffs.
  gitImpl(['fetch','--no-tags','origin',identity.head_sha]);
  const diffBase=gitImpl(['merge-base',runnerSha,identity.head_sha]);if(!SHA.test(diffBase))throw Error('diff_base_required');
  stage='collect';
  const {policy,trust,snapshot}=collect({base:runnerSha,head:identity.head_sha,taskId:identity.task_id,diffBase});
  const refs=[];try {const head=/^```json\s*\n([\s\S]*?)\n```/.exec(got.data.body||'');const r=JSON.parse(head?.[1]||'{}').notification_reference;if(typeof r==='string')refs.push(r);}catch{}
  const readbacks=[],readbackErrors=[];
  for(const reference of refs)try{readbacks.push(await fetchNotificationReadback(reference,{fetchImpl:async url=>{
    if(!url.startsWith('https://api.github.com'))throw Error('fixed_notification_host_required');
    const r=await api('GET',url.slice('https://api.github.com'.length));return {status:r.status,text:async()=>JSON.stringify(r.data)};
  }}));}catch{readbackErrors.push('notice_readback_unavailable_or_invalid');}
  stage='evaluate';
  const evaluation=snapshot.files.length?evaluate({policy,trust,snapshot,notificationReadbacks:readbacks}):null;
  const record={...common,status:snapshot.files.length?'observation_complete_no_authorization':'no_new_diff_no_authorization',diff_base_sha:diffBase,
    policy_sha256:snapshot.policy_sha256,trust_sha256:snapshot.trust_sha256,changed_files:snapshot.files.map(f=>({path:f.path,mode:f.mode,binary:f.binary})),evaluation,
    readback_errors:readbackErrors,attestations_loaded:0,signing_keys_configured:trust.enabled===true&&trust.keys.length>0,
    limitations:['This is a shadow observer. Missing signatures remain missing; no model label grants execution authority.','Only the observation branch is written. Main, candidate code, PR state, wallets and deployments are not modified.','This readback collector does not mint or enroll signing keys. A2 remains blocked.']};
  stage='publish';publicationAttempted=true;
  const artifact=await publishObservation({api,claim,record});return {...record,artifact};
  }catch(error){
    const record={...common,status:'observation_failed',failure_stage:stage,error_code:SAFE_FAILURES.has(error?.message)?error.message:'observation_'+stage+'_failed',
      publication_outcome:publicationAttempted?'unknown_reconcile_canonical_and_failure_records':'not_attempted',
      reservation_retained:true,automatic_retry:false,limitations:['Error details are intentionally excluded; reservation is retained.','Failure record uses a separate create-only path so an ambiguous publication is never overwritten.']};
    try {return {...record,artifact:await publishFailure({api,claim,record})};}
    catch {return {...record,failure_record_persisted:false,limitations:[...record.limitations,'Failure record write unavailable or unknown; reconcile the existing ref and Actions artifact, do not replay.']};}
  }
}
if(import.meta.url===`file://${process.argv[1]}`){
  observerContext({ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,runnerSha:process.env.GITHUB_SHA,checkout:git(['rev-parse','HEAD']),repository:process.env.GITHUB_REPOSITORY});
  const e=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  observerMode({event:process.env.GITHUB_EVENT_NAME,enabled:process.env.PATCHGATE_A1_ENABLED,inputs:e.inputs,association:e.pull_request?.author_association});
  if(e.inputs?.mode==='acceptance')throw Error('acceptance_requires_dedicated_runner');
  const value=e.pull_request?.number||e.inputs?.pr_number;
  if(!/^[1-9]\d{0,8}$/.test(String(value||'')))throw Error('numeric_pull_required');
  const out='work/patchgate-a1/observation.json';fs.mkdirSync(path.dirname(out),{recursive:true});
  const r=await observe({api:githubApi({token:process.env.GITHUB_TOKEN}),prNumber:Number(value),runnerSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID});
  fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n');
  console.log(JSON.stringify({phase:r.phase,status:r.status,head:r.head_sha,artifact:r.artifact||null,automatic_actions:false}));
  if(r.status==='observation_failed')process.exitCode=1;
}
