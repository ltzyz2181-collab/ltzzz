// A1 observes PR data. The only write capability is an isolated observation/CAS branch.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {collectSnapshot} from './patchgate.mjs';
import {evaluate,sha256,TASK,fetchNotificationReadback} from './lib/patchgate.mjs';
const REPO='ltzyz2181-collab/ltzzz',SHA=/^[a-f0-9]{40}$/;
const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:2*1024*1024,env:{...process.env,GIT_NO_REPLACE_OBJECTS:'1'}}).trim();
export function observerContext({ref,event,runnerSha,checkout,repository}) {
  if(repository!==REPO || ref!=='refs/heads/main' || !['pull_request_target','workflow_dispatch'].includes(event) || !SHA.test(runnerSha||'') || checkout!==runnerSha)throw Error('trusted_main_observer_required');
  return runnerSha;
}
export function candidateIdentity(pr) {
  if(!Number.isSafeInteger(pr?.number)||pr.number<=0||pr.base?.ref!=='main'||pr.base?.repo?.full_name!==REPO||!SHA.test(pr.head?.sha||''))throw Error('invalid_observation_target');
  let task='PATCHGATE-PR-'+pr.number;
  try {const text=/^```json\s*\n([\s\S]*?)\n```/.exec(pr.body||'');const id=JSON.parse(text?.[1]||'{}').task_id;if(/^[A-Z0-9][A-Z0-9_-]{6,80}$/.test(id||''))task=id;}catch{}
  return {task_id:task,head_sha:pr.head.sha,pr_number:pr.number};
}
export function githubApi({token,fetchImpl=fetch}) {
  return async(method,endpoint,body)=>{
    if(!endpoint.startsWith('/repos/'+REPO+'/')||endpoint.includes('..')||!['GET','POST','PUT'].includes(method))throw Error('fixed_repository_endpoint_required');
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
export async function observe({api,prNumber,runnerSha,runId,collect=collectSnapshot,gitImpl=git,token}) {
  if(!Number.isSafeInteger(prNumber)||prNumber<1||!/^\d+$/.test(runId||''))throw Error('executor_run_and_pr_required');
  const got=await api('GET','/repos/'+REPO+'/pulls/'+prNumber);
  if(got.status!==200)throw Error('pull_read_http_'+got.status);
  const identity=candidateIdentity(got.data),claim=await reserveObservation({api,identity,runnerSha});
  const common={observer_task_id:TASK,phase:'A1_shadow_readonly',...identity,source_main_sha:runnerSha,run_id:runId,at_utc:new Date().toISOString(),
    idempotency_key:identity.task_id+':'+identity.head_sha,automatic_merge:false,automatic_deploy:false,automatic_rollback:false,
    signing_admission:false,native_model_calls:0,financial_execution:false,paid:false,tx_hash:null};
  if(!claim.reserved)return {...common,status:claim.status,claim,limitations:['An existing/unknown claim is not deleted or replayed. Reconcile original observation before any new attempt.']};
  // Neither checkout nor import candidate code. Git only reads candidate objects and diffs.
  gitImpl(['fetch','--no-tags','origin',identity.head_sha]);
  const diffBase=gitImpl(['merge-base',runnerSha,identity.head_sha]);if(!SHA.test(diffBase))throw Error('diff_base_required');
  const {policy,trust,snapshot}=collect({base:runnerSha,head:identity.head_sha,taskId:identity.task_id,diffBase});
  const refs=[];try {const head=/^```json\s*\n([\s\S]*?)\n```/.exec(got.data.body||'');const r=JSON.parse(head?.[1]||'{}').notification_reference;if(typeof r==='string')refs.push(r);}catch{}
  const readbacks=[],readbackErrors=[];
  for(const reference of refs)try{readbacks.push(await fetchNotificationReadback(reference,{token}));}catch{readbackErrors.push('notice_readback_unavailable_or_invalid');}
  const evaluation=snapshot.files.length?evaluate({policy,trust,snapshot,notificationReadbacks:readbacks}):null;
  const record={...common,status:snapshot.files.length?'observation_complete_no_authorization':'no_new_diff_no_authorization',diff_base_sha:diffBase,
    policy_sha256:snapshot.policy_sha256,trust_sha256:snapshot.trust_sha256,changed_files:snapshot.files.map(f=>({path:f.path,mode:f.mode,binary:f.binary})),evaluation,
    readback_errors:readbackErrors,attestations_loaded:0,signing_keys_configured:trust.enabled===true&&trust.keys.length>0,
    limitations:['This is a shadow observer. Missing signatures remain missing; no model label grants execution authority.','Only the observation branch is written. Main, candidate code, PR state, wallets and deployments are not modified.','This readback collector does not mint or enroll signing keys. A2 remains blocked.']};
  const artifact=await publishObservation({api,claim,record});return {...record,artifact};
}
if(import.meta.url===`file://${process.argv[1]}`){
  observerContext({ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,runnerSha:process.env.GITHUB_SHA,checkout:git(['rev-parse','HEAD']),repository:process.env.GITHUB_REPOSITORY});
  const e=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  const value=e.pull_request?.number||e.inputs?.pr_number;
  if(!/^[1-9]\d{0,8}$/.test(String(value||'')))throw Error('numeric_pull_required');
  const out='work/patchgate-a1/observation.json';fs.mkdirSync(path.dirname(out),{recursive:true});
  const r=await observe({api:githubApi({token:process.env.GITHUB_TOKEN}),prNumber:Number(value),runnerSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,token:process.env.GITHUB_TOKEN});
  fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n');
  console.log(JSON.stringify({phase:r.phase,status:r.status,head:r.head_sha,artifact:r.artifact||null,automatic_actions:false}));
}
