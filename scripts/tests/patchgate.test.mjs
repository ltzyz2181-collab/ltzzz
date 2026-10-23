import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync, sign} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {TASK, canonical, sha256, classify, scanDiff, evaluate, subjectFor, verifyDeployment, reserveAction, finishAction} from '../lib/patchgate.mjs';
import {collectSnapshot, loadBaseConfig} from '../patchgate.mjs';

const policy = JSON.parse(fs.readFileSync(new URL('../../config/patch-policy.json',import.meta.url)));
const now = Date.parse('2026-10-23T10:00:00Z');
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40);
const pairs = ['openai','anthropic','aliyun_dashscope','volcengine_ark'].map((provider,i) => ({provider,id:'executor-'+i,...generateKeyPairSync('ed25519')}));
const trust = {schema_version:1,enabled:true,keys:pairs.map(k => ({id:k.id,provider:k.provider,executor:'test-executor',enabled:true,roles:['author','review','checks','deployment','notification','supervision'],
  not_before:'2026-10-22T00:00:00Z',not_after:'2026-10-24T00:00:00Z',public_key_pem:k.publicKey.export({type:'spki',format:'pem'})}))};
const file = name => ({path:name,mode:'100644',old_mode:'100644',diff:'diff --git a/'+name+' b/'+name+'\n--- a/'+name+'\n+++ b/'+name+'\n@@ -1 +1 @@\n-old\n+new\n'});
function fixture(name='scripts/example.mjs') {
  const snapshot = {repository:policy.repository,task_id:TASK,base_sha:A,head_sha:B,policy_sha256:sha256(canonical(policy)),trust_sha256:sha256(canonical(trust)),files:[file(name)]};
  const subject = subjectFor(snapshot);
  const attestation = (index,role,extra={}) => {
    const payload = {subject,role,at_utc:new Date(now).toISOString(),...extra};
    return {key_id:pairs[index].id,payload,signature:sign(null,Buffer.from(canonical(payload)),pairs[index].privateKey).toString('base64')};
  };
  const author = attestation(0,'author');
  const checks = attestation(0,'checks',{passed:true,checker_base_sha:A,checks_sha256:'1'.repeat(64)});
  const review = i => attestation(i,'review',{verdict:'approve',generation_verified:true,model:'model-from-provider',output_sha256:'2'.repeat(64),metadata_source:'provider_response',finish_reason:'stop'});
  const run = (attestations=[author,checks,review(1)], overrides={}) => evaluate({policy,trust,snapshot,attestations,now,...overrides});
  return {snapshot,subject,attestation,author,checks,review,run};
}
function deployment(subject) {
  const bytes = Buffer.from('isolated canary\nSOURCE_COMMIT='+subject.head_sha+'\n');
  return {head_sha:subject.head_sha,base_sha:subject.base_sha,target_environment:'canary',expected_version_id:'version-1',
    observation:{url:'https://ltzzz-patchgate-test.example.workers.dev',http_status:200,redirected:false,started_at_utc:'2026-10-23T09:59:58Z',finished_at_utc:'2026-10-23T10:00:00Z',http_date:'Fri, 23 Oct 2026 09:59:59 GMT',body_base64:bytes.toString('base64'),body_sha256:sha256(bytes),header_source_commit:subject.head_sha,header_version_id:'version-1'},
    platform:{source:'cloudflare_current_deployment_api',http_status:200,service_name:'ltzzz-patchgate-test',observed_at_utc:'2026-10-23T09:59:59Z',versions:[{id:'version-1',percentage:100}]}};
}

test('four risk levels and fail-closed unknown paths',() => {
  for (const [name,expected] of [['docs/example.md','L0'],['memory/agent.json','L0'],['memory/promote/queue.json','L3'],['memory/promote/notes.md','L3'],['docs/credentials.md','L3'],['ops/派单台账.md','L0'],['scripts/example.mjs','L1'],['tests/example.test.mjs','L1'],['workers/test/index.js','L2'],['wep3-worker.js','L2'],['wrangler.test.toml','L2'],['wallet/addresses.md','L3'],['config/review-delegation.json','L3'],['identity/dids/grok.json','L3'],['contracts/Escrow.sol','L3'],['.github/workflows/test.yml','L3'],['package.json','L3'],['unmapped/file','L3']]) assert.equal(classify(policy,[file(name)]).level,expected,name);
  assert.equal(classify(policy,[file('docs/active.js')]).level,'L3');
  assert.equal(classify(policy,[file('docs/a.md'),file('config/authority.json')]).level,'L3');
});
for (const name of ['config/patch-policy.json','config/patchgate-trust.json','scripts/lib/patchgate.mjs','scripts/tests/patchgate.test.mjs','.github/workflows/patchgate.yml','scripts/patchgate.mjs']) {
  test('same patch cannot alter own constraint: '+name,() => {
    const f=fixture(name),r=f.run([f.author,f.checks,f.review(1),f.review(2),f.attestation(0,'notification',{owner_notified:true,reference:'https://github.com/ltzyz2181-collab/ltzzz/issues/1'})]);
    assert.ok(r.reasons.includes('cannot_modify_own_constraints_requires_separate_trust_rollout'));
    assert.equal(r.automatic_merge,false);
  });
}
test('L0 still requires authenticated identity and baseline tests, not merely a claimed label',() => {
  const f=fixture('docs/test.md');
  assert.equal(f.run([f.author,f.checks]).validation_passed,true);
  assert.equal(f.run([]).validation_passed,false);
});
test('L1 review must be from a different authenticated upstream provider',() => {
  const f=fixture();
  assert.equal(f.run([f.author,f.checks,f.review(0)]).validation_passed,false);
  assert.equal(f.run().status,'validated_not_activated');
});
test('provider is derived from registered key, not payload provider or shared GitHub login',() => {
  const f=fixture(),fake=f.attestation(0,'review',{verdict:'approve',generation_verified:true,provider:'anthropic',author_provider:'anthropic',model:'Claude',metadata_source:'provider_response',finish_reason:'stop',output_sha256:'2'.repeat(64)});
  assert.equal(f.run([f.author,f.checks,fake]).validation_passed,false);
  const tampered=f.review(1); tampered.key_id='executor-0';
  assert.equal(f.run([f.author,f.checks,tampered]).validation_passed,false);
});
test('signed rejection is retained; no relabeling of rejection as approval',() => {
  const f=fixture();
  const rejected=f.attestation(2,'review',{verdict:'revise'});
  assert.ok(f.run([f.author,f.checks,f.review(1),rejected]).reasons.includes('review_requires_revision'));
});
test('new head, base, policy, or diff invalidates existing proofs',() => {
  const f=fixture();
  for (const mutation of [{head_sha:C},{base_sha:C},{files:[file('scripts/changed.mjs')]},{policy_sha256:'3'.repeat(64)}]) {
    const r=f.run(undefined,{snapshot:{...f.snapshot,...mutation}});
    assert.equal(r.validation_passed,false);
  }
});
test('checks must be bound to trusted base, not tests modified by the candidate',() => {
  const f=fixture(),checks=f.attestation(0,'checks',{passed:true,checker_base_sha:B,checks_sha256:'1'.repeat(64)});
  assert.ok(f.run([f.author,checks,f.review(1)]).reasons.includes('trusted_base_checks_required'));
});
test('missing, revoked, expired or forged executor key cannot authorize',() => {
  const f=fixture();
  for (const modified of [{...trust,enabled:false},{...trust,keys:[]},{...trust,keys:trust.keys.map(k=>({...k,enabled:false}))},{...trust,keys:trust.keys.map(k=>({...k,not_after:'2026-10-23T09:00:00Z'}))}]) assert.equal(f.run(undefined,{trust:modified}).validation_passed,false);
  assert.equal(f.run(undefined,{now:now+86401000}).validation_passed,false);
  assert.equal(f.run(undefined,{now:now-1000}).validation_passed,false);
});
test('the same public key cannot impersonate different providers or duplicate key IDs',() => {
  const f=fixture();
  const reused={...trust,keys:trust.keys.map((k,i)=>i===1?{...k,public_key_pem:trust.keys[0].public_key_pem}:k)};
  const snapshot={...f.snapshot,trust_sha256:sha256(canonical(reused))},subject=subjectFor(snapshot);
  const payload={subject,role:'author',at_utc:new Date(now).toISOString()};
  const author={key_id:pairs[0].id,payload,signature:sign(null,Buffer.from(canonical(payload)),pairs[0].privateKey).toString('base64')};
  assert.ok(evaluate({policy,trust:reused,snapshot,now,attestations:[author]}).reasons.includes('one_authenticated_author_required'));
  const duplicate={...trust,keys:[...trust.keys,trust.keys[0]]};
  assert.equal(f.run(undefined,{trust:duplicate}).validation_passed,false);
});
test('incomplete model output cannot serve as an independent review',() => {
  const f=fixture();
  for (const change of [{finish_reason:'length'},{metadata_source:'model_self_report'},{generation_verified:false},{model:''},{output_sha256:'not-a-hash'}]) {
    const review=f.attestation(1,'review',{verdict:'approve',generation_verified:true,model:'real',output_sha256:'2'.repeat(64),metadata_source:'provider_response',finish_reason:'stop',...change});
    assert.equal(f.run([f.author,f.checks,review]).validation_passed,false);
  }
});
test('L3 requires two different review providers and owner notification, no new owner approval',() => {
  const f=fixture('identity/seat-registry.json');
  assert.equal(f.run().validation_passed,false);
  assert.equal(f.run([f.author,f.checks,f.review(1),f.review(1)]).validation_passed,false);
  assert.equal(f.run([f.author,f.checks,f.review(1),f.review(2)]).validation_passed,false);
  const r=f.run([f.author,f.checks,f.review(1),f.review(2),f.attestation(0,'notification',{owner_notified:true,reference:'https://github.com/ltzyz2181-collab/ltzzz/issues/1'})]);
  assert.equal(r.validation_passed,true);
  assert.equal(r.automatic_merge,false);
});
test('secret scan redacts findings; dynamic execution and new domains require resolution',() => {
  const changes=[['sk-'+'X'.repeat(24),'secret_pattern'],['eval("untrusted")','new_dynamic_execution_requires_review'],['import c from "node:child_process"','new_dynamic_execution_requires_review'],['https://attacker.invalid/collect','unapproved_external_host']];
  for (const [text,code] of changes) {
    const findings=scanDiff(policy,[{...file('scripts/test.mjs'),diff:'+ '+text}]);
    assert.ok(findings.some(x=>x.code===code));
    if (code==='secret_pattern') assert.ok(!JSON.stringify(findings).includes(text));
  }
  assert.equal(scanDiff(policy,[{...file('docs/a.md'),diff:'+ https://ltzzz.com/docs'}]).length,0);
  assert.ok(scanDiff(policy,[{...file('docs/a.md'),diff:'+ http://ltzzz.com/docs'}]).length);
});
test('deleted suspect line is not incorrectly treated as newly introduced',() => {
  assert.equal(scanDiff(policy,[{...file('scripts/test.mjs'),diff:'- eval("old")\n+ safe()'}]).length,0);
});
test('path traversal, symlinks, gitlinks and binary data cannot pass',() => {
  const f=fixture();
  for (const mode of ['120000','160000']) assert.ok(classify(policy,[{...file('docs/a.md'),mode}]).reasons.length);
  for (const name of ['../config/a.json','/tmp/a','docs/../../a','docs\\a','docs/.git/config','docs/a\n.md']) assert.throws(()=>subjectFor({...f.snapshot,files:[file(name)]}));
  assert.equal(f.run(undefined,{snapshot:{...f.snapshot,files:[{...file('docs/a.md'),binary:true,diff:null}]}}).validation_passed,false);
});
test('diff and file limits are enforced even if otherwise correctly signed',() => {
  const f=fixture(),limited={...policy,max_files:1,max_diff_bytes:1};
  const r=f.run(undefined,{policy:limited,snapshot:{...f.snapshot,policy_sha256:sha256(canonical(limited))}});
  assert.ok(r.reasons.includes('diff_limit_exceeded'));
});
test('three signed distinct failures add a review without disabling the seat',() => {
  const f=fixture();
  const failures=[0,1,2].map(i=>f.attestation(1,'supervision',{subject:{...f.subject,task_id:TASK+'-'+i},failed_provider:'openai',result:'failed'}));
  const r=f.run(undefined,{failures});
  assert.equal(r.additional_review_due_to_failures,1);
  assert.equal(r.validation_passed,false);
  assert.equal(f.run([f.author,f.checks,f.review(1),f.review(2)],{failures}).validation_passed,true);
  assert.equal(f.run(undefined,{failures:[failures[0],failures[0],failures[0]]}).additional_review_due_to_failures,0);
  assert.equal(f.run(undefined,{failures:failures.map(x=>({...x,signature:'invented'}))}).additional_review_due_to_failures,0);
});
test('same key is reserved only once; unknown outcome never retries automatically',() => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ltzzz-patchgate-'));
  try {
    const args={directory:dir,taskId:TASK,headSha:B,action:'deploy'};
    const first=reserveAction(args);
    assert.equal(first.reserved,true);
    assert.equal(reserveAction(args).reserved,false);
    const finished=finishAction({reservation:first,result:{status:'outcome_unknown'}});
    assert.equal(JSON.parse(fs.readFileSync(finished)).result.status,'outcome_unknown');
    assert.equal(reserveAction(args).reserved,false);
    assert.throws(()=>finishAction({reservation:first,result:{status:'completed'}}));
    assert.equal(reserveAction({...args,action:'merge'}).reserved,true);
    assert.equal(reserveAction({...args,headSha:C}).reserved,true);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('freshness and Cloudflare CURRENT version are deterministic requirements, not log self-reports',() => {
  const f=fixture('workers/a.js'),e=deployment(f.subject);
  const allowedTargets=[{url:e.observation.url}],result=verifyDeployment({subject:f.subject,evidence:e,allowedTargets,now});
  assert.equal(result.status,'reverified_deterministic');
  assert.equal(result.model_verdict_required,false);
  assert.equal(result.rollback_verified,false);
  const cases=[x=>x.observation.header_source_commit=A,x=>x.observation.http_date='Fri, 23 Oct 2026 09:00:00 GMT',x=>x.observation.header_version_id='old',x=>x.platform.versions[0].id='different',x=>x.platform.versions[0].percentage=50,x=>x.platform.source='deploy_job_log',x=>x.observation.redirected=true,x=>x.observation.body_sha256='0'.repeat(64),x=>x.observation.url='http://ltzzz-patchgate-test.example.workers.dev',x=>x.target_environment='production'];
  for (const mutate of cases) { const changed=structuredClone(e);mutate(changed);assert.equal(verifyDeployment({subject:f.subject,evidence:changed,allowedTargets,now}).passed,false); }
  assert.equal(verifyDeployment({subject:f.subject,evidence:e,allowedTargets,now:now+301000}).passed,false,'old observation cannot be freshly re-attested');
  assert.equal(verifyDeployment({subject:f.subject,evidence:e,allowedTargets,now:now-10000}).passed,false,'future observation is invalid');
  assert.equal(verifyDeployment({subject:f.subject,evidence:e,now}).passed,false,'standalone verifier also requires the base allowlist');
  assert.equal(verifyDeployment({subject:f.subject,evidence:e,allowedTargets:[{url:'https://other.example.workers.dev'}],now}).passed,false);
});
test('L2 canary must be signed and target must be in BASE allowlist',() => {
  const f=fixture('workers/a.js'),e=deployment(f.subject),proof=f.attestation(0,'deployment',{evidence:e});
  assert.equal(f.run([f.author,f.checks,f.review(1),proof]).validation_passed,false);
  const p={...policy,canary_targets:[{url:e.observation.url}]};
  const g=fixture('workers/a.js');g.snapshot.policy_sha256=sha256(canonical(p));
  const subject=subjectFor(g.snapshot);
  const attest=(i,role,extra={})=>{const payload={subject,role,at_utc:new Date(now).toISOString(),...extra};return {key_id:pairs[i].id,payload,signature:sign(null,Buffer.from(canonical(payload)),pairs[i].privateKey).toString('base64')};};
  const r=evaluate({policy:p,trust,snapshot:g.snapshot,now,attestations:[attest(0,'author'),attest(0,'checks',{passed:true,checker_base_sha:A,checks_sha256:'1'.repeat(64)}),attest(1,'review',{verdict:'approve',generation_verified:true,model:'real',output_sha256:'2'.repeat(64),metadata_source:'provider_response',finish_reason:'stop'}),attest(0,'deployment',{evidence:deployment(subject)})]});
  assert.equal(r.validation_passed,true);
  assert.equal(r.deployment_verification.status,'reverified_deterministic');
});
test('configuration is loaded through BASE reader, never the candidate checkout',() => {
  const paths=[];
  const actual=loadBaseConfig({base:A,read:p=>{paths.push(p);return JSON.stringify(p.endsWith('trust.json')?trust:policy);}});
  assert.deepEqual(paths,['config/patch-policy.json','config/patchgate-trust.json']);
  assert.equal(actual.policy_sha256,sha256(canonical(policy)));
});
test('real Git snapshot ignores candidate policy and includes every modified path and mode',() => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'patchgate-git-')),prior=process.cwd();
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  try {
    git(['init','--quiet']);git(['config','user.name','patchgate-test']);git(['config','user.email','patchgate-test@example.invalid']);
    fs.mkdirSync(path.join(root,'config'));fs.mkdirSync(path.join(root,'docs'));
    fs.writeFileSync(path.join(root,'config/patch-policy.json'),JSON.stringify(policy));
    fs.writeFileSync(path.join(root,'config/patchgate-trust.json'),JSON.stringify(trust));
    fs.writeFileSync(path.join(root,'docs/a.md'),'old\n');
    git(['add','.']);git(['commit','--quiet','-m','trusted base']);const base=git(['rev-parse','HEAD']);
    fs.writeFileSync(path.join(root,'config/patch-policy.json'),JSON.stringify({...policy,automatic_merge:true,l3_prefixes:[]}));
    fs.writeFileSync(path.join(root,'docs/a.md'),'new\n');
    fs.writeFileSync(path.join(root,'docs/new 文档.md'),'added\n');
    git(['add','.']);git(['commit','--quiet','-m','candidate tries to weaken its own checks']);const head=git(['rev-parse','HEAD']);
    process.chdir(root);
    const s=collectSnapshot({base,head,taskId:TASK});
    assert.equal(s.policy.automatic_merge,false);
    assert.deepEqual(s.snapshot.files.map(f=>f.path).sort(),['config/patch-policy.json','docs/a.md','docs/new 文档.md'].sort());
    assert.ok(evaluate({...s,now}).reasons.includes('cannot_modify_own_constraints_requires_separate_trust_rollout'));
  } finally { process.chdir(prior);fs.rmSync(root,{recursive:true,force:true}); }
});
test('production flags are rejected; a test verdict cannot activate mutation adapters',() => {
  const f=fixture();
  for (const flag of ['automatic_merge','automatic_deploy','automatic_rollback','real_funds_enabled']) assert.throws(()=>f.run(undefined,{policy:{...policy,[flag]:true}}));
  const r=f.run();
  assert.deepEqual([r.automatic_merge,r.automatic_deploy,r.automatic_rollback,r.paid,r.tx_hash],[false,false,false,false,null]);
});
