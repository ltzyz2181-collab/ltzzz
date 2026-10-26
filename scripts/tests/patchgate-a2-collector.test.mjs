import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {canonical,sha256,TASK} from '../lib/patchgate.mjs';
import {A2_BUNDLE_FILES,bundleDigest} from '../patchgate-a2-preflight.mjs';
import {validateCollectionRequest,validateCollectorEndpoint,collectorGithubApi,collectClaudeAudit,assessBaseProtection,collectTrustedChecks,collectA2Readiness,signCollectedChecks,BASE_CHECK_WORKFLOW} from '../lib/patchgate-a2-collector.mjs';

const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40),ROOT='/repos/ltzyz2181-collab/ltzzz',REPO='ltzyz2181-collab/ltzzz';
const now=Date.parse('2026-10-26T00:00:00Z'),at=new Date(now).toISOString(),PATH='knowledge/results/patchgate/claude-test.md';
const authority={workflow_path:BASE_CHECK_WORKFLOW,workflow_id:100,app_id:15368,job_name:'patchgate-a2-base-checks'};
const request={schema:'ltzzz.patchgate.a2-collection-request.v1',task_id:TASK,candidate_pr:250,candidate_head:B,audit_pr:244,audit_path:PATH};
const read=name=>fs.readFileSync(new URL('../../'+name,import.meta.url));
function contents(path,bytes){return {status:200,data:{path,type:'file',size:bytes.length,encoding:'base64',content:bytes.toString('base64')+'\n',sha:createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex')}};}
function fixture(){
  const bundle=bundleDigest({read});
  const metadata={schema:'ltzzz.external-stage-audit.v1',task_id:TASK,phase:'A2',seat:'claude',verdict:'revise',reviewed_source_commit:A,runtime_bundle_sha256:bundle.sha256};
  const bytes=Buffer.from('```json\n'+JSON.stringify(metadata)+'\n```\nFixture audit.\n');
  const pr=(number,head)=>({number,state:'open',merged:false,head:{sha:head,repo:{full_name:REPO}},base:{ref:'main',sha:A,repo:{full_name:REPO}},author_association:'OWNER',user:{login:'shared-owner',id:42}});
  const state={requests:[],pr:pr(250,B),audit:pr(244,C),file:contents(PATH,bytes),files:null,check:{id:11,name:authority.job_name,head_sha:B,status:'completed',conclusion:'success',completed_at:at,app:{id:15368},details_url:'https://github.com/'+REPO+'/actions/runs/10/job/11',check_suite:{id:22}},
    run:{id:10,workflow_id:100,path:BASE_CHECK_WORKFLOW,event:'pull_request',repository:{full_name:REPO},head_repository:{full_name:REPO},head_sha:B,check_suite_id:22,status:'completed',conclusion:'success',run_attempt:1,pull_requests:[{number:250,head:{sha:B},base:{sha:A}}]},
    job:{id:11,run_id:10,run_attempt:1,head_sha:B,name:authority.job_name,status:'completed',conclusion:'success',steps:[{name:'BASE='+A+' HEAD='+B,status:'completed',conclusion:'success'}]},main:A,
    protection:{status:200,data:{required_status_checks:{strict:true,checks:[{context:authority.job_name,app_id:15368}]},enforce_admins:{enabled:true},allow_force_pushes:{enabled:false},allow_deletions:{enabled:false}}}};
  const api=async endpoint=>{
    validateCollectorEndpoint(endpoint);state.requests.push(endpoint);
    if(endpoint===ROOT+'/pulls/250')return {status:200,data:structuredClone(state.pr)};
    if(endpoint===ROOT+'/pulls/244')return {status:200,data:structuredClone(state.audit)};
    if(endpoint===ROOT+'/pulls/244/files?per_page=100&page=1')return {status:200,data:state.files||[{filename:PATH,status:'added',sha:state.file.data.sha}]};
    if(endpoint===ROOT+'/contents/'+PATH+'?ref='+C)return structuredClone(state.file);
    if(endpoint.startsWith(ROOT+'/contents/')){
      const [,name,ref]=/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)\?ref=(.*)$/.exec(endpoint);
      const bytes=Buffer.from(read(name));return contents(name,ref===B&&state.changedWorkflow?Buffer.concat([bytes,Buffer.from('# changed\n')]):bytes);
    }
    if(endpoint===ROOT+'/commits/'+B+'/check-runs?filter=latest&per_page=100&page=1')return {status:200,data:{check_runs:[structuredClone(state.check)]}};
    if(endpoint===ROOT+'/actions/runs/10')return {status:200,data:structuredClone(state.run)};
    if(endpoint===ROOT+'/actions/jobs/11')return {status:200,data:structuredClone(state.job)};
    if(endpoint===ROOT+'/git/ref/heads/main')return {status:200,data:{ref:'refs/heads/main',object:{sha:state.main}}};
    if(endpoint===ROOT+'/branches/main/protection')return state.protection;
    throw Error('fixture_unexpected_route');
  };
  return {state,api,bundle,metadata};
}
test('collection accepts only the original task and exact public identities, never signer/authority overrides',()=>{
  assert.equal(validateCollectionRequest(request),request);
  for(const change of [{task_id:'OTHER-TASK'},{candidate_head:'main'},{candidate_pr:0},{candidate_pr:'250'},{audit_pr:1e12},{audit_path:'knowledge/results/patchgate/../evil.md'},{audit_path:'knowledge/results/patchgate//evil.md'},{audit_path:'knowledge/results/patchgate/a%2f.md'},{token:'nope'},{authority},{signing_enabled:true}])assert.throws(()=>validateCollectionRequest({...request,...change}));
});
test('collector API denies every write surface, foreign host, private file and ref alias before fetch',async()=>{
  let calls=0;const api=collectorGithubApi({token:'fixture-never-log',fetchImpl:async()=>{calls++;throw Error('unexpected');}});
  for(const url of ['https://evil.invalid',ROOT+'/git/refs',ROOT+'/pulls/250/merge',ROOT+'/contents/.env?ref='+A,ROOT+'/contents/config/secrets.json?ref='+A,ROOT+'/contents/'+PATH+'?ref=main',ROOT+'/contents/'+PATH+'?ref='+A+'&x=1',ROOT+'/branches/main/protection?override=1'])await assert.rejects(api(url));
  assert.equal(calls,0);
});
test('fixed origin GET keeps redirects disabled and bounded response; headers never saved',async()=>{
  let options;const api=collectorGithubApi({token:'fixture-only',fetchImpl:async(u,o)=>{options={u,o};return {status:403,text:async()=>'not-json'};}});
  const r=await api(ROOT+'/branches/main/protection');assert.deepEqual(r,{status:403,data:null});assert.equal(options.o.method,'GET');assert.equal(options.o.redirect,'error');assert.equal(options.o.headers.Authorization,'Bearer fixture-only');
  const oversized=collectorGithubApi({fetchImpl:async()=>({status:200,text:async()=>'x'.repeat(3000001)})});await assert.rejects(oversized(ROOT+'/pulls/250'),/too_large/);
});
test('immutable Claude PR report bytes, blob and fixed BASE manifest are independently computed',async()=>{
  const f=fixture(),r=await collectClaudeAudit({api:f.api,auditPR:244,auditPath:PATH,now});
  assert.equal(r.reviewed_bundle_sha256,f.bundle.sha256);assert.equal(r.reviewed_bundle_verification,'trusted_base_fixed_manifest');assert.equal(r.machine_readable_verdict,'revise');
  assert.equal(r.artifact.sha256,sha256(Buffer.from(r.body_base64,'base64')));assert.equal(r.native_authorship_verified,false);assert.equal(r.counts_toward_model_quorum,false);
  assert.ok(f.state.requests.filter(x=>x.includes('/contents/')).length===A2_BUNDLE_FILES.length+1);
});
test('legacy audit is preserved, never parsed as approval from prose',async()=>{
  const f=fixture();f.state.file=contents(PATH,Buffer.from('# Original REVISE\nThe word approve appears as a counterexample.'));
  const r=await collectClaudeAudit({api:f.api,auditPR:244,auditPath:PATH,now});assert.equal(r.machine_readable_verdict,null);assert.equal(r.reviewed_bundle_sha256,null);assert.equal(r.reviewed_bundle_verification,'unverified_missing_metadata_or_bundle_mismatch');assert.ok(r.body_base64);
});
test('report outside selected PR, wrong blob, forged size/base64 and untrusted submitter fail',async()=>{
  for(const mutate of [s=>s.files=[],s=>s.files=[{filename:PATH,status:'removed',sha:s.file.data.sha}],s=>s.file.data.sha=A,s=>s.file.data.content='!'+s.file.data.content,s=>s.file.data.size++,s=>s.audit.author_association='CONTRIBUTOR',s=>s.audit.head.repo.full_name='evil/fork']){
    const f=fixture();mutate(f.state);await assert.rejects(collectClaudeAudit({api:f.api,auditPR:244,auditPath:PATH,now}));
  }
});
test('audit HEAD changing during collection is detected; reviewed scripts are never executed',async()=>{
  const f=fixture();let reads=0;const api=async endpoint=>{const r=await f.api(endpoint);if(endpoint.endsWith('/pulls/244')&&++reads===2)r.data.head.sha=B;return r;};
  await assert.rejects(collectClaudeAudit({api,auditPR:244,auditPath:PATH,now}),/identity/);
});
test('base protection 403/404 or missing admin enforcement cannot masquerade as configured',()=>{
  const f=fixture();assert.equal(assessBaseProtection(f.state.protection).configuration_observed,true);assert.equal(assessBaseProtection(f.state.protection).atomic_base_race_verified,false);
  for(const status of [403,404,500])assert.equal(assessBaseProtection({status,data:f.state.protection.data}).configuration_observed,false);
  for(const field of ['strict','admins','force','app']){const p=structuredClone(f.state.protection);if(field==='strict')p.data.required_status_checks.strict=false;if(field==='admins')p.data.enforce_admins.enabled=false;if(field==='force')p.data.allow_force_pushes.enabled=true;if(field==='app')p.data.required_status_checks.checks[0].app_id=-1;assert.equal(assessBaseProtection(p).configuration_observed,false);}
});
test('an actual fixed workflow, job, app, same PR HEAD and BASE produces only unsigned checks',async()=>{
  const f=fixture(),r=await collectTrustedChecks({api:f.api,request,baseSha:A,authority,now});
  assert.equal(r.passed,true);assert.equal(r.status,'trusted_base_check_observed_unsigned');assert.equal(r.diagnostic_only,true);assert.equal(r.checks_sha256,sha256(canonical(r.check_runs)));assert.equal(r.checker_base_sha,A);
});
test('a job name alone and unregistered workflow cannot authorize anything',async()=>{
  const f=fixture();for(const changed of [null,{...authority,workflow_id:0},{...authority,app_id:1},{...authority,workflow_path:'.github/workflows/attacker.yml'}]){const r=await collectTrustedChecks({api:f.api,request,baseSha:A,authority:changed,now});assert.equal(r.passed,false);}
  assert.equal(f.state.requests.some(x=>x.includes('/check-runs')),false);
});
test('check App, completion, time, HEAD, run and detail URL are all enforced',async()=>{
  const changes=[{app:{id:1}},{conclusion:'skipped'},{status:'queued'},{head_sha:C},{completed_at:'2020-01-01T00:00:00Z'},{completed_at:'2026-10-27T00:00:00Z'},{details_url:'https://evil.invalid/actions/runs/10/job/11'}];
  for(const change of changes){const f=fixture();Object.assign(f.state.check,change);await assert.rejects(collectTrustedChecks({api:f.api,request,baseSha:A,authority,now}));}
});
test('workflow/job association and rerun attempt cannot be swapped',async()=>{
  for(const [target,change] of [['run',{workflow_id:101}],['run',{event:'push'}],['run',{path:'.github/workflows/evil.yml'}],['run',{head_repository:{full_name:'evil/fork'}}],['run',{head_sha:C}],['run',{check_suite_id:23}],['run',{pull_requests:[{number:250,head:{sha:B},base:{sha:C}}]}],['job',{run_attempt:2}],['job',{run_id:13}],['job',{head_sha:C}],['job',{name:'evil'}]]){
    const f=fixture();Object.assign(f.state[target],change);await assert.rejects(collectTrustedChecks({api:f.api,request,baseSha:A,authority,now}));
  }
});
test('PR cannot modify its own check definition or race main after collection',async()=>{
  const f=fixture();f.state.changedWorkflow=true;await assert.rejects(collectTrustedChecks({api:f.api,request,baseSha:A,authority,now}),/own_check/);
  const g=fixture();g.state.main=C;await assert.rejects(collectTrustedChecks({api:g.api,request,baseSha:A,authority,now}),/base_moved/);
});
test('a newer PR base cannot rewrite the completed job actual BASE marker',async()=>{
  const f=fixture();f.state.job.steps[0].name='BASE='+C+' HEAD='+B;
  await assert.rejects(collectTrustedChecks({api:f.api,request,baseSha:A,authority,now}),/identity/);
  const g=fixture();g.state.job.steps.push(g.state.job.steps[0]);
  await assert.rejects(collectTrustedChecks({api:g.api,request,baseSha:A,authority,now}),/identity/);
});
test('pagination includes all check pages; duplicate required jobs fail closed',async()=>{
  const f=fixture(),api=async endpoint=>{
    if(endpoint.endsWith('check-runs?filter=latest&per_page=100&page=1'))return {status:200,data:{check_runs:Array.from({length:100},(_,i)=>({name:'unrelated-'+i}))}};
    if(endpoint.endsWith('check-runs?filter=latest&per_page=100&page=2'))return {status:200,data:{check_runs:[f.state.check]}};
    return f.api(endpoint);
  };
  const r=await collectTrustedChecks({api,request,baseSha:A,authority,now});assert.equal(r.passed,true);assert.equal(r.unselected_check_count,100);
  const twice=async endpoint=>endpoint.includes('/check-runs?')?{status:200,data:{check_runs:[f.state.check,f.state.check]}}:f.api(endpoint);
  assert.equal((await collectTrustedChecks({api:twice,request,baseSha:A,authority,now})).passed,false);
});
test('403 protection and original Claude revision remain observations, never A2 approval',async()=>{
  const f=fixture();f.state.protection={status:403,data:{message:'not saved'}};
  const r=await collectA2Readiness({api:f.api,request,baseSha:A,authority,now});assert.equal(r.status,'observation_only_not_A2_admission');assert.equal(r.checks.passed,true);assert.equal(r.claude_audit.machine_readable_verdict,'revise');assert.equal(r.base_protection.configuration_observed,false);assert.equal(r.signed,false);assert.equal(r.automatic_merge,false);assert.equal(r.native_model_calls,0);assert.equal(r.paid,false);
});
test('upstream error bodies and secrets never appear in component failure receipts',async()=>{
  const f=fixture(),api=async endpoint=>{if(endpoint.includes('/pulls/'))throw Error('Bearer fixture-secret-with-spaces');return f.api(endpoint);};
  const r=await collectA2Readiness({api,request,baseSha:A,authority,now});assert.equal(r.errors.length,2);assert.ok(!JSON.stringify(r).includes('fixture-secret'));assert.equal(r.errors[0].code,'collector_operation_failed');
});
test('unbound or non-infrastructure signer cannot produce check attestations',()=>{
  for(const input of [{collection:{passed:false}},{collection:{passed:true,checker_base_sha:A,check_runs:[],checks_sha256:'fake'},subject:{base_sha:A}},{collection:{passed:true,checker_base_sha:A,check_runs:[{head_sha:B}],checks_sha256:sha256(canonical([{head_sha:B}]))},subject:{base_sha:A,head_sha:B},registry:{executors:[{id:'model',provider:'deepseek'}]},executorId:'model'}])assert.throws(()=>signCollectedChecks(input));
});
