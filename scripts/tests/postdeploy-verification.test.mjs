import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {REPOSITORY,EVIDENCE_BRANCH,EVIDENCE_DIR,jsonBytes,sha256,pageFreshness,liveVersionComparison,readCloudflareDeployment,validateDeploymentConfig,observeDeployment,deploymentIndexAssessment,reservationForReview,reviewDeployment,deploymentOversightTasks} from '../lib/postdeploy-verification.mjs';
import {inspectDispatches,runDispatchOversight} from '../lib/dispatch-oversight.mjs';
const commit='a'.repeat(40),verifier='b'.repeat(40),url='https://fixture.ltzyz2181.workers.dev';
const config={schema_version:1,evidence_branch:EVIDENCE_BRANCH,automatic_rollback:false,workflows:[{name:'Edge isolated deployment test',path:'.github/workflows/edge-isolated-test-20261023.yml'},{name:'Unmapped deployment',path:'.github/workflows/deploy-unmapped.yml'}],targets:[{id:'fixture',scope:'isolated_test',workflow_path:'.github/workflows/edge-isolated-test-20261023.yml',branches:['test/fixture'],job_name:'deploy-test',cloudflare_script:'fixture',url,marker:'FIXTURE-MARKER',rollback_entry:'https://dash.cloudflare.com/'}]};
const run={id:101,run_attempt:1,name:config.workflows[0].name,path:config.workflows[0].path,repository:{full_name:REPOSITORY},head_repository:{full_name:REPOSITORY},head_sha:commit,head_branch:'test/fixture',status:'completed',conclusion:'success',html_url:'https://github.com/'+REPOSITORY+'/actions/runs/101',created_at:'2026-10-22T12:00:00Z'};
function fixture(over={}){
 const calls=[];
 const options={config,run,verifierRunId:'902',verifierSourceCommit:verifier,now:()=> '2026-10-22T13:00:00Z',api:async(p,logs)=>{calls.push(p);if(p.includes('/jobs?'))return {jobs:[{id:33,name:'deploy-test',conclusion:'success',html_url:'https://github.com/'+REPOSITORY+'/actions/runs/101/job/33'}]};if(logs)return `SOURCE_COMMIT=${commit}\n${url}\nCurrent Version ID: 3298029a-0640-4b21-a475-e25b7583acce\n`;return {workflow_runs:[]};},readPage:async()=>({status:200,body:'FIXTURE-MARKER Source commit: '+commit,source_commit:commit,date:'Thu, 22 Oct 2026 13:00:00 GMT'}),readVersion:async script=>({status:'read',script,deployment_id:'11111111-1111-4111-a111-111111111111',created_on:'2026-10-22T12:01:00Z',versions:[{version_id:'3298029a-0640-4b21-a475-e25b7583acce',percentage:100}]}),...over};return {options,calls};
}
async function reviewed(observation,patch={}){
 const reservation=reservationForReview({observation,runId:observation.verifier.run_id,sourceCommit:verifier}).record;
 const output=JSON.stringify({reviewed_sha256:reservation.reviewed_sha256,accepted:true,reasons:['marker/commit/log agree'],review_end:true});
 return reviewDeployment(reservation,{observation,call:async()=>({ok:true,native_qwen_call:true,provider:'aliyun_dashscope',model:'qwen-plus',model_source:'provider_response',finish_reason:'stop',output,tokens_used:90,...patch})});
}
function cache(root,observation,review){
 const dir=path.join(root,'.cache/postdeploy'),file=`${EVIDENCE_DIR}/${observation.task_id}.json`,rf=`${EVIDENCE_DIR}/${observation.task_id}.review.json`;
 fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),jsonBytes(observation));
 if(review)fs.writeFileSync(path.join(dir,rf),jsonBytes(review));
 const index={updated_at:'2026-10-22T13:00:00Z',deployments:{[observation.task_id]:{observation:{path:file,sha256:sha256(jsonBytes(observation))},review:review?{path:rf,sha256:sha256(jsonBytes(review))}:null}}};fs.writeFileSync(path.join(dir,'index.json'),jsonBytes(index));return {dir,file,rf,index};
}
async function temp(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'postdeploy-'));try{return await fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}

test('fresh page, full source binding and live control-plane version pass without a model verdict',async()=>{
 const {options}=fixture(),o=await observeDeployment(options),a=deploymentIndexAssessment(o,null);
 assert.equal(a.checks_verified,true);assert.equal(a.independent_probe_verified,true);assert.equal(a.status,'reverified_deterministic');assert.equal(a.missing_stage,null);assert.equal(a.model_review_status,'not_requested');assert.equal(o.model_calls,0);assert.equal(o.rollback.automatic,false);assert.equal(o.rollback.availability,'no_previous_successful_run_rollback_unverified');
});
test('HTTP200-only, wrong marker, stale body and wrong header cannot pass',async()=>{
 for(const page of [{status:200,body:'OK',source_commit:commit},{status:200,body:'FIXTURE-MARKER Source commit: '+'c'.repeat(40),source_commit:commit},{status:200,body:'FIXTURE-MARKER Source commit: '+commit,source_commit:'c'.repeat(40)},{status:404,body:'FIXTURE-MARKER Source commit: '+commit,source_commit:commit}]){
  const {options}=fixture({readPage:async()=>page}),o=await observeDeployment(options);assert.equal(deploymentIndexAssessment(o,await reviewed(o)).status,'deployment_reverification_failed');
 }
});
test('missing log source or version never proves actual deployed version',async()=>{
 const f=fixture();const old=f.options.api;f.options.api=async(p,logs)=>logs?'HTTP200 marker '+url:old(p,logs);
 const o=await observeDeployment(f.options);assert.equal(o.checks.deployment_logs,false);assert.equal(deploymentIndexAssessment(o,await reviewed(o)).status,'deployment_reverification_failed');
});
test('a verifier running in the deployer run cannot self-pass even with a second-seat affirmative reply',async()=>{
 const {options}=fixture({verifierRunId:'101'}),o=await observeDeployment(options);assert.equal(deploymentIndexAssessment(o,await reviewed(o)).status,'deployed_unverified');assert.equal(o.independence.separate_workflow_run,false);
});
test('failed deployment is never labeled deployed and missing target contracts are explicit warnings',async()=>{
 const f=fixture({run:{...run,conclusion:'failure'}}),failed=await observeDeployment(f.options);assert.equal(deploymentIndexAssessment(failed).status,'deployment_failed');assert.equal(deploymentIndexAssessment(failed).label,'部署失败');assert.equal(f.calls.length,0);
 const g=fixture({run:{...run,name:'Unmapped deployment',path:config.workflows[1].path}}),o=await observeDeployment(g.options);assert.equal(o.blocker,'target_contract_not_configured');assert.equal(g.calls.length,0);
});
test('foreign repo, arbitrary workflow, invalid executor and unsafe target URLs are refused',async()=>{
 for(const patch of [{head_repository:{full_name:'other/repo'}},{repository:{full_name:'other/repo'}},{head_sha:'short'},{name:'arbitrary'}])await assert.rejects(()=>observeDeployment(fixture({run:{...run,...patch}}).options));
 for(const bad of ['http://localhost','https://169.254.169.254','https://fixture.workers.dev:8443','https://fixture.workers.dev/?query=secret'])assert.throws(()=>validateDeploymentConfig({...config,targets:[{...config.targets[0],url:bad}]}));
});
test('native review remains bound to the observation and is additional to deterministic verification',async()=>{
 const o=await observeDeployment(fixture().options),r=await reviewed(o),a=deploymentIndexAssessment(o,r);assert.equal(a.status,'reverified_deterministic');assert.equal(r.model_calls,1);assert.equal(r.actual_provider,'aliyun_dashscope');assert.equal(r.paid,false);assert.equal(r.tx_hash,null);
});
test('wrong hash, logical reviewer alias, incomplete finish, requested model and empty content cannot fake review',async()=>{
 const o=await observeDeployment(fixture().options);
 for(const patch of [{finish_reason:'length'},{model_source:'requested_model'},{provider:'qianwen_self_report'},{output:''},{output:JSON.stringify({reviewed_sha256:'0'.repeat(64),accepted:true,reasons:[],review_end:true})}])assert.equal(deploymentIndexAssessment(o,await reviewed(o,patch)).independent_native_review_verified,false);
});
test('metadata verdict cannot contradict actual model output, nor can observation or task IDs be swapped',async()=>{
 const o=await observeDeployment(fixture().options),r=await reviewed(o);const forged={...r,verdict:{...r.verdict,accepted:false}};assert.equal(deploymentIndexAssessment(o,forged).independent_native_review_verified,false);
 assert.equal(deploymentIndexAssessment({...o,target_url:'https://different.workers.dev'},r).independent_native_review_verified,false);
 assert.equal(deploymentIndexAssessment(o,{...r,task_id:'OTHER'}).independent_native_review_verified,false);
});
test('unknown native outcome is retained; reservation reuse suppresses repurchase and altered subjects fail before calling',async()=>{
 const o=await observeDeployment(fixture().options),r=reservationForReview({observation:o,runId:'902',sourceCommit:verifier}).record;let calls=0;
 const failed=await reviewDeployment(r,{observation:o,call:async()=>{calls++;throw Error('timeout');}});assert.equal(failed.model_calls,1);assert.equal(failed.status,'native_review_incomplete_or_failed');assert.equal(calls,1);
 for(const status of ['reserved_before_native_call','native_review_incomplete_or_failed','native_review_complete'])assert.equal(reservationForReview({observation:o,existing:{...r,status}}).execute,false);
 await assert.rejects(()=>reviewDeployment(r,{observation:{...o,target_id:'changed'},call:async()=>{calls++;}}));assert.equal(calls,1);
});
test('existing successful deployment is only a rollback candidate, never executed or asserted authorized',async()=>{
 const f=fixture(),old=f.options.api;f.options.api=async(p,logs)=>p.includes('/workflows/')?{workflow_runs:[{...run,id:99,created_at:'2026-10-21T12:00:00Z'}]}:old(p,logs);
 const o=await observeDeployment(f.options);assert.equal(o.rollback.previous_successful_run.run_id,'99');assert.equal(o.rollback.availability,'previous_successful_run_found_rollback_not_executed');assert.equal(o.rollback.automatic,false);
});
test('missing live evidence is visible in Qwen oversight; scans reuse original ID and deterministic completion closes it',()=>temp(async root=>{
 const o=await observeDeployment(fixture().options);const pending=structuredClone(o);pending.checks.live_deployment_version=null;pending.version_evidence.before={status:'not_configured'};cache(root,pending,null);
 const a=runDispatchOversight({root,now:'2026-10-22T15:00:00Z',lookback:1});const w=a.warnings.find(w=>w.task_id===o.task_id);assert.ok(w);assert.equal(w.issue,'deployed_unverified');const bytes=fs.readFileSync(path.join(root,w.repair_file));
 const b=runDispatchOversight({root,now:'2026-10-22T15:30:00Z',lookback:1});assert.equal(b.warnings.find(w=>w.task_id===o.task_id).warning_days,1);assert.deepEqual(fs.readFileSync(path.join(root,w.repair_file)),bytes);
 cache(root,o,await reviewed(o));const c=runDispatchOversight({root,now:'2026-10-22T15:45:00Z',lookback:1});assert.equal(c.warnings.some(w=>w.task_id===o.task_id),false);assert.equal(c.stage_counts.production_deployments_verified,0);assert.equal(c.stage_counts.isolated_deployment_checks_verified,1);
}));
test('receipt tampering or cross-task cache references remain warnings, never green',()=>temp(async root=>{
 const o=await observeDeployment(fixture().options),c=cache(root,o,await reviewed(o));fs.appendFileSync(path.join(c.dir,c.file),' ');let t=deploymentOversightTasks(root)[0];assert.equal(t.deployed,false);assert.equal(t.phase,'deployment_reverification_failed');
 c.index.deployments[o.task_id].observation.path='../../etc/passwd';fs.writeFileSync(path.join(c.dir,'index.json'),jsonBytes(c.index));t=deploymentOversightTasks(root)[0];assert.equal(t.phase,'deployment_reverification_failed');
}));

test('malformed imported index becomes a visible warning without crashing or clearing unrelated tasks',()=>temp(async root=>{
 const dir=path.join(root,'.cache/postdeploy');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'index.json'),'{broken');
 const report=runDispatchOversight({root,now:'2026-10-22T15:00:00Z',lookback:1});assert.ok(report.warnings.some(w=>w.task_id==='DEPLOY-EVIDENCE-IMPORT'));assert.ok(report.tasks.some(t=>t.id==='CONTROL-REVIEW-2026-10-22'));
}));
test('evidence branch persistence is idempotent and cannot modify main or commit unrelated staged content',()=>temp(async root=>{
 const {execFileSync}=await import('node:child_process'),{persistDeploymentEvidence}=await import('../lib/postdeploy-persistence.mjs');
 const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const remote=path.join(root,'remote.git'),work=path.join(root,'work');
 git(root,['init','--bare','--initial-branch=main',remote]);git(root,['clone',remote,work]);git(work,['config','user.name','fixture']);git(work,['config','user.email','fixture@example.invalid']);fs.writeFileSync(path.join(work,'README.md'),'fixture');git(work,['add','.']);git(work,['commit','-m','base']);git(work,['push','origin','main']);const main=git(work,['rev-parse','HEAD']);
 git(work,['checkout','--detach']);fs.mkdirSync(path.join(work,EVIDENCE_DIR),{recursive:true});fs.writeFileSync(path.join(work,EVIDENCE_DIR,'DEPLOY-101-1.json'),'{}\n');const first=persistDeploymentEvidence(work);assert.equal(first.changed,true);assert.equal(persistDeploymentEvidence(work).changed,false);assert.equal(git(root,['--git-dir='+remote,'rev-parse','main']),main);assert.equal(git(root,['--git-dir='+remote,'rev-parse',EVIDENCE_BRANCH]),first.commit);
 fs.writeFileSync(path.join(work,'other.txt'),'must not commit');git(work,['add','other.txt']);assert.throws(()=>persistDeploymentEvidence(work),/non_evidence_staged_change_refused/);assert.equal(git(root,['--git-dir='+remote,'rev-parse','main']),main);
}));

test('a complete rejection is preserved as advisory; a single model cannot veto deterministic success',async()=>{
 const o=await observeDeployment(fixture().options),reservation=reservationForReview({observation:o,runId:'902',sourceCommit:verifier}).record;
 const output=JSON.stringify({reviewed_sha256:reservation.reviewed_sha256,accepted:false,reasons:['reviewer objects to external digest'],review_end:true});
 const r=await reviewed(o,{output}),a=deploymentIndexAssessment(o,r);
 assert.equal(a.independent_native_review_completed,true);assert.equal(a.independent_native_review_verified,false);assert.equal(a.status,'reverified_deterministic');assert.equal(a.missing_stage,null);assert.equal(a.label,'确定性复验通过');assert.equal(a.model_review_status,'rejected');assert.equal(a.model_review_is_advisory,true);
});
test('a file digest binds actual serialized bytes externally and need not appear in the file being hashed',async()=>{
 const o=await observeDeployment(fixture().options),bytes=jsonBytes(o),digest=sha256(bytes);assert.equal(bytes.includes(digest),false);
 const r=await reviewed(o);assert.equal(r.reviewed_sha256,digest);assert.equal(deploymentIndexAssessment(o,r).status,'reverified_deterministic');
});

test('freshness rejects stale, future, missing and invalid Date, cached Age and invalid timing even with HTTP 200',async()=>{
 const valid={request_started_at_utc:'2026-10-22T13:00:00.100Z',response_received_at_utc:'2026-10-22T13:00:00.900Z',date_header:'Thu, 22 Oct 2026 13:00:00 GMT',age_header:null};
 assert.equal(pageFreshness(valid).verified,true);
 assert.equal(pageFreshness({...valid,age_header:'0'}).verified,true);
 for(const patch of [{date_header:'Thu, 22 Oct 2026 12:59:00 GMT'},{date_header:'Thu, 22 Oct 2026 13:01:00 GMT'},{date_header:null},{date_header:'2026-10-22'},{age_header:'1'},{age_header:'NaN'},{response_received_at_utc:'2026-10-22T13:01:00Z'},{response_received_at_utc:'2026-10-22T12:59:00Z'}])assert.equal(pageFreshness({...valid,...patch}).verified,false,JSON.stringify(patch));
 for(const date of [null,'invalid','Thu, 22 Oct 2026 12:59:00 GMT','Thu, 22 Oct 2026 13:01:00 GMT']){
  const f=fixture(),read=f.options.readPage;f.options.readPage=async()=>({...await read(),date});const o=await observeDeployment(f.options);assert.equal(o.checks.fresh_http_200,false);assert.notEqual(deploymentIndexAssessment(o,await reviewed(o)).status,'reverified_deterministic');
 }
});
test('control-plane version is bracketed around the page; wrong version, split traffic or a rollout never passes',async()=>{
 const f=fixture(),current=await f.options.readVersion('fixture'),expected='3298029a-0640-4b21-a475-e25b7583acce';
 const compare=(before,after=before)=>liveVersionComparison({expected_version:expected,before,after});
 assert.equal(compare(current).verified,true);
 assert.equal(compare({...current,versions:[{version_id:'22222222-2222-4222-a222-222222222222',percentage:100}]}).verified,false);
 assert.equal(compare({...current,versions:[{version_id:expected,percentage:50},{version_id:'22222222-2222-4222-a222-222222222222',percentage:50}]}).verified,false);
 assert.equal(compare(current,{...current,deployment_id:'33333333-3333-4333-a333-333333333333'}).verified,false);
 assert.equal(compare({...current,versions:[{version_id:expected,percentage:99}]}).verified,null);
 assert.equal(compare({status:'cloudflare_read_http_403'}).verified,null);
 const order=[];f.options.readVersion=async()=>{order.push('version');return current;};const page=f.options.readPage;f.options.readPage=async()=>{order.push('page');return page();};
 const o=await observeDeployment(f.options);assert.deepEqual(order,['version','page','version']);assert.equal(o.checks.live_deployment_version,true);
 assert.equal(o.log_evidence.source,'deployment_job_self_report_corroboration_not_independent');
});
test('log UUID presence, accepted model opinion or pre-v2 flags cannot replace missing live version/freshness reads',async()=>{
 const o=await observeDeployment(fixture({readVersion:async()=>({status:'not_configured'})}).options),a=deploymentIndexAssessment(o,await reviewed(o));
 assert.equal(o.checks.deployment_logs,true);assert.equal(o.checks.live_deployment_version,null);assert.equal(a.status,'deployed_unverified');assert.equal(a.missing_stage,'live_deployment_version_unverified');
 const good=await observeDeployment(fixture().options),legacy={...good,schema:'ltzzz.postdeploy-observation.v1'};delete legacy.page.request_started_at_utc;
 assert.equal(deploymentIndexAssessment(legacy,await reviewed(legacy)).checks_verified,false);
 const forged=structuredClone(good);forged.page.date_header='Thu, 22 Oct 2026 12:00:00 GMT';assert.equal(deploymentIndexAssessment(forged).checks_verified,false);
});
test('Cloudflare reader is a fixed GET and returns only public version facts, without tokens or account IDs',async()=>{
 const accountId='c'.repeat(32),token='fixture-private-token',f=fixture(),current=await f.options.readVersion('fixture');let calls=0;
 const result=await readCloudflareDeployment({script:'fixture',token,accountId,fetchImpl:async(url,opts)=>{
  calls++;assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+accountId+'/workers/scripts/fixture/deployments?per_page=1');assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,'Bearer '+token);
  return {ok:true,json:async()=>({success:true,result:{deployments:[{id:current.deployment_id,created_on:current.created_on,versions:current.versions,author_email:'private@example.invalid',annotations:{secret:'not retained'}}]}})};
 }});
 assert.equal(calls,1);assert.equal(result.status,'read');assert.equal(result.versions[0].percentage,100);
 for(const secret of [accountId,token,'private@example.invalid','not retained'])assert.equal(JSON.stringify(result).includes(secret),false);
 const noFetch=async()=>{throw Error('must not call');};
 assert.equal((await readCloudflareDeployment({script:'fixture',accountId,fetchImpl:noFetch})).status,'not_configured');
 assert.equal((await readCloudflareDeployment({script:'../../other',token,accountId,fetchImpl:noFetch})).status,'invalid_read_configuration');
 assert.equal((await readCloudflareDeployment({script:'fixture',token,accountId,fetchImpl:async()=>({ok:false,status:403,text:()=>{throw Error('must not read raw auth error');}})})).status,'cloudflare_read_http_403');
 assert.equal((await readCloudflareDeployment({script:'fixture',token,accountId,fetchImpl:async()=>{throw Error(token);}})).status,'cloudflare_read_unavailable');
});
test('v2 uses the same task and hash-bound historical rejection remains attached only to v1',()=>temp(async root=>{
 const current=await observeDeployment(fixture().options),original={...current,schema:'ltzzz.postdeploy-observation.v1'},r=await reviewed(original,{output:JSON.stringify({reviewed_sha256:sha256(jsonBytes(original)),accepted:false,reasons:['old rejection retained'],review_end:true})});
 const c=cache(root,original,r),revision=`${EVIDENCE_DIR}/${current.task_id}.v2.json`;
 current.previous_observation={...c.index.deployments[current.task_id].observation};fs.writeFileSync(path.join(c.dir,revision),jsonBytes(current));
 const row=c.index.deployments[current.task_id];row.previous_observation={...row.observation};row.observation={path:revision,sha256:sha256(jsonBytes(current))};fs.writeFileSync(path.join(c.dir,'index.json'),jsonBytes(c.index));
 let t=deploymentOversightTasks(root)[0];assert.equal(t.id,original.task_id);assert.equal(t.phase,'reverified_deterministic');assert.equal(t.historical_model_review,'rejected');assert.equal(t.deployment_reverification.model_review_status,'different_observation_not_applied');assert.equal(t.independent_review_verified,false);assert.equal(t.deployed,false);
 assert.equal(fs.readFileSync(path.join(c.dir,c.file),'utf8'),jsonBytes(original));assert.equal(fs.readFileSync(path.join(c.dir,c.rf),'utf8'),jsonBytes(r));
 fs.appendFileSync(path.join(c.dir,c.file),' ');t=deploymentOversightTasks(root)[0];assert.equal(t.phase,'deployment_reverification_failed');
}));
test('evidence writer accepts an additive v2 but refuses overwriting immutable v1 or model review',()=>temp(async root=>{
 const {execFileSync}=await import('node:child_process'),{persistDeploymentEvidence}=await import('../lib/postdeploy-persistence.mjs');
 const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const remote=path.join(root,'remote.git'),work=path.join(root,'work');git(root,['init','--bare','--initial-branch=main',remote]);git(root,['clone',remote,work]);git(work,['config','user.name','fixture']);git(work,['config','user.email','fixture@example.invalid']);fs.writeFileSync(path.join(work,'README.md'),'fixture');git(work,['add','.']);git(work,['commit','-m','base']);git(work,['push','origin','main']);const main=git(work,['rev-parse','HEAD']);git(work,['checkout','--detach']);
 const dir=path.join(work,EVIDENCE_DIR);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'DEPLOY-101-1.json'),'original\n');persistDeploymentEvidence(work);fs.writeFileSync(path.join(dir,'DEPLOY-101-1.v2.json'),'revision\n');persistDeploymentEvidence(work);assert.equal(persistDeploymentEvidence(work).changed,false);
 fs.writeFileSync(path.join(dir,'DEPLOY-101-1.json'),'overwritten\n');assert.throws(()=>persistDeploymentEvidence(work),/immutable_deployment_evidence_change_refused/);assert.equal(git(root,['--git-dir='+remote,'rev-parse','main']),main);
}));
