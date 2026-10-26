// Execute this module only from the reviewed base. Candidate files are data.
import {createHash} from 'node:crypto';
import {canonical, sha256, TASK} from './patchgate.mjs';
import {REPOSITORY, signExecutorAttestation} from './patchgate-a2.mjs';
import {A2_BUNDLE_FILES, bundleDigest} from '../patchgate-a2-preflight.mjs';

const ROOT='/repos/'+REPOSITORY, SHA=/^[a-f0-9]{40}$/;
const integer=n=>Number.isSafeInteger(n)&&n>0;
const artifactPath=p=>typeof p==='string'&&/^knowledge\/results\/patchgate\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.md$/.test(p);
const workflowPath=p=>typeof p==='string'&&/^\.github\/workflows\/[A-Za-z0-9_-]+\.yml$/.test(p);
const safeTime=t=>typeof t==='string'&&Number.isFinite(Date.parse(t));
const gitBlob=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
export const BASE_CHECK_WORKFLOW='.github/workflows/patchgate-a2-base-checks.yml';

export function validateCollectionRequest(request){
  if(request?.schema!=='ltzzz.patchgate.a2-collection-request.v1'||request.task_id!==TASK
    ||!integer(request.candidate_pr)||request.candidate_pr>999999999||!SHA.test(request.candidate_head||'')
    ||!integer(request.audit_pr)||request.audit_pr>999999999||!artifactPath(request.audit_path))throw Error('invalid_A2_collection_request');
  if(Object.keys(request).sort().join(',')!==['schema','task_id','candidate_pr','candidate_head','audit_pr','audit_path'].sort().join(','))throw Error('unexpected_collection_request_fields');
  return request;
}

// Read-only fixed-origin surface. No merge, branch protection mutation, private
// configuration, arbitrary paths, raw HTML, callbacks or redirects are allowed.
export function validateCollectorEndpoint(endpoint){
  if(typeof endpoint!=='string'||!endpoint.startsWith(ROOT+'/'))throw Error('collector_fixed_repository_required');
  const route=endpoint.slice(ROOT.length),number='[1-9]\\d{0,8}';
  if(new RegExp('^/pulls/'+number+'$').test(route)||route==='/git/ref/heads/main'||route==='/branches/main/protection')return;
  if(new RegExp('^/pulls/'+number+'/files\\?per_page=100&page=[1-9]$').test(route))return;
  if(/^\/commits\/[a-f0-9]{40}\/check-runs\?filter=latest&per_page=100&page=[1-9]$/.test(route))return;
  if(/^\/actions\/(?:runs|jobs)\/[1-9]\d{0,19}$/.test(route))return;
  const content=/^\/contents\/(.+)\?ref=([a-f0-9]{40})$/.exec(route);
  if(content&&(A2_BUNDLE_FILES.includes(content[1])||artifactPath(content[1])||content[1]===BASE_CHECK_WORKFLOW))return;
  throw Error('collector_endpoint_not_allowed');
}

export function collectorGithubApi({token,fetchImpl=fetch}={}){
  return async endpoint=>{
    validateCollectorEndpoint(endpoint);
    const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
    if(token)headers.Authorization='Bearer '+token;
    const r=await fetchImpl('https://api.github.com'+endpoint,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(20000)});
    const chunks=[];let size=0;
    if(r.body){for await(const chunk of r.body){size+=chunk.length;if(size>3000000)throw Error('collector_response_too_large');chunks.push(Buffer.from(chunk));}}
    else {const text=await r.text();if(Buffer.byteLength(text)>3000000)throw Error('collector_response_too_large');chunks.push(Buffer.from(text));}
    let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{data=null;}
    // Never persist response headers, credential values, or error bodies.
    return {status:r.status,data};
  };
}

function immutableFile(response,path){
  const f=response?.data;
  if(response?.status!==200||f?.type!=='file'||f.path!==path||f.encoding!=='base64'||!SHA.test(f.sha||'')||typeof f.content!=='string'||f.content.length>300000)throw Error('immutable_file_unreadable');
  const b64=f.content.replace(/[\r\n]/g,''),bytes=Buffer.from(b64,'base64');
  if(bytes.toString('base64')!==b64||bytes.length!==f.size||!bytes.length||bytes.length>200000||gitBlob(bytes)!==f.sha)throw Error('immutable_file_integrity_failed');
  return {bytes,sha:f.sha};
}
function validatePR(response,{number,head,base,open=false}){
  const p=response?.data;
  if(response?.status!==200||p?.number!==number||p.head?.repo?.full_name!==REPOSITORY||p.base?.repo?.full_name!==REPOSITORY||p.base.ref!=='main'
    ||!SHA.test(p.head.sha||'')||!SHA.test(p.base.sha||'')||!['OWNER','MEMBER','COLLABORATOR'].includes(p.author_association)
    ||(head&&p.head.sha!==head)||(open&&(p.state!=='open'||p.merged===true)))throw Error('collector_PR_identity_changed_or_untrusted');
  if(base&&p.base.sha!==base)throw Error('collector_PR_base_stale_requalify');
  return p;
}
async function stablePR(api,number,head){return validatePR(await api(ROOT+'/pulls/'+number),{number,head});}
async function pages(api,endpoint,field){
  const rows=[];
  for(let n=1;n<=9;n++){
    const r=await api(endpoint+n);
    const list=field?r.data?.[field]:r.data;
    if(r.status!==200||!Array.isArray(list)||list.length>100)throw Error('collector_list_unreadable');
    rows.push(...list);
    if(list.length<100)return rows;
  }
  throw Error('collector_pagination_limit');
}

export async function collectClaudeAudit({api,auditPR,auditPath,now=Date.now()}){
  if(!integer(auditPR)||auditPR>999999999||!artifactPath(auditPath)||!Number.isFinite(now))throw Error('invalid_external_audit_context');
  const p=await stablePR(api,auditPR),head=p.head.sha;
  const files=await pages(api,ROOT+'/pulls/'+auditPR+'/files?per_page=100&page=');
  const match=files.filter(f=>f.filename===auditPath&&['added','modified'].includes(f.status));
  if(match.length!==1)throw Error('audit_artifact_must_be_changed_in_selected_PR');
  const file=immutableFile(await api(ROOT+'/contents/'+auditPath+'?ref='+head),auditPath);
  if(match[0].sha!==file.sha)throw Error('audit_PR_file_blob_mismatch');
  const body=file.bytes.toString('utf8');
  if(!Buffer.from(body).equals(file.bytes)||file.bytes.length>100000)throw Error('audit_UTF8_or_size_invalid');
  let meta;try{meta=JSON.parse(/^```json\r?\n([\s\S]*?)\r?\n```/.exec(body)?.[1]||'null');}catch{meta=null;}
  const validMetadata=meta?.schema==='ltzzz.external-stage-audit.v1'&&meta.task_id===TASK&&meta.phase==='A2'&&meta.seat==='claude'
    &&['approve','revise','reject'].includes(meta.verdict)&&SHA.test(meta.reviewed_source_commit||'')&&/^[a-f0-9]{64}$/.test(meta.runtime_bundle_sha256||'');
  let bundle=null;
  if(validMetadata){
    // The manifest and digest implementation are BASE code. Never import or run
    // scripts returned by the reviewed commit; only hash their raw bytes.
    const bytes=new Map();
    for(const name of A2_BUNDLE_FILES)bytes.set(name,immutableFile(await api(ROOT+'/contents/'+name+'?ref='+meta.reviewed_source_commit),name).bytes);
    bundle=bundleDigest({read:name=>bytes.get(name)});
  }
  const after=await stablePR(api,auditPR,head);
  if(after.user?.login!==p.user?.login||after.user?.id!==p.user?.id||!p.user?.login||!integer(p.user?.id))throw Error('audit_submitter_changed');
  return {schema:'ltzzz.external-audit-pr-readback.v1',source:'github_rest_immutable_pr_file',repository:REPOSITORY,
    pr_http_status:200,file_http_status:200,pr_number:auditPR,pr_head_sha:head,pr_url:'https://github.com/'+REPOSITORY+'/pull/'+auditPR,
    submitter_login:p.user.login,submitter_id:String(p.user.id),artifact:{path:auditPath,blob_sha:file.sha,sha256:sha256(file.bytes)},
    body_base64:file.bytes.toString('base64'),fetched_at_utc:new Date(now).toISOString(),
    reviewed_source_commit:validMetadata?meta.reviewed_source_commit:null,reviewed_bundle_sha256:bundle?.sha256||null,
    reviewed_bundle_verification:validMetadata&&bundle.sha256===meta.runtime_bundle_sha256?'trusted_base_fixed_manifest':'unverified_missing_metadata_or_bundle_mismatch',
    machine_readable_verdict:validMetadata?meta.verdict:null,native_authorship_verified:false,counts_toward_model_quorum:false};
}

export function assessBaseProtection(response,{requiredCheck='patchgate-a2-base-checks',appId=15368}={}){
  const p=response?.data,checks=p?.required_status_checks?.checks;
  const conditions={readable:response?.status===200,strict:p?.required_status_checks?.strict===true,admins_enforced:p?.enforce_admins?.enabled===true,
    forced_push_disabled:p?.allow_force_pushes?.enabled===false,deletion_disabled:p?.allow_deletions?.enabled===false,
    expected_app_check:Array.isArray(checks)&&checks.some(c=>c.context===requiredCheck&&c.app_id===appId)};
  return {strategy:'strict_protected_branch_no_admin_bypass',http_status:response?.status??null,conditions,
    configuration_observed:Object.values(conditions).every(Boolean),atomic_base_race_verified:false,
    status:Object.values(conditions).every(Boolean)?'configured_requires_real_stale_base_rejection':'blocked_unreadable_or_missing_protection',
    expected_base_merge_api_supported:false};
}

// A workflow ID is assigned by GitHub only after deployment. The fixed main
// policy supplies it; a PR or request cannot register a check by choosing its name.
export async function collectTrustedChecks({api,request,baseSha,authority,now=Date.now(),maxAge=86400}){
  validateCollectionRequest(request);
  if(!SHA.test(baseSha||'')||!Number.isFinite(now)||!Number.isSafeInteger(maxAge)||maxAge<1)throw Error('invalid_checks_context');
  const p=validatePR(await api(ROOT+'/pulls/'+request.candidate_pr),{number:request.candidate_pr,head:request.candidate_head,base:baseSha,open:true});
  if(!authority||authority.workflow_path!==BASE_CHECK_WORKFLOW||!integer(authority.workflow_id)||authority.app_id!==15368||authority.job_name!=='patchgate-a2-base-checks'
    ||!/^[a-f0-9]{64}$/.test(authority.workflow_sha256||''))
    return {passed:false,status:'trusted_base_check_workflow_not_registered',check_runs:[],diagnostic_only:true};
  const rows=await pages(api,ROOT+'/commits/'+request.candidate_head+'/check-runs?filter=latest&per_page=100&page=','check_runs');
  const selected=rows.filter(c=>c.name===authority.job_name);
  if(selected.length!==1)return {passed:false,status:'missing_or_ambiguous_required_check',check_runs:[],diagnostic_only:true};
  const c=selected[0],m=new RegExp('^https://github.com/'+REPOSITORY+'/actions/runs/([1-9]\\d{0,19})/job/([1-9]\\d{0,19})$').exec(c.details_url||'');
  if(c.app?.id!==authority.app_id||c.head_sha!==request.candidate_head||c.status!=='completed'||c.conclusion!=='success'||!m
    ||!safeTime(c.completed_at)||Date.parse(c.completed_at)>now||now-Date.parse(c.completed_at)>maxAge*1000)throw Error('untrusted_incomplete_or_stale_check');
  const r=await api(ROOT+'/actions/runs/'+m[1]),j=await api(ROOT+'/actions/jobs/'+m[2]);
  const run=r.data,job=j.data,boundPR=run?.pull_requests?.filter(x=>x.number===request.candidate_pr&&x.head?.sha===p.head.sha&&x.base?.sha===baseSha);
  // pull_requests metadata may describe a newer base after the run. The immutable
  // expanded job step records the BASE actually used by the reviewed workflow.
  const boundSteps=job?.steps?.filter(s=>s.name==='BASE='+baseSha+' HEAD='+p.head.sha&&s.status==='completed'&&s.conclusion==='success');
  if(r.status!==200||j.status!==200||String(run?.id)!==m[1]||String(job?.id)!==m[2]||String(job.run_id)!==m[1]
    ||run.workflow_id!==authority.workflow_id||run.path!==BASE_CHECK_WORKFLOW||run.event!=='pull_request'||run.repository?.full_name!==REPOSITORY
    ||run.head_repository?.full_name!==REPOSITORY||run.head_sha!==p.head.sha||run.check_suite_id!==c.check_suite?.id
    ||run.status!=='completed'||run.conclusion!=='success'||!Number.isSafeInteger(run.run_attempt)||run.run_attempt<1
    ||job.run_attempt!==run.run_attempt||job.head_sha!==p.head.sha||job.name!==authority.job_name||job.status!=='completed'||job.conclusion!=='success'
    ||boundPR?.length!==1||boundSteps?.length!==1)throw Error('check_workflow_job_or_base_identity_mismatch');
  const mainFile=immutableFile(await api(ROOT+'/contents/'+BASE_CHECK_WORKFLOW+'?ref='+baseSha),BASE_CHECK_WORKFLOW);
  const candidateFile=immutableFile(await api(ROOT+'/contents/'+BASE_CHECK_WORKFLOW+'?ref='+p.head.sha),BASE_CHECK_WORKFLOW);
  if(sha256(mainFile.bytes)!==authority.workflow_sha256)throw Error('registered_check_workflow_digest_changed');
  if(mainFile.sha!==candidateFile.sha)throw Error('candidate_changed_its_own_check_workflow');
  const final=validatePR(await api(ROOT+'/pulls/'+request.candidate_pr),{number:request.candidate_pr,head:p.head.sha,base:baseSha,open:true});
  const main=await api(ROOT+'/git/ref/heads/main');
  if(main.status!==200||main.data?.ref!=='refs/heads/main'||main.data.object?.sha!==final.base.sha)throw Error('checks_base_moved_requalify');
  const checkRuns=[{name:c.name,head_sha:c.head_sha,status:c.status,conclusion:c.conclusion,check_run_id:c.id,app_id:c.app.id,workflow_id:run.workflow_id,
    workflow_path:run.path,run_id:m[1],job_id:m[2],run_attempt:run.run_attempt,base_sha:baseSha,workflow_blob_sha:mainFile.sha}];
  return {passed:true,status:'trusted_base_check_observed_unsigned',check_runs:checkRuns,checks_sha256:sha256(canonical(checkRuns)),checker_base_sha:baseSha,
    fetched_at_utc:new Date(now).toISOString(),diagnostic_only:true,unselected_check_count:rows.length-selected.length};
}

// Optional only after separately verified key provisioning. Collector metadata
// is never itself accepted as an Ed25519 signature.
export function signCollectedChecks({collection,subject,registry,trust,executorId,keyId,privateKey,atUTC}){
  if(collection?.passed!==true||collection.checker_base_sha!==subject?.base_sha||collection.checks_sha256!==sha256(canonical(collection.check_runs))
    ||collection.check_runs.some(c=>c.head_sha!==subject.head_sha))throw Error('verified_bound_checks_required');
  const e=registry?.executors?.find(e=>e.id===executorId);
  if(e?.provider!=='github_actions')throw Error('infrastructure_signer_required');
  return signExecutorAttestation({registry,trust,executorId,keyId,privateKey,payload:{role:'checks',subject,at_utc:atUTC,passed:true,
    checker_base_sha:collection.checker_base_sha,checks_sha256:collection.checks_sha256}});
}

export async function collectA2Readiness({api,request,baseSha,authority,now=Date.now()}){
  validateCollectionRequest(request);
  const result={schema:'ltzzz.patchgate.a2-collection.v1',task_id:TASK,source_main_sha:baseSha,candidate_pr:request.candidate_pr,candidate_head:request.candidate_head,
    at_utc:new Date(now).toISOString(),checks:null,claude_audit:null,base_protection:null,errors:[],signed:false,
    automatic_merge:false,automatic_deploy:false,financial_execution:false,native_model_calls:0,paid:false,tx_hash:null};
  for(const [name,operation] of [['checks',()=>collectTrustedChecks({api,request,baseSha,authority,now})],['claude_audit',()=>collectClaudeAudit({api,auditPR:request.audit_pr,auditPath:request.audit_path,now})],
    ['base_protection',async()=>assessBaseProtection(await api(ROOT+'/branches/main/protection'))]]){
    try{result[name]=await operation();}catch(error){result.errors.push({component:name,code:/^[A-Za-z0-9_]+$/.test(error.message)?error.message:'collector_operation_failed'});}
  }
  result.status='observation_only_not_A2_admission';return result;
}
