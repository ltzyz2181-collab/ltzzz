// A2 draft. This module is loaded only from an audited main commit, never PR code.
import {createPrivateKey, createPublicKey, createHash, sign} from 'node:crypto';
import {authenticate, canonical, evaluate, sha256, subjectFor, TASK, validateTrust} from './patchgate.mjs';
import {DOCS_BASE_STRATEGY,A2_STOP_REF,prepareDocsReadback,verifyDocsMerge,validDocsReadback} from './patchgate-a2-readback.mjs';

export const REPOSITORY='ltzyz2181-collab/ltzzz';
const ROOT='/repos/'+REPOSITORY, SHA=/^[a-f0-9]{40}$/, HASH=/^[a-f0-9]{64}$/;
const ID=/^[A-Z0-9][A-Z0-9_-]{6,80}$/, BRANCH='patchgate-a2-actions/';
const only=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===[...keys].sort().join(',');
const actor=a=>a&&typeof a.login==='string'&&!!a.login&&/^\d+$/.test(String(a.id||''));
export const A2_MODEL_SIGNERS=Object.freeze(['aliyun_dashscope','volcengine_ark']);
const CLAUDE_CHANNEL=Object.freeze({kind:'repository_pr_advisory',required_before_rollout:false,signing_provider:'github_actions',proof_role:'external_audit_readback',native_authorship_verified:false,counts_toward_model_quorum:false,admission_authority:'none_shared_github_login'});

// Advisory integrity helper only. An infrastructure signature proves a hash-bound
// PR/file readback, not that Anthropic or owner authored it. C1: no admission use.
export function externalAuditProofMatches({record,trust,readbacks,subject,now,maxAge=86400}) {
  try {
    if(!Number.isFinite(now)||!Number.isSafeInteger(maxAge)||maxAge<1||!Array.isArray(readbacks))return false;
    const proof=authenticate(record,{trust,subject,role:'external_audit_readback',now,maxAge});
    if(proof?.provider!=='github_actions')return false;
    const p=proof.payload,r=readbacks.find(r=>sha256(canonical(r))===p.readback_sha256);
    if(!r||r.schema!=='ltzzz.external-audit-pr-readback.v1'||r.source!=='github_rest_immutable_pr_file'
      ||r.repository!==REPOSITORY||r.pr_http_status!==200||r.file_http_status!==200
      ||!Number.isSafeInteger(r.pr_number)||r.pr_number<1||!SHA.test(r.pr_head_sha||'')
      ||r.pr_url!=='https://github.com/'+REPOSITORY+'/pull/'+r.pr_number
      ||!actor({login:r.submitter_login,id:r.submitter_id})
      ||!/^knowledge\/results\/patchgate\/[A-Za-z0-9_/-]+\.md$/.test(r.artifact?.path||'')||r.artifact.path.split('/').includes('..')
      ||!SHA.test(r.artifact.blob_sha||'')||!HASH.test(r.artifact.sha256||'')
      ||typeof r.body_base64!=='string'||r.body_base64.length>140000||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.fetched_at_utc||''))return false;
    const bytes=Buffer.from(r.body_base64,'base64'),text=bytes.toString('utf8'),observed=Date.parse(r.fetched_at_utc);
    const blobSHA=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
    if(bytes.toString('base64')!==r.body_base64||!bytes.length||bytes.length>100000||!Buffer.from(text).equals(bytes)
      ||sha256(bytes)!==r.artifact.sha256||blobSHA!==r.artifact.blob_sha||!Number.isFinite(observed)||observed>now||now-observed>maxAge*1000)return false;
    const metadata=/^```json\r?\n([\s\S]*?)\r?\n```/.exec(text);
    const audit=JSON.parse(metadata?.[1]||'null');
    return audit?.schema==='ltzzz.external-stage-audit.v1'&&audit.task_id===subject.task_id&&audit.phase==='A2'&&audit.seat==='claude'
      &&audit.verdict==='approve'&&SHA.test(audit.reviewed_source_commit||'')&&audit.runtime_bundle_sha256===subject.runtime_bundle_sha256
      &&r.reviewed_bundle_sha256===subject.runtime_bundle_sha256&&r.reviewed_source_commit===audit.reviewed_source_commit
      &&r.reviewed_bundle_verification==='trusted_base_fixed_manifest'&&r.native_authorship_verified===false
      &&p.seat==='claude'&&p.channel==='repository_pr_readback'&&p.verdict==='approve'
      &&p.reviewed_source_commit===audit.reviewed_source_commit&&p.artifact_sha256===r.artifact.sha256
      &&p.audit_pr_number===r.pr_number&&p.audit_pr_head_sha===r.pr_head_sha
      &&p.native_authorship_verified===false&&p.counts_toward_model_quorum===false;
  }catch{return false;}
}

// Disabled historical keys also retain their original provider; rotation is not relabeling.
export function validateExecutorRegistry({registry,trust}) {
  if(registry?.schema_version!==1||registry.repository!==REPOSITORY||!Array.isArray(registry.executors)||!validateTrust(trust))return false;
  const map=new Map();
  for(const e of registry.executors){
    if(!e?.id||map.has(e.id)||!e.provider||!Array.isArray(e.signing_key_ids)||!Array.isArray(e.roles))return false;
    map.set(e.id,e);
  }
  for(const k of trust.keys){
    const e=map.get(k.executor);
    if(!e||e.provider!==k.provider||!e.signing_key_ids.includes(k.id)||k.roles.some(r=>!e.roles.includes(r)))return false;
    if(k.enabled===true&&e.signing_enabled!==true)return false;
    if(trust.source_binding_required===true&&k.enabled===true&&(e.source_deployment_verified!==true||!Array.isArray(e.allowed_signer_source_sha256)||k.allowed_signer_source_sha256.some(h=>!e.allowed_signer_source_sha256.includes(h))||e.cloud_account_binding!==k.cloud_account_binding||e.deployment_evidence_sha256!==k.deployment_evidence_sha256))return false;
  }
  for(const e of map.values())if(e.signing_key_ids.some(id=>!trust.keys.some(k=>k.id===id&&k.executor===e.id&&k.provider===e.provider)))return false;
  return true;
}

// This signs an executor attestation, never a wallet transaction. Caller supplies an
// already provisioned in-memory key; no key discovery, disk persistence or enrollment.
export function signExecutorAttestation({registry,trust,executorId,keyId,privateKey,payload}) {
  if(!validateExecutorRegistry({registry,trust}))throw Error('registered_signing_executor_required');
  const k=trust.keys.find(x=>x.id===keyId&&x.executor===executorId&&x.enabled===true);
  if(!k||!k.roles.includes(payload?.role))throw Error('executor_role_not_allowed');
  if(!payload?.subject||!Number.isFinite(Date.parse(payload.at_utc))||Date.parse(payload.at_utc)<Date.parse(k.not_before)||Date.parse(payload.at_utc)>Date.parse(k.not_after))throw Error('valid_attestation_time_subject_required');
  const key=createPrivateKey(privateKey);
  if(key.asymmetricKeyType!=='ed25519'||createPublicKey(key).export({type:'spki',format:'pem'})!==createPublicKey(k.public_key_pem).export({type:'spki',format:'pem'}))throw Error('executor_private_public_key_mismatch');
  return {key_id:keyId,payload,signature:sign(null,Buffer.from(canonical(payload)),key).toString('base64')};
}

// Future high-risk helper only: A2 admits L0 and has no notification bypass.
// Not wired into A0/A1 notificationMatches and not an active L3/A4 gate.
export function notificationActorAllowed({readback,proof,allowlist,authorExecutor}) {
  return Array.isArray(allowlist)&&actor({login:readback?.actor_login,id:readback?.actor_id})
    &&proof?.executor!==authorExecutor&&proof?.payload?.actor_login===readback.actor_login&&proof.payload.actor_id===readback.actor_id
    &&allowlist.some(a=>actor(a)&&a.login===readback.actor_login&&String(a.id)===readback.actor_id&&a.executor===proof.executor);
}

export function sourceBindingsVerified({registry,trust}){return trust?.source_binding_required===true&&validateExecutorRegistry({registry,trust})&&trust.keys.some(k=>k.enabled===true);}

export function validateA2Config(config) {
  if(config?.schema_version!==1||config.task_id!==TASK||config.phase!=='A2'||config.repository!==REPOSITORY||typeof config.enabled!=='boolean'
    ||config.signer_source_binding_required!==true||config.stage_review_scope!=='A2_L0_docs_only'
    ||config.scope!=='ordinary_markdown_only'||canonical(config.allowed_risk_classes)!==canonical(['L0'])||config.merge_method!=='merge'
    ||canonical(config.required_stage_auditors)!==canonical(A2_MODEL_SIGNERS)
    ||canonical(config.required_candidate_review_providers)!==canonical(A2_MODEL_SIGNERS)
    ||canonical(config.claude_audit_channel)!==canonical(CLAUDE_CHANNEL)||!Array.isArray(config.external_stage_audits)
    ||!Array.isArray(config.notification_actors)||config.notification_actors.some(a=>!actor(a)||typeof a.executor!=='string'||!a.executor)
    ||typeof config.base_compare_and_swap_verified!=='boolean'||!Array.isArray(config.stage_audits)||!Array.isArray(config.required_check_names)||!config.required_check_names.length
    ||config.base_fence_strategy!==DOCS_BASE_STRATEGY||config.postmerge_readback_enforced!==true
    ||config.required_check_names.some(x=>typeof x!=='string'||!x)||config.require_all_completed_checks!==true
    ||[config.automatic_deploy,config.automatic_rollback,config.financial_execution].some(v=>v!==false))throw Error('invalid_A2_docs_only_config');
  return config;
}

export function rolloutApproved({config,registry,trust,runnerSha,runtimeBundleSha256,now=Date.now()}) {
  validateA2Config(config);
  if(config.enabled!==true||config.production_signing_keys_provisioned!==true||!sourceBindingsVerified({registry,trust})
    ||!SHA.test(runnerSha||'')||!HASH.test(runtimeBundleSha256||'')||config.runtime_bundle_sha256!==runtimeBundleSha256)return false;
  // Audit signatures live outside the bundle they authenticate. A source commit
  // is metadata, not a self-referential commit containing its own signature.
  const subject={task_id:TASK,phase:'A2',runtime_bundle_sha256:runtimeBundleSha256};
  const proofs=config.stage_audits.map(a=>authenticate(a,{trust,subject,role:'stage_review',now,maxAge:86400})).filter(a=>a?.payload.verdict==='approve'&&SHA.test(a.payload.reviewed_source_commit||'')&&HASH.test(a.payload.artifact_sha256||''));
  // Shared-account Claude PRs remain preserved advisory artifacts. Self-labels,
  // owner-looking comments or infrastructure signatures cannot add model votes.
  return config.required_stage_auditors.every(provider=>proofs.some(p=>p.provider===provider))&&new Set(proofs.map(p=>p.executor)).size>=2;
}

export function checksSatisfied({checkRuns,config,headSha}) {
  if(!Array.isArray(checkRuns)||!checkRuns.length)return false;
  const names=new Set();
  for(const c of checkRuns){
    if(c.head_sha!==headSha||c.status!=='completed'||c.conclusion!=='success'||typeof c.name!=='string')return false;
    names.add(c.name);
  }
  return config.required_check_names.every(name=>names.has(name));
}

// All writes are fixed repo, exact routes and create-only isolated receipts, plus
// one expected-head merge endpoint. No generic file/ref update capability exists.
export function validateA2Request(method,endpoint,body) {
  if(typeof endpoint!=='string'||!endpoint.startsWith(ROOT+'/'))throw Error('A2_fixed_repository_required');
  const route=endpoint.slice(ROOT.length),num='[1-9]\\d{0,8}';
  if(method==='GET'&&body===undefined&&(route==='/git/ref/heads/'+A2_STOP_REF||/^\/git\/commits\/[a-f0-9]{40}$/.test(route)||/^\/git\/trees\/[a-f0-9]{40}\?recursive=1$/.test(route)||/^\/compare\/[a-f0-9]{40}\.\.\.[a-f0-9]{40}$/.test(route)))return;
  if(method==='DELETE'&&route==='/git/refs/heads/'+A2_STOP_REF&&body===undefined)return;
  if(method==='GET'&&body===undefined&&(new RegExp('^/pulls/'+num+'$').test(route)||route==='/git/ref/heads/main'||new RegExp('^/git/ref/heads/'+BRANCH+'[a-f0-9]{64}$').test(route)))return;
  if(method==='POST'&&route==='/git/refs'&&only(body,['ref','sha'])&&(new RegExp('^refs/heads/'+BRANCH+'[a-f0-9]{64}$').test(body.ref||'')||body.ref==='refs/heads/'+A2_STOP_REF)&&SHA.test(body.sha||''))return;
  if(method==='PUT'&&new RegExp('^/pulls/'+num+'/merge$').test(route)&&only(body,['sha','merge_method'])&&SHA.test(body.sha||'')&&body.merge_method==='merge')return;
  const m=/^\/contents\/knowledge\/results\/patchgate\/a2\/([a-f0-9]{64})\.json$/.exec(route);
  if(method==='PUT'&&m&&only(body,['branch','message','content'])&&body.branch===BRANCH+m[1]&&body.message==='A2 action outcome; reconcile before retry'
    &&typeof body.content==='string'&&body.content.length<200000&&/^[A-Za-z0-9+/]*={0,2}$/.test(body.content)){
    const bytes=Buffer.from(body.content,'base64');if(bytes.toString('base64')!==body.content)throw Error('A2_api_request_not_allowed');
    let r;try{r=JSON.parse(bytes.toString('utf8'));}catch{throw Error('A2_api_request_not_allowed');}
    const keys=['schema_version','task_id','head_sha','source_main_sha','phase','pr_number','run_id','at_utc','subject_sha256','status','automatic_merge','automatic_deploy','automatic_rollback','financial_execution','native_model_calls','paid','tx_hash','reservation_retained','merge_operation_confirmed','execution_stop_ref','postmerge_verification','error_code'];
    if(r.merge_operation_confirmed===true)keys.push('merge_commit_sha');
    if(only(r,keys)&&r.schema_version===1&&ID.test(r.task_id||'')&&SHA.test(r.head_sha||'')&&SHA.test(r.source_main_sha||'')&&r.head_sha!==r.source_main_sha
      &&m[1]===sha256(r.task_id+':'+r.head_sha+':merge')&&r.phase==='A2_docs_only'
      &&Number.isSafeInteger(r.pr_number)&&r.pr_number>0&&r.pr_number<=999999999&&typeof r.run_id==='string'&&/^\d{1,20}$/.test(r.run_id)
      &&typeof r.at_utc==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.at_utc)&&Number.isFinite(Date.parse(r.at_utc))
      &&HASH.test(r.subject_sha256||'')&&r.reservation_retained===true
      &&['merged_readback_verified','merge_failed','outcome_unknown_reconcile_no_retry','post_merge_validation_failed_stopped'].includes(r.status)
      &&typeof r.merge_operation_confirmed==='boolean'&&r.execution_stop_ref==='refs/heads/'+A2_STOP_REF
      &&(r.error_code===null||/^[A-Za-z0-9_]{1,100}$/.test(r.error_code||''))
      &&r.automatic_merge===(r.status==='merged_readback_verified')&&(!r.merge_operation_confirmed||SHA.test(r.merge_commit_sha||''))
      &&(r.status!=='merged_readback_verified'||(r.merge_operation_confirmed&&r.error_code===null&&validDocsReadback(r.postmerge_verification,{headSha:r.head_sha,baseSha:r.source_main_sha,mergeSha:r.merge_commit_sha})))
      &&(r.status==='merged_readback_verified'||r.postmerge_verification===null)
      &&(r.status!=='post_merge_validation_failed_stopped'||r.merge_operation_confirmed===true)
      &&(r.status!=='merge_failed'||r.merge_operation_confirmed===false)
      &&r.automatic_deploy===false&&r.automatic_rollback===false&&r.financial_execution===false&&r.native_model_calls===0&&r.paid===false&&r.tx_hash===null)return;
  }
  throw Error('A2_api_request_not_allowed');
}

export function a2GithubApi({token,fetchImpl=fetch}) {
  return async(method,endpoint,body)=>{
    validateA2Request(method,endpoint,body);
    const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
    if(token)headers.Authorization='Bearer '+token;
    const response=await fetchImpl('https://api.github.com'+endpoint,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
    const text=await response.text();if(text.length>2000000)throw Error('A2_response_too_large');
    let data;try{data=JSON.parse(text);}catch{data=null;}
    return {status:response.status,data};
  };
}

function checkedPR(response,{number,headSha,runnerSha}) {
  const p=response?.data;
  if(response?.status!==200||p?.number!==number||p.state!=='open'||p.draft!==false||p.merged===true||p.base?.ref!=='main'||p.base?.sha!==runnerSha
    ||p.base?.repo?.full_name!==REPOSITORY||p.head?.repo?.full_name!==REPOSITORY||p.head.sha!==headSha
    ||!['OWNER','MEMBER','COLLABORATOR'].includes(p.author_association)||p.mergeable!==true||p.mergeable_state!=='clean')throw Error('A2_PR_changed_untrusted_or_not_clean');
  return p;
}
async function currentPR(api,context){
  checkedPR(await api('GET',ROOT+'/pulls/'+context.number),context);
  const main=await api('GET',ROOT+'/git/ref/heads/main');
  if(main.status!==200||main.data?.ref!=='refs/heads/main'||main.data.object?.sha!==context.runnerSha)throw Error('A2_base_moved_requalify');
}
async function releaseStop(api,headSha){
  try{
    const r=await api('GET',ROOT+'/git/ref/heads/'+A2_STOP_REF);
    if(r.status!==200||r.data?.ref!=='refs/heads/'+A2_STOP_REF||r.data.object?.sha!==headSha)return false;
    return (await api('DELETE',ROOT+'/git/refs/heads/'+A2_STOP_REF)).status===204;
  }catch{return false;}
}

export async function mergeDocsOnce({api,config,registry,policy,trust,snapshot,attestations,checkRuns,runnerSha,runtimeBundleSha256,prNumber,runId,now=Date.now()}) {
  // All arguments except PR identity/diff are collected by trusted main code.
  if(!Number.isSafeInteger(prNumber)||prNumber<1||!/^\d+$/.test(runId||''))throw Error('A2_executor_context_required');
  const subject=subjectFor(snapshot),context={number:prNumber,headSha:subject.head_sha,runnerSha};
  if(subject.base_sha!==runnerSha||!rolloutApproved({config,registry,trust,runnerSha,runtimeBundleSha256,now}))return {status:'A2_disabled_or_missing_audited_signers',automatic_merge:false};
  const evaluation=evaluate({policy,trust,snapshot,attestations,now});
  const proofs=attestations.map(a=>authenticate(a,{trust,subject,role:'review',now,maxAge:policy.max_review_age_seconds})).filter(a=>!!a&&a.executor!==evaluation.author_executor&&a.provider!==evaluation.author_provider&&a.payload.verdict==='approve'&&a.payload.generation_verified===true&&a.payload.metadata_source==='provider_response'&&typeof a.payload.model==='string'&&!!a.payload.model&&['stop','end_turn'].includes(a.payload.finish_reason)&&HASH.test(a.payload.output_sha256||''));
  const boundChecks=attestations.map(a=>authenticate(a,{trust,subject,role:'checks',now,maxAge:policy.max_review_age_seconds})).some(a=>!!a&&a.executor!==evaluation.author_executor&&a.payload.passed===true&&a.payload.checker_base_sha===runnerSha&&a.payload.checks_sha256===sha256(canonical(checkRuns)));
  if(!boundChecks||!evaluation.validation_passed||evaluation.risk_class!=='L0'||snapshot.files.some(f=>f.mode!=='100644'||!f.path.endsWith('.md'))
    ||!config.required_candidate_review_providers.every(p=>proofs.some(a=>a.provider===p))||!checksSatisfied({checkRuns,config,headSha:subject.head_sha}))return {status:'A2_admission_blocked',automatic_merge:false,evaluation};
  await currentPR(api,context);
  const approved=await prepareDocsReadback({api,snapshot,policy});
  // Reserve the global stop latch BEFORE any merge. A crashed runner, unknown
  // response, bad post-merge tree or failed receipt cannot leave execution open.
  let stop;
  try{stop=await api('POST',ROOT+'/git/refs',{ref:'refs/heads/'+A2_STOP_REF,sha:subject.head_sha});}
  catch{return {status:'claim_outcome_unknown_reconcile_no_retry',automatic_merge:false,execution_stopped:true};}
  if(stop.status===422){
    const r=await api('GET',ROOT+'/git/ref/heads/'+A2_STOP_REF);
    if(r.status!==200||r.data?.ref!=='refs/heads/'+A2_STOP_REF||!SHA.test(r.data.object?.sha||''))throw Error('A2_stop_422_without_existing_ref');
    return {status:'A2_execution_stopped_reconcile_required',automatic_merge:false,execution_stopped:true};
  }
  if(stop.status!==201||stop.data?.ref!=='refs/heads/'+A2_STOP_REF||stop.data.object?.sha!==subject.head_sha)return {status:'A2_stop_latch_unverified_no_merge',automatic_merge:false,execution_stopped:true};
  const key=sha256(subject.task_id+':'+subject.head_sha+':merge'),branch=BRANCH+key;
  let claim;
  try{claim=await api('POST',ROOT+'/git/refs',{ref:'refs/heads/'+branch,sha:runnerSha});}catch{return {status:'claim_outcome_unknown_reconcile_no_retry',automatic_merge:false,execution_stopped:true};}
  if(claim.status===422){
    const existing=await api('GET',ROOT+'/git/ref/heads/'+branch);
    if(existing.status!==200||existing.data?.ref!=='refs/heads/'+branch||!SHA.test(existing.data.object?.sha||''))throw Error('A2_claim_422_without_existing_ref');
    return {status:'existing_claim_reconcile_no_repeat',automatic_merge:false,branch,stop_latch_released:await releaseStop(api,subject.head_sha)};
  }
  if(claim.status!==201)throw Error('A2_claim_failed');
  const record={schema_version:1,task_id:subject.task_id,head_sha:subject.head_sha,source_main_sha:runnerSha,phase:'A2_docs_only',pr_number:prNumber,run_id:runId,at_utc:new Date(now).toISOString(),
    subject_sha256:sha256(canonical(subject)),status:'outcome_unknown_reconcile_no_retry',automatic_merge:false,automatic_deploy:false,automatic_rollback:false,financial_execution:false,native_model_calls:0,paid:false,tx_hash:null,reservation_retained:true,
    merge_operation_confirmed:false,execution_stop_ref:'refs/heads/'+A2_STOP_REF,postmerge_verification:null,error_code:null};
  let attempted=false;
  try{
    // Re-read after the shared atomic claim. expected-head SHA also protects the
    // merge itself if the author races this final read. Base movement invalidates
    // admission; GitHub has no atomic expected-base merge endpoint (documented).
    await currentPR(api,context);attempted=true;
    const merged=await api('PUT',ROOT+'/pulls/'+prNumber+'/merge',{sha:subject.head_sha,merge_method:'merge'});
    if(merged.status!==200||merged.data?.merged!==true||!SHA.test(merged.data.sha||''))throw Error('A2_merge_not_confirmed');
    Object.assign(record,{merge_operation_confirmed:true,merge_commit_sha:merged.data.sha});
    const read=await api('GET',ROOT+'/pulls/'+prNumber);
    if(read.status!==200||read.data?.number!==prNumber||read.data.merged!==true||read.data.head?.sha!==subject.head_sha||read.data.merge_commit_sha!==merged.data.sha)throw Error('A2_merge_readback_failed');
    const proof=await verifyDocsMerge({api,approved,policy,mergeSha:merged.data.sha});
    Object.assign(record,{status:'merged_readback_verified',automatic_merge:true,postmerge_verification:proof});
  }catch(error){record.status=record.merge_operation_confirmed?'post_merge_validation_failed_stopped':attempted?'outcome_unknown_reconcile_no_retry':'merge_failed';record.error_code=/^[A-Za-z0-9_]{1,100}$/.test(error.message)?error.message:'merge_or_readback_failed';}
  try{
    const saved=await api('PUT',ROOT+'/contents/knowledge/results/patchgate/a2/'+key+'.json',{branch,message:'A2 action outcome; reconcile before retry',content:Buffer.from(JSON.stringify(record,null,2)+'\n').toString('base64')});
    record.receipt_persisted=saved.status===201;
  }catch{record.receipt_persisted=false;}
  const released=record.status==='merged_readback_verified'&&record.receipt_persisted===true?await releaseStop(api,subject.head_sha):false;
  return {...record,branch,automatic_retry:false,stop_latch_released:released,execution_stopped:!released};
}
