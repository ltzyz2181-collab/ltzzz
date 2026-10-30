// Trusted-main orchestration; decisions use the configured authenticated authority.
import {createHash} from 'node:crypto';
import {canonical,sha256,subjectFor,classify,scanDiff,TASK} from './patchgate.mjs';
import {preflightA2} from '../patchgate-a2-preflight.mjs';
import {validateCheckRequest} from './patchgate-a2-collector.mjs';
import {mergeDocsOnce,REPOSITORY,controllerMode,controllerMergeSubject} from './patchgate-a2.mjs';
import {createControllerDecisionAuthority,controllerDecisionEvidence,CONTROLLER_MODE} from './controller-decision.mjs';
const ROOT='/repos/'+REPOSITORY,SHA=/^[a-f0-9]{40}$/,HASH=/^[a-f0-9]{64}$/;
export const EXECUTION_WORKFLOW='.github/workflows/patchgate-a2-execute.yml';
const exact=(o,keys)=>!!o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===[...keys].sort().join(',');
export function executionContext({env,checkout}){
  if(env.GITHUB_REPOSITORY!==REPOSITORY||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'
    ||!SHA.test(checkout||'')||env.GITHUB_SHA!==checkout||!/^\d{1,20}$/.test(env.GITHUB_RUN_ID||'')
    ||!/^\d{1,9}$/.test(env.GITHUB_RUN_ATTEMPT||'')||Number(env.GITHUB_RUN_ATTEMPT)<1
    ||env.GITHUB_WORKFLOW_REF!==REPOSITORY+'/'+EXECUTION_WORKFLOW+'@refs/heads/main')throw Error('trusted_main_execution_context_required');
  return {source:checkout,run_id:env.GITHUB_RUN_ID,run_attempt:Number(env.GITHUB_RUN_ATTEMPT)};
}
export function executionRequest(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>4096)throw Error('bounded_public_execution_request_required');
  let r;try{r=JSON.parse(text);}catch{throw Error('execution_request_JSON_invalid');}
  // Controller identity input or the legacy signed-admission request. No overrides.
  return validateCheckRequest(r);
}
export function executionGate({context,request,read,now=Date.now(),preflight=preflightA2}){
  if(!SHA.test(context?.source||''))throw Error('trusted_source_required');
  validateCheckRequest(request);
  const result=preflight({read,sourceCommit:context.source,now}),policy=JSON.parse(read('config/patchgate-a2-reconcile.json'));
  const blockers=[...result.blockers],a=policy.execution_authority;
  if(policy.schema!=='ltzzz.patchgate.a2-reconcile-policy.v1'||policy.task_id!==TASK||policy.financial_execution!==false||typeof policy.automatic_release_enabled!=='boolean')throw Error('fixed_reconciliation_policy_required');
  if(!exact(a,['workflow_path','workflow_id'])||a.workflow_path!==EXECUTION_WORKFLOW||!Number.isSafeInteger(a.workflow_id)||a.workflow_id<1)blockers.push('actual_execution_workflow_not_registered');
  return {enabled:blockers.length===0,blockers,runtime_bundle:result.runtime_bundle,authority:a||null};
}
export function validateExecutionReadEndpoint(endpoint){
  if(typeof endpoint!=='string'||!endpoint.startsWith(ROOT+'/'))throw Error('execution_read_fixed_repository_required');
  const p=endpoint.slice(ROOT.length);
  if(/^\/actions\/runs\/[1-9]\d{0,19}$/.test(p)||/^\/git\/ref\/heads\/patchgate-a2-attestations\/[a-f0-9]{64}$/.test(p)
    ||/^\/contents\/knowledge\/results\/patchgate\/admission\/[a-f0-9]{64}\.json\?ref=[a-f0-9]{40}$/.test(p))return;
  throw Error('execution_read_endpoint_not_allowed');
}
export function executionReadApi({token,fetchImpl=fetch}){
  return async endpoint=>{
    validateExecutionReadEndpoint(endpoint);
    const r=await fetchImpl('https://api.github.com'+endpoint,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(20000)});
    const chunks=[];let size=0;
    if(r.body){for await(const b of r.body){size+=b.length;if(size>400000)throw Error('execution_read_response_too_large');chunks.push(Buffer.from(b));}}
    else{const text=await r.text();if(Buffer.byteLength(text)>400000)throw Error('execution_read_response_too_large');chunks.push(Buffer.from(text));}
    let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{data=null;}return {status:r.status,data};
  };
}
export function verifyExecutionRun(response,{context,authority}){
  const r=response.data;
  if(response.status!==200||String(r?.id)!==context.run_id||r.run_attempt!==context.run_attempt||r.workflow_id!==authority.workflow_id
    ||r.path!==EXECUTION_WORKFLOW||r.event!=='workflow_dispatch'||r.repository?.full_name!==REPOSITORY||r.head_repository?.full_name!==REPOSITORY
    ||r.head_branch!=='main'||r.head_sha!==context.source||r.status!=='in_progress')throw Error('actual_execution_run_identity_mismatch');
}
export async function readCandidateAdmission({api,request,snapshot,checks}){
  const subject=subjectFor(snapshot),key=sha256(TASK+':'+snapshot.base_sha+':'+snapshot.head_sha+':admission');
  // Evidence is outside the commit it authenticates, avoiding self-reference.
  const branch='patchgate-a2-attestations/'+key,path='knowledge/results/patchgate/admission/'+key+'.json';
  const ref=await api(ROOT+'/git/ref/heads/'+branch);
  if(ref.status!==200||ref.data?.ref!=='refs/heads/'+branch||ref.data.object?.type!=='commit'||!SHA.test(ref.data.object.sha||''))throw Error('candidate_admission_ref_missing_or_untrusted');
  const commit=ref.data.object.sha,response=await api(ROOT+'/contents/'+path+'?ref='+commit),f=response.data;
  if(response.status!==200||f?.type!=='file'||f.path!==path||f.encoding!=='base64'||!SHA.test(f.sha||'')||typeof f.content!=='string'||f.content.length>280000)throw Error('candidate_admission_file_unreadable');
  const b64=f.content.replace(/[\r\n]/g,''),bytes=Buffer.from(b64,'base64');
  if(bytes.toString('base64')!==b64||bytes.length!==f.size||!bytes.length||bytes.length>200000||createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex')!==f.sha)throw Error('candidate_admission_file_integrity_failed');
  let e;try{e=JSON.parse(bytes.toString('utf8'));}catch{throw Error('candidate_admission_JSON_invalid');}
  if(!exact(e,['schema','task_id','source_main_sha','candidate_pr','candidate_head','subject_sha256','checks_sha256','attestations'])
    ||e.schema!=='ltzzz.patchgate.a2-admission.v1'||e.task_id!==TASK||e.source_main_sha!==snapshot.base_sha||e.candidate_pr!==request.candidate_pr
    ||e.candidate_head!==snapshot.head_sha||e.subject_sha256!==sha256(canonical(subject))||e.checks_sha256!==checks.checks_sha256
    ||!HASH.test(e.checks_sha256||'')||!Array.isArray(e.attestations)||e.attestations.length<4||e.attestations.length>16
    ||e.attestations.some(a=>!exact(a,['key_id','payload','signature'])||typeof a.key_id!=='string'||typeof a.signature!=='string'||!['author','review','checks'].includes(a.payload?.role)))throw Error('candidate_admission_binding_or_schema_invalid');
  return {attestations:e.attestations,evidence:{path,commit_sha:commit,blob_sha:f.sha,sha256:sha256(bytes),attestation_count:e.attestations.length}};
}
export async function executeA2({context,request,read,snapshotFor,collectChecks,readApi,mergeApi,now=Date.now(),preflight=preflightA2,merge=mergeDocsOnce}){
  const out={schema:'ltzzz.patchgate.a2-execution-report.v1',task_id:TASK,source_commit:context.source,run_id:context.run_id,run_attempt:context.run_attempt,
    candidate_pr:request.candidate_pr,candidate_head:request.candidate_head,at_utc:new Date(now).toISOString(),status:'blocked_before_merge',automatic_merge:false,
    automatic_deploy:false,automatic_rollback:false,financial_execution:false,native_model_calls:0,paid:false,tx_hash:null,automatic_retry:false,mutation_adapter_called:false};
  try{
    const gate=executionGate({context,request,read,now,preflight});out.blockers=gate.blockers;out.runtime_bundle_sha256=gate.runtime_bundle.sha256;
    if(!gate.enabled)return out; // No network or write adapter while default off.
    const config=JSON.parse(read('config/patchgate-a2.json')),controlled=controllerMode(config);
    if(!controlled&&request.schema!=='ltzzz.patchgate.a2-collection-request.v1')throw Error('signed_mode_requires_signed_admission_request');
    verifyExecutionRun(await readApi(ROOT+'/actions/runs/'+context.run_id),{context,authority:gate.authority});
    const {snapshot,policy,trust}=await snapshotFor({base:context.source,head:request.candidate_head});
    if(snapshot.repository!==REPOSITORY||snapshot.task_id!==TASK||snapshot.base_sha!==context.source||snapshot.head_sha!==request.candidate_head
      ||canonical(policy)!==canonical(JSON.parse(read('config/patch-policy.json')))||canonical(trust)!==canonical(JSON.parse(read('config/patchgate-trust.json'))))throw Error('trusted_source_snapshot_mismatch');
    const risk=classify(policy,snapshot.files),findings=scanDiff(policy,snapshot.files);
    if(risk.level!=='L0'||risk.modifies_own_checks||findings.length||!snapshot.files.length||snapshot.files.some(f=>f.mode!=='100644'||f.binary||!f.path.endsWith('.md')))throw Error('ordinary_L0_markdown_only');
    const checks=await collectChecks({request,baseSha:context.source,authority:JSON.parse(read('config/patchgate-a2-collector.json')).check_authority,now});
    if(checks.passed!==true||checks.checker_base_sha!==context.source||checks.checks_sha256!==sha256(canonical(checks.check_runs)))throw Error('actual_trusted_checks_required');
    let controllerDecision,admission={attestations:[]};
    if(!controlled){admission=await readCandidateAdmission({api:readApi,request,snapshot,checks});out.admission=admission.evidence;}
    const runResponse=await readApi(ROOT+'/actions/runs/'+context.run_id);
    verifyExecutionRun(runResponse,{context,authority:gate.authority});
    if(controlled){
      const a=config.controller_authority,r=runResponse.data;
      if(a.workflow_id!==gate.authority.workflow_id||a.workflow_path!==gate.authority.workflow_path
        ||!a.github_actor_ids.includes(r.actor?.id))throw Error('registered_controller_workflow_actor_required');
      const authorize=createControllerDecisionAuthority({controllerIds:[a.controller_id],authenticate:async()=>({verified:true,controller_id:a.controller_id,
        identity_evidence_sha256:sha256(canonical({source:context.source,run_id:context.run_id,run_attempt:context.run_attempt,workflow_id:r.workflow_id,actor_id:r.actor.id}))})});
      controllerDecision=await authorize({subject:controllerMergeSubject({subject:subjectFor(snapshot),runnerSha:context.source,runtimeBundleSha256:gate.runtime_bundle.sha256,
        prNumber:request.candidate_pr,runId:context.run_id,checkRuns:checks.check_runs}),now});
      out.authorization_mode=CONTROLLER_MODE;out.controller_decision=controllerDecisionEvidence(controllerDecision);
    }
    out.mutation_adapter_called=true;
    // Both authority modes use the same expected-head, stop latch, L0 full-tree
    // readback and durable failure handling before any mutation is accepted.
    const result=await merge({api:mergeApi,config,registry:JSON.parse(read('config/patchgate-executors.json')),
      policy,trust,snapshot,attestations:admission.attestations,checkRuns:checks.check_runs,runnerSha:context.source,runtimeBundleSha256:gate.runtime_bundle.sha256,
      prNumber:request.candidate_pr,runId:context.run_id,controllerDecision,now});
    out.status=result.status;out.automatic_merge=result.automatic_merge===true;out.operation_result=result;
  }catch(e){out.status=out.mutation_adapter_called?'executor_failed_reconcile_no_retry':'blocked_before_merge';out.error=/^[A-Za-z0-9_]+$/.test(e.message)?e.message:'executor_failure_details_not_exported';}
  return out;
}
