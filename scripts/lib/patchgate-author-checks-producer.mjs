// Cloud-side production primitives only. No private key, enrollment or deployment.
import {canonical,sha256,subjectFor,authenticate,classify,scanDiff,TASK} from './patchgate.mjs';
import {validateExecutorRegistry,A2_MODEL_SIGNERS} from './patchgate-a2.mjs';
import {collectTrustedChecks,validateCollectionRequest} from './patchgate-a2-collector.mjs';
const HASH=/^[a-f0-9]{64}$/,SHA=/^[a-f0-9]{40}$/;
const exact=(x,keys)=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(',');
const doc=p=>typeof p==='string'&&/^(?:README\.md|docs\/[A-Za-z0-9_./-]+\.md)$/.test(p)&&!p.split('/').some(x=>!x||x==='.'||x==='..');
const validUTC=t=>typeof t==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(t)&&Number.isFinite(Date.parse(t));
const safeError=e=>/^[A-Za-z0-9_]+$/.test(e?.message||'')?e.message:'producer_unavailable_no_details';

// The injected signer is a service capability backed by a cloud-held,
// non-exportable key. It has descriptor()/sign(); never privateKey/export().
export function createAuthorChecksProducer({config={enabled:false},registry,trust,executorId,keyId,signer,generationStore,readCandidateFile,checksApi,now=Date.now}={}){
 const enabled=()=>config?.schema==='ltzzz.patchgate.author-checks-policy.v1'&&config.enabled===true;
 const blocked=role=>({task_id:TASK,role,status:'blocked_producer_disabled',signature_issued:false,new_model_calls:0,financial_execution:false,paid:false,tx_hash:null});
 async function binding(role){
  if(!validateExecutorRegistry({registry,trust}))throw Error('registered_executor_required');
  const e=registry.executors.find(e=>e.id===executorId),k=trust.keys.find(k=>k.id===keyId&&k.executor===executorId&&k.enabled===true);
  if(!e||e.signing_enabled!==true||!k||!e.roles.includes(role)||!k.roles.includes(role)||e.provider!==k.provider)throw Error('registered_role_required');
  // Both Qwen and Doubao remain mandatory independent reviewers. The
  // native author must therefore be a separately registered third provider.
  if(role==='author'&&(!['deepseek','xai','openai','anthropic','moonshot'].includes(e.provider)||A2_MODEL_SIGNERS.includes(e.provider)))throw Error('independent_native_author_provider_required');
  if(role==='checks'&&e.provider!=='github_actions')throw Error('independent_infrastructure_checks_provider_required');
  if(!signer||typeof signer.descriptor!=='function'||typeof signer.sign!=='function'||'privateKey' in signer||'private_key' in signer||typeof signer.export==='function')throw Error('nonexportable_cloud_signer_required');
  const d=await signer.descriptor();
  if(!HASH.test(d?.source_sha256||'')||e.source_deployment_verified!==true||!Array.isArray(e.allowed_signer_source_sha256)||!e.allowed_signer_source_sha256.includes(d.source_sha256)
    ||typeof e.cloud_account_binding!=='string'||!e.cloud_account_binding||d.cloud_account_binding!==e.cloud_account_binding
    ||!HASH.test(e.deployment_evidence_sha256||'')||d.deployment_evidence_sha256!==e.deployment_evidence_sha256)throw Error('registered_signer_source_and_deployment_required');
  if(!HASH.test(config.expected_signer_source_sha256||'')||config.expected_signer_source_sha256!==d.source_sha256)throw Error('fixed_audited_producer_source_required');
  return {e,k,d};
 }
 function snapshotContext(snapshot,policy){
  const subject=subjectFor(snapshot),risk=classify(policy,snapshot.files);
  if(subject.task_id!==TASK||risk.level!=='L0'||risk.modifies_own_checks||scanDiff(policy,snapshot.files).length||snapshot.files.length>10
    ||snapshot.files.some(f=>!doc(f.path)||f.mode!=='100644'||f.binary||typeof f.diff!=='string')
    ||snapshot.policy_sha256!==sha256(canonical(policy))||snapshot.trust_sha256!==sha256(canonical(trust)))throw Error('bound_ordinary_L0_snapshot_required');
  return subject;
 }
 async function seal(payload,b){
  payload.signer_source_sha256=b.d.source_sha256;
  payload.signer_cloud_account_binding=b.d.cloud_account_binding;
  payload.signer_deployment_evidence_sha256=b.d.deployment_evidence_sha256;
  const signature=await signer.sign({key_id:keyId,canonical_bytes:Buffer.from(canonical(payload)),operation_id:sha256(TASK+':'+payload.subject.head_sha+':'+payload.role+':'+keyId)});
  const record={key_id:keyId,payload,signature};
  const verified=authenticate(record,{trust,subject:payload.subject,role:payload.role,now:now(),maxAge:300});
  if(!verified||verified.provider!==b.e.provider||verified.executor!==b.e.id)throw Error('cloud_signature_public_verification_failed');
  return record;
 }
 const failure=(role,e)=>({task_id:TASK,role,status:'failed_or_uncertain_no_replay',error:safeError(e),signature_issued:false,automatic_retry:false,new_model_calls:0,financial_execution:false,paid:false,tx_hash:null});
 return {
  async author({snapshot,policy,generation_id}={}){
   if(!enabled())return blocked('author');
   try{
    const b=await binding('author'),subject=snapshotContext(snapshot,policy),time=now();
    if(typeof generation_id!=='string'||!/^[-A-Za-z0-9_]{8,128}$/.test(generation_id)||!generationStore||typeof generationStore.get!=='function'||typeof readCandidateFile!=='function')throw Error('server_owned_generation_ledger_required');
    // Response and publication MUST come from the signer's internal durable
    // ledger. Public request fields or a model's self-description are not used.
    const r=await generationStore.get(generation_id);
    if(!r||r.schema!=='ltzzz.patchgate.native-author-record.v1'||r.origin!=='native_provider_response_in_same_service'
      ||r.generation_id!==generation_id||r.provider!==b.e.provider||r.executor_id!==b.e.id||r.task_id!==TASK||r.source_main_sha!==subject.base_sha
      ||r.metadata_source!=='provider_response'||r.generation_verified!==true||r.finish_reason!=='stop'||typeof r.model!=='string'||!r.model
      ||typeof r.provider_response_id!=='string'||!r.provider_response_id||typeof r.output!=='string'||Buffer.byteLength(r.output)>200000
      ||r.output_sha256!==sha256(r.output)||!validUTC(r.at_utc)||Date.parse(r.at_utc)>time||time-Date.parse(r.at_utc)>86400000)throw Error('native_author_generation_unverified');
    const p=r.publication;
    if(!p||p.kind!=='same_service_candidate_publisher'||p.generation_id!==generation_id||p.head_sha!==subject.head_sha||p.source_main_sha!==subject.base_sha
      ||!validUTC(p.at_utc)||Date.parse(p.at_utc)<Date.parse(r.at_utc)||Date.parse(p.at_utc)>time)throw Error('native_generation_publication_binding_required');
    let output;try{output=JSON.parse(r.output);}catch{throw Error('native_author_output_schema');}
    if(!exact(output,['files'])||!Array.isArray(output.files)||output.files.length!==snapshot.files.length||new Set(output.files.map(f=>f?.path)).size!==output.files.length)throw Error('native_author_output_schema');
    const artifacts=[];
    for(const f of [...output.files].sort((a,b)=>String(a?.path).localeCompare(String(b?.path)))){
     if(!exact(f,['path','content'])||!doc(f.path)||typeof f.content!=='string'||!snapshot.files.some(s=>s.path===f.path)||Buffer.byteLength(f.content)>100000)throw Error('native_author_output_schema');
     const bytes=await readCandidateFile({path:f.path,head_sha:subject.head_sha,source_main_sha:subject.base_sha});
     if(!(bytes instanceof Uint8Array)||!Buffer.from(bytes).equals(Buffer.from(f.content)))throw Error('candidate_bytes_differ_from_native_author_output');
     artifacts.push({path:f.path,sha256:sha256(bytes)});
    }
    const artifact_sha256=sha256(canonical(artifacts));
    if(p.artifact_sha256!==artifact_sha256)throw Error('native_publication_artifact_hash_mismatch');
    const payload={role:'author',subject,at_utc:new Date(time).toISOString(),generation_verified:true,metadata_source:'provider_response',model:r.model,finish_reason:r.finish_reason,
      provider_response_id:r.provider_response_id,output_sha256:r.output_sha256,artifact_sha256,generation_reference_sha256:sha256(generation_id),generation_at_utc:r.at_utc,publication_at_utc:p.at_utc};
    return {task_id:TASK,status:'native_author_signature_created_not_admitted',attestation:await seal(payload,b),signature_issued:true,new_model_calls:0,financial_execution:false,paid:false,tx_hash:null};
   }catch(e){return failure('author',e);}
  },
  async checks({snapshot,policy,request,authority}={}){
   if(!enabled())return blocked('checks');
   try{
    const b=await binding('checks'),subject=snapshotContext(snapshot,policy),time=now();
    validateCollectionRequest(request);
    if(request.candidate_head!==subject.head_sha||request.task_id!==subject.task_id||typeof checksApi!=='function')throw Error('bound_live_checks_request_required');
    // This performs original collector HTTP/run/job/app/event/workflow checks;
    // there is intentionally no API taking a caller-provided success collection.
    const collection=await collectTrustedChecks({api:checksApi,request,baseSha:subject.base_sha,authority,now:time});
    if(collection?.passed!==true||collection.status!=='trusted_base_check_observed_unsigned'||collection.checker_base_sha!==subject.base_sha
      ||!Array.isArray(collection.check_runs)||!collection.check_runs.length||collection.checks_sha256!==sha256(canonical(collection.check_runs))
      ||collection.check_runs.some(c=>c.head_sha!==subject.head_sha||c.base_sha!==subject.base_sha||c.status!=='completed'||c.conclusion!=='success'))throw Error('actual_trusted_checks_required');
    const payload={role:'checks',subject,at_utc:new Date(time).toISOString(),passed:true,checker_base_sha:collection.checker_base_sha,checks_sha256:collection.checks_sha256};
    return {task_id:TASK,status:'infrastructure_checks_signature_created_not_admitted',attestation:await seal(payload,b),check_runs:collection.check_runs,
      signature_issued:true,new_model_calls:0,financial_execution:false,paid:false,tx_hash:null};
   }catch(e){return failure('checks',e);}
  }
 };
}
