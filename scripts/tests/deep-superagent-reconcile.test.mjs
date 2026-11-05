import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {trustedAuditCompletion,planReconciliation,continuityAnchor,AUDIT_WORKFLOW} from '../lib/deep-release-reconcile.mjs';
import {trustedContext,verifyDeployment} from '../deploy-deep-superagent.mjs';
const sha='a'.repeat(40),hash='b'.repeat(64);
const health={service:'ltzzz-deep-superagent',revision:'ltzzz.deep-superagent.v1',source_commit:sha,source_readset_sha256:hash};
const event={action:'completed',repository:{full_name:'ltzyz2181-collab/ltzzz'},workflow_run:{name:AUDIT_WORKFLOW,id:123,conclusion:'success',head_branch:'main',head_repository:{full_name:'ltzyz2181-collab/ltzzz'},event:'schedule'}};
const env={GITHUB_REPOSITORY:'ltzyz2181-collab/ltzzz',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_run',GITHUB_SHA:sha,GITHUB_RUN_ID:'234',GITHUB_RUN_ATTEMPT:'1',GITHUB_EVENT_PATH:'/event.json'};
test('only successful existing trusted-main zero-generation audit can wake reconciliation',()=>{
 assert.equal(trustedAuditCompletion(event),true);assert.equal(trustedContext(env,{readEvent:()=>event}).upstream_run_id,'123');
 for(const patch of [{name:'attacker'},{conclusion:'failure'},{head_branch:'topic'},{head_repository:{full_name:'fork/ltzzz'}},{event:'pull_request'},{event:'pull_request_target'},{id:0}]){
  const fake={...event,workflow_run:{...event.workflow_run,...patch}};assert.equal(trustedAuditCompletion(fake),false);assert.throws(()=>trustedContext(env,{readEvent:()=>fake}),/trusted_audit_completion_required/);
 }
});
test('unchanged dependency closure skips upload even when source commit advanced for receipts',()=>{
 const r=planReconciliation({http:200,data:{...health,source_commit:'c'.repeat(40)}},hash);assert.equal(r.action,'verify_unchanged');assert.equal(r.previous_release.source_commit,'c'.repeat(40));
});
test('changed closure or pre-digest known release uses tested deployment and retains previous release',()=>{
 for(const digest of [null,'d'.repeat(64)]){
  const r=planReconciliation({http:200,data:{...health,source_readset_sha256:digest}},hash);assert.equal(r.action,'deploy_tested_source');assert.equal(r.previous_release.source_commit,sha);
 }
});
test('unknown transport, source, service and malformed digests require reconciliation, no blind redeploy',()=>{
 for(const observed of [{http:524,data:null},{http:200,data:{...health,source_commit:null}},{http:200,data:{...health,service:'other'}},{http:200,data:{...health,source_readset_sha256:'bad'}}])assert.throws(()=>planReconciliation(observed,hash));
});
test('durable continuity binds exact execution, input, receipts and model attempts',()=>{
 const job={execution_id:'fixture',input_sha256:hash,model_calls:4,receipts:[{status:'unknown'}],terminal:true};
 assert.equal(continuityAnchor(structuredClone(job)),continuityAnchor(job));
 for(const change of [{execution_id:'replaced'},{input_sha256:'e'.repeat(64)},{model_calls:5},{receipts:[]}])assert.notEqual(continuityAnchor({...job,...change}),continuityAnchor(job));
 assert.throws(()=>continuityAnchor({...job,terminal:false}));
});
test('same commit with stale closure is rejected by production verification',async()=>{
 const fetcher=async()=>Response.json({...health,source_readset_sha256:'e'.repeat(64),generation_verified:false,auth_configured:true});
 await assert.rejects(verifyDeployment({source:sha,closure:hash,token:'fixture',fetcher,attempts:1}),/deployment_closure_unverified/);
});
test('reconciler reuses the existing audit cadence, fixed deployment and durable namespace',()=>{
 const workflow=fs.readFileSync('.github/workflows/deep-superagent.yml','utf8');
 assert.match(workflow,/workflows: \['Key Liveness Probe \(AI seats\)'\]/);assert.doesNotMatch(workflow,/cron:|OPENAI_API_KEY|ANTHROPIC_API_KEY/);
 const code=fs.readFileSync('scripts/deploy-deep-superagent.mjs','utf8');assert.match(code,/'--keep-vars'/);assert.match(code,/durable_job_changed_during_release/);assert.match(code,/release_unchanged_verified/);
 assert.doesNotMatch(fs.readFileSync('scripts/lib/deep-release-reconcile.mjs','utf8'),/\/v1\/jobs.*POST|new Wallet|signTransaction/);
});
