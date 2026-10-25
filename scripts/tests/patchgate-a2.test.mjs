import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateKeyPairSync} from 'node:crypto';
import {canonical, sha256, subjectFor, TASK} from '../lib/patchgate.mjs';
import {validateExecutorRegistry,signExecutorAttestation,notificationActorAllowed,validateA2Config,rolloutApproved,checksSatisfied,validateA2Request,a2GithubApi,mergeDocsOnce} from '../lib/patchgate-a2.mjs';
const policy=JSON.parse(fs.readFileSync(new URL('../../config/patch-policy.json',import.meta.url)));
const defaults=JSON.parse(fs.readFileSync(new URL('../../config/patchgate-a2.json',import.meta.url)));
const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40),H='1'.repeat(64),REPO='ltzyz2181-collab/ltzzz',ROOT='/repos/'+REPO;
const now=Date.parse('2026-10-25T08:00:00Z');
// Test-only, process-local ephemeral keys. Never exported to production config.
const pairs=['openai','anthropic','aliyun_dashscope','github_actions'].map((provider,i)=>({...generateKeyPairSync('ed25519'),provider,id:'fixture-key-'+i,executor:'fixture-executor-'+i}));
function fixture(){
  const trust={schema_version:1,enabled:true,keys:pairs.map(p=>({id:p.id,executor:p.executor,provider:p.provider,enabled:true,roles:p.provider==='github_actions'?['checks']:['author','review','stage_review'],public_key_pem:p.publicKey.export({format:'pem',type:'spki'}),not_before:'2026-10-24T00:00:00Z',not_after:'2026-10-26T00:00:00Z'}))};
  const registry={schema_version:1,repository:REPO,executors:trust.keys.map(k=>({id:k.executor,provider:k.provider,signing_key_ids:[k.id],roles:k.roles,signing_enabled:true}))};
  const sign=(i,payload)=>signExecutorAttestation({registry,trust,executorId:pairs[i].executor,keyId:pairs[i].id,privateKey:pairs[i].privateKey.export({format:'pem',type:'pkcs8'}),payload:{at_utc:new Date(now).toISOString(),...payload}});
  const snapshot={repository:REPO,task_id:TASK,base_sha:A,head_sha:B,policy_sha256:sha256(canonical(policy)),trust_sha256:sha256(canonical(trust)),files:[{path:'docs/a2-acceptance.md',mode:'100644',old_mode:null,diff:'@@ -0,0 +1 @@\n+ordinary documentation only\n',binary:false}]};
  const subject=subjectFor(snapshot),checkRuns=[{name:'patchgate-a2-base-checks',head_sha:B,status:'completed',conclusion:'success'}];
  const author=sign(0,{subject,role:'author'}),checks=sign(3,{subject,role:'checks',passed:true,checker_base_sha:A,checks_sha256:sha256(canonical(checkRuns))});
  const review=i=>sign(i,{subject,role:'review',verdict:'approve',generation_verified:true,metadata_source:'provider_response',model:'fixture-native-'+i,finish_reason:'stop',output_sha256:H});
  const rolloutSubject={task_id:TASK,phase:'A2',runtime_bundle_sha256:H};
  const config={...defaults,enabled:true,base_compare_and_swap_verified:true,production_signing_keys_provisioned:true,runtime_bundle_sha256:H,stage_audits:[1,2].map(i=>sign(i,{subject:rolloutSubject,role:'stage_review',verdict:'approve',artifact_sha256:H,reviewed_source_commit:A}))};
  const pr={number:250,state:'open',draft:false,merged:false,base:{ref:'main',sha:A,repo:{full_name:REPO}},head:{sha:B,repo:{full_name:REPO}},author_association:'OWNER',mergeable:true,mergeable_state:'clean'};
  const state={refs:new Map(),merges:0,receipts:[],pr,main:A};
  const api=async(method,url,body)=>{
    validateA2Request(method,url,body);
    if(method==='GET'&&url===ROOT+'/pulls/250')return {status:200,data:structuredClone(state.pr)};
    if(method==='GET'&&url===ROOT+'/git/ref/heads/main')return {status:200,data:{ref:'refs/heads/main',object:{sha:state.main}}};
    if(method==='POST'&&url===ROOT+'/git/refs'){
      if(state.refs.has(body.ref))return {status:422};state.refs.set(body.ref,body.sha);return {status:201};
    }
    if(method==='GET'&&url.startsWith(ROOT+'/git/ref/heads/patchgate-a2-actions/')){
      const ref='refs/heads/'+url.split('/git/ref/heads/')[1];return state.refs.has(ref)?{status:200,data:{ref,object:{sha:state.refs.get(ref)}}}:{status:404};
    }
    if(method==='PUT'&&url===ROOT+'/pulls/250/merge'){
      state.merges++;if(body.sha!==state.pr.head.sha)return {status:409};state.pr.merged=true;state.pr.state='closed';state.pr.merge_commit_sha=C;return {status:200,data:{merged:true,sha:C}};
    }
    if(method==='PUT'&&url.includes('/contents/knowledge/results/patchgate/a2/')){state.receipts.push(JSON.parse(Buffer.from(body.content,'base64').toString()));return {status:201};}
    throw Error('fixture_unhandled');
  };
  const args={api,config,registry,policy,trust,snapshot,attestations:[author,checks,review(1),review(2)],checkRuns,runnerSha:A,runtimeBundleSha256:H,prNumber:250,runId:'12345',now};
  return {args,state,sign,subject,author,checks,review};
}

test('production configuration remains disabled, unsigned and no side effects',()=>{
  assert.equal(validateA2Config(defaults),defaults);assert.equal(defaults.enabled,false);assert.equal(defaults.production_signing_keys_provisioned,false);
  assert.equal(defaults.base_compare_and_swap_verified,false);assert.deepEqual(defaults.stage_audits,[]);assert.deepEqual(defaults.notification_actors,[]);
});
test('real current executor transports are not yet admitted as cryptographic signers',()=>{
  const registry=JSON.parse(fs.readFileSync(new URL('../../config/patchgate-executors.json',import.meta.url))),trust=JSON.parse(fs.readFileSync(new URL('../../config/patchgate-trust.json',import.meta.url)));
  assert.equal(validateExecutorRegistry({registry,trust}),false);
});
test('disabled A2 makes zero network calls even if candidate proof fixtures are valid',async()=>{
  const f=fixture();let calls=0;
  const r=await mergeDocsOnce({...f.args,config:defaults,api:async()=>{calls++;throw Error('no network');}});
  assert.equal(r.status,'A2_disabled_or_missing_audited_signers');assert.equal(calls,0);
});
test('one executor cannot change provider on rotation or alias the same public key',()=>{
  const f=fixture();assert.equal(validateExecutorRegistry(f.args),true);
  const trust=structuredClone(f.args.trust);trust.keys[1].executor=trust.keys[0].executor;
  assert.equal(validateExecutorRegistry({...f.args,trust}),false);
  const registry=structuredClone(f.args.registry);registry.executors[1].provider='openai';assert.equal(validateExecutorRegistry({...f.args,registry}),false);
});
test('signer checks private/public correspondence and refuses unregistered roles',()=>{
  const f=fixture();assert.throws(()=>signExecutorAttestation({...f.args,executorId:pairs[0].executor,keyId:pairs[0].id,privateKey:pairs[1].privateKey.export({type:'pkcs8',format:'pem'}),payload:{role:'author',subject:f.subject,at_utc:new Date(now).toISOString()}}),/mismatch/);
  assert.throws(()=>f.sign(0,{subject:f.subject,role:'checks'}),/role_not_allowed/);
});
test('two exact rollout signers required; missing Claude or changed runtime blocks',()=>{
  const f=fixture();assert.equal(rolloutApproved({...f.args}),true);
  assert.equal(rolloutApproved({...f.args,config:{...f.args.config,stage_audits:f.args.config.stage_audits.slice(1)}}),false);
  assert.equal(rolloutApproved({...f.args,runnerSha:'bad'}),false);assert.equal(rolloutApproved({...f.args,runtimeBundleSha256:'2'.repeat(64)}),false);
});
test('notification allowlist binds exact GitHub login, numeric id and independent executor',()=>{
  const x={readback:{actor_login:'bot',actor_id:'42'},proof:{executor:'notify-bot',payload:{actor_login:'bot',actor_id:'42'}},allowlist:[{login:'bot',id:42,executor:'notify-bot'}],authorExecutor:'author'};
  assert.equal(notificationActorAllowed(x),true);
  assert.equal(notificationActorAllowed({...x,allowlist:[]}),false);
  assert.equal(notificationActorAllowed({...x,readback:{actor_login:'bot',actor_id:'43'}}),false);
  assert.equal(notificationActorAllowed({...x,authorExecutor:'notify-bot'}),false);
});
test('exact-head green checks include every required check; queued/skipped/missing fail',()=>{
  const f=fixture();assert.equal(checksSatisfied({...f.args,headSha:B}),true);
  for(const changes of [{status:'queued'},{conclusion:'skipped'},{head_sha:C},{name:'unrelated-check'}])assert.equal(checksSatisfied({...f.args,checkRuns:[{...f.args.checkRuns[0],...changes}],headSha:B}),false);
});
test('first fully signed fixture merges once and reads back exact merge SHA',async()=>{
  const f=fixture(),r=await mergeDocsOnce(f.args);assert.equal(r.status,'merged_readback_verified');assert.equal(r.merge_commit_sha,C);assert.equal(r.receipt_persisted,true);assert.equal(f.state.merges,1);
  assert.equal(r.financial_execution,false);assert.equal(r.automatic_deploy,false);assert.equal(r.paid,false);assert.equal(r.tx_hash,null);
});
test('simultaneous runners share atomic ref claim; loser never merges',async()=>{
  const f=fixture(),results=await Promise.all([mergeDocsOnce(f.args),mergeDocsOnce(f.args)]);
  assert.equal(f.state.merges,1);assert.equal(results.filter(r=>r.status==='merged_readback_verified').length,1);assert.equal(results.filter(r=>r.status==='existing_claim_reconcile_no_repeat').length,1);
});
test('an existing durable claim survives restart and prevents a second merge',async()=>{
  const f=fixture(),key=sha256(TASK+':'+B+':merge');f.state.refs.set('refs/heads/patchgate-a2-actions/'+key,A);
  const r=await mergeDocsOnce(f.args);assert.equal(r.status,'existing_claim_reconcile_no_repeat');assert.equal(f.state.merges,0);
});
test('shared claim timeout is unknown, not permission to retry',async()=>{
  const f=fixture(),api=async(m,u,b)=>{if(m==='POST')throw Error('network timeout');return f.args.api(m,u,b);};
  assert.equal((await mergeDocsOnce({...f.args,api})).status,'claim_outcome_unknown_reconcile_no_retry');assert.equal(f.state.merges,0);
});
test('head moved after reservation never invokes merge, writes failure',async()=>{
  const f=fixture(),api=async(m,u,b)=>{const r=await f.args.api(m,u,b);if(m==='POST')f.state.pr.head.sha=C;return r;};
  const r=await mergeDocsOnce({...f.args,api});assert.equal(r.status,'merge_failed');assert.equal(f.state.merges,0);assert.equal(f.state.receipts.length,1);
});
test('base moved after reservation invalidates old audits and checks',async()=>{
  const f=fixture(),api=async(m,u,b)=>{const r=await f.args.api(m,u,b);if(m==='POST')f.state.main=C;return r;};
  assert.equal((await mergeDocsOnce({...f.args,api})).status,'merge_failed');assert.equal(f.state.merges,0);
});
test('unknown merge outcome retains claim, records uncertainty, never retries',async()=>{
  const f=fixture(),api=async(m,u,b)=>{if(u.endsWith('/merge')){await f.args.api(m,u,b);throw Error('response lost');}return f.args.api(m,u,b);};
  const r=await mergeDocsOnce({...f.args,api});assert.equal(r.status,'outcome_unknown_reconcile_no_retry');assert.equal(r.automatic_retry,false);assert.equal(f.state.merges,1);assert.equal(f.state.refs.size,1);
});
test('cross-provider candidate review and exact signed check digest cannot be skipped',async()=>{
  const f=fixture();let calls=0;const api=async()=>{calls++;throw Error('no network');};
  for(const attestations of [[f.author,f.checks,f.review(1)],[f.author,f.review(1),f.review(2)], [f.author,f.sign(3,{subject:f.subject,role:'checks',passed:true,checker_base_sha:A,checks_sha256:'0'.repeat(64)}),f.review(1),f.review(2)]]){
    assert.equal((await mergeDocsOnce({...f.args,attestations,api})).status,'A2_admission_blocked');
  }
  assert.equal(calls,0);
});
test('public/fork/external PR or draft never receives a claim or merge',async()=>{
  for(const change of [{draft:true},{author_association:'FIRST_TIME_CONTRIBUTOR'},{head:{sha:B,repo:{full_name:'attacker/fork'}}},{mergeable_state:'unknown'}]){
    const f=fixture();Object.assign(f.state.pr,change);await assert.rejects(mergeDocsOnce(f.args),/PR_changed/);assert.equal(f.state.refs.size,0);
  }
});
test('A2 wrapper rejects arbitrary writes, foreign repos, missing expected-head and unsafe merge methods',()=>{
  const bad=[['PUT',ROOT+'/pulls/250/merge',{merge_method:'merge'}],['PUT',ROOT+'/pulls/250/merge',{sha:B,merge_method:'squash'}],['PATCH',ROOT+'/git/refs/heads/main',{sha:B,force:true}],['PUT',ROOT+'/contents/README.md',{content:'eA=='}],['POST','/repos/evil/repo/git/refs',{ref:'refs/heads/main',sha:B}],['GET','https://evil.invalid']];
  for(const args of bad)assert.throws(()=>validateA2Request(...args));
});
test('API transport uses fixed host, no redirects and never exposes key in records',async()=>{
  let request;const api=a2GithubApi({token:'fixture-only',fetchImpl:async(u,o)=>{request={u,o};return {status:200,text:async()=>JSON.stringify({number:250})};}});
  await api('GET',ROOT+'/pulls/250');assert.equal(request.u,'https://api.github.com'+ROOT+'/pulls/250');assert.equal(request.o.redirect,'error');assert.equal(request.o.headers.Authorization,'Bearer fixture-only');
});

test('base atomicity remains a mandatory activation prerequisite',()=>{const f=fixture();assert.equal(rolloutApproved({...f.args,config:{...f.args.config,base_compare_and_swap_verified:false}}),false);});

test('readonly preflight reports real blockers; bundle changes invalidate approved audits',async()=>{
  const {bundleDigest,preflightA2}=await import('../patchgate-a2-preflight.mjs');
  const read=name=>fs.readFileSync(new URL('../../'+name,import.meta.url));
  const out=preflightA2({read,sourceCommit:A,now});
  assert.ok(out.blockers.includes('registered_real_signers_not_provisioned'));
  assert.ok(out.blockers.includes('atomic_base_fence_not_implemented_or_verified'));
  assert.equal(out.native_model_calls,0);assert.equal(out.financial_execution,false);
  const original=bundleDigest({read}),changed=bundleDigest({read:name=>name==='config/patchgate-a2.json'?JSON.stringify({...defaults,enabled:true}):read(name)});
  assert.notEqual(original.sha256,changed.sha256);
  const evidenceOnly=bundleDigest({read:name=>name==='config/patchgate-a2.json'?JSON.stringify({...defaults,runtime_bundle_sha256:H,stage_audits:[{untrusted:true}]}):read(name)});
  assert.equal(original.sha256,evidenceOnly.sha256);
});

test('receipt transport rejects malformed/extra/funds fields before any HTTP request',async()=>{
  const f=fixture();await mergeDocsOnce(f.args);const valid=f.state.receipts[0],key=sha256(TASK+':'+B+':merge'),url=ROOT+'/contents/knowledge/results/patchgate/a2/'+key+'.json';
  let requests=0;
  const api=a2GithubApi({token:'fixture-only',fetchImpl:async()=>{requests++;throw Error('must never request');}});
  const mutation=[{schema_version:2},{phase:'A3'},{task_id:'../TASK'},{head_sha:A},{source_main_sha:'short'},{pr_number:'250'},{pr_number:0},{run_id:'123\n'},{at_utc:'yesterday'},{subject_sha256:'fake'},{reservation_retained:false},{automatic_merge:false},{automatic_deploy:true},{automatic_rollback:true},{financial_execution:true},{native_model_calls:1},{paid:true},{tx_hash:'0xdead'},{merge_commit_sha:'invalid'},{extra_field:'arbitrary body'}];
  for(const change of mutation){
    const body={branch:'patchgate-a2-actions/'+key,message:'A2 action outcome; reconcile before retry',content:Buffer.from(JSON.stringify({...valid,...change})).toString('base64')};
    await assert.rejects(api('PUT',url,body),/A2_api_request_not_allowed/);
  }
  const {at_utc,...missingTime}=valid;
  await assert.rejects(api('PUT',url,{branch:'patchgate-a2-actions/'+key,message:'A2 action outcome; reconcile before retry',content:Buffer.from(JSON.stringify(missingTime)).toString('base64')}),/A2_api_request_not_allowed/);
  assert.equal(requests,0);
});
test('base read wrapper only accepts one exact main ref route',()=>{
  validateA2Request('GET',ROOT+'/git/ref/heads/main');
  for(const route of ['/git/ref/heads/main?ref=evil','/git/ref/heads/main/../evil','/git/ref/heads/main/','/git/ref/heads/main%0a','/git/ref/heads/other'])assert.throws(()=>validateA2Request('GET',ROOT+route));
});
