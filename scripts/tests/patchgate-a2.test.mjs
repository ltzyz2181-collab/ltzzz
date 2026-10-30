import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {canonical, sha256, subjectFor, TASK} from '../lib/patchgate.mjs';
import {validateExecutorRegistry,signExecutorAttestation,notificationActorAllowed,validateA2Config,rolloutApproved,checksSatisfied,validateA2Request,a2GithubApi,mergeDocsOnce,externalAuditProofMatches,controllerMergeSubject} from '../lib/patchgate-a2.mjs';
import {createControllerDecisionAuthority,controllerDecisionEvidence} from '../lib/controller-decision.mjs';
import {A2_STOP_REF,prepareDocsReadback,verifyDocsMerge} from '../lib/patchgate-a2-readback.mjs';
const policy=JSON.parse(fs.readFileSync(new URL('../../config/patch-policy.json',import.meta.url)));
const defaults=JSON.parse(fs.readFileSync(new URL('../../config/patchgate-a2.json',import.meta.url)));
const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40),H='1'.repeat(64),REPO='ltzyz2181-collab/ltzzz',ROOT='/repos/'+REPO;
const now=Date.parse('2026-10-25T08:00:00Z');
// Test-only, process-local ephemeral keys. Never exported to production config.
const pairs=['openai','volcengine_ark','aliyun_dashscope','github_actions'].map((provider,i)=>({...generateKeyPairSync('ed25519'),provider,id:'fixture-key-'+i,executor:'fixture-executor-'+i}));
function fixture(){
  const trust={schema_version:1,enabled:true,source_binding_required:true,keys:pairs.map(p=>({id:p.id,executor:p.executor,provider:p.provider,enabled:true,allowed_signer_source_sha256:[H],source_deployment_verified:true,cloud_account_binding:'fixture-cloud',deployment_evidence_sha256:'e'.repeat(64),roles:p.provider==='github_actions'?['checks','external_audit_readback']:['author','review','stage_review'],public_key_pem:p.publicKey.export({format:'pem',type:'spki'}),not_before:'2026-10-24T00:00:00Z',not_after:'2026-10-26T00:00:00Z'}))};
  const registry={schema_version:1,repository:REPO,executors:trust.keys.map(k=>({id:k.executor,provider:k.provider,signing_key_ids:[k.id],roles:k.roles,signing_enabled:true,allowed_signer_source_sha256:k.allowed_signer_source_sha256,source_deployment_verified:true,cloud_account_binding:k.cloud_account_binding,deployment_evidence_sha256:k.deployment_evidence_sha256}))};
  const sign=(i,payload)=>signExecutorAttestation({registry,trust,executorId:pairs[i].executor,keyId:pairs[i].id,privateKey:pairs[i].privateKey.export({format:'pem',type:'pkcs8'}),payload:{at_utc:new Date(now).toISOString(),signer_source_sha256:H,signer_cloud_account_binding:'fixture-cloud',signer_deployment_evidence_sha256:'e'.repeat(64),...(payload.role==='stage_review'?{review_scope:'A2_L0_docs_only'}:{}),...payload}});
  const snapshot={repository:REPO,task_id:TASK,base_sha:A,head_sha:B,policy_sha256:sha256(canonical(policy)),trust_sha256:sha256(canonical(trust)),files:[{path:'docs/a2-acceptance.md',mode:'100644',old_mode:null,diff:'@@ -0,0 +1 @@\n+ordinary documentation only\n',binary:false}]};
  const subject=subjectFor(snapshot),checkRuns=[{name:'patchgate-a2-base-checks',head_sha:B,status:'completed',conclusion:'success'}];
  const author=sign(0,{subject,role:'author'}),checks=sign(3,{subject,role:'checks',passed:true,checker_base_sha:A,checks_sha256:sha256(canonical(checkRuns))});
  const review=i=>sign(i,{subject,role:'review',verdict:'approve',generation_verified:true,metadata_source:'provider_response',model:'fixture-native-'+i,finish_reason:'stop',output_sha256:H});
  const rolloutSubject={task_id:TASK,phase:'A2',runtime_bundle_sha256:H};
  const config={...defaults,authorization_mode:'independent_signers',signer_source_binding_required:true,required_stage_auditors:['aliyun_dashscope','volcengine_ark'],required_candidate_review_providers:['aliyun_dashscope','volcengine_ark'],enabled:true,base_compare_and_swap_verified:true,production_signing_keys_provisioned:true,runtime_bundle_sha256:H,stage_audits:[1,2].map(i=>sign(i,{subject:rolloutSubject,role:'stage_review',verdict:'approve',artifact_sha256:H,reviewed_source_commit:A}))};
  const auditMetadata={schema:'ltzzz.external-stage-audit.v1',task_id:TASK,phase:'A2',seat:'claude',verdict:'approve',reviewed_source_commit:A,runtime_bundle_sha256:H};
  const auditBytes=Buffer.from('```json\n'+JSON.stringify(auditMetadata)+'\n```\nFixture external report, not a native provider attestation.\n');
  const readback={schema:'ltzzz.external-audit-pr-readback.v1',source:'github_rest_immutable_pr_file',repository:REPO,pr_http_status:200,file_http_status:200,pr_number:244,pr_head_sha:C,pr_url:'https://github.com/'+REPO+'/pull/244',submitter_login:'fixture-audit-submitter',submitter_id:'42',artifact:{path:'knowledge/results/patchgate/a2-fixture-audit.md',blob_sha:C,sha256:sha256(auditBytes)},body_base64:auditBytes.toString('base64'),fetched_at_utc:new Date(now).toISOString(),reviewed_source_commit:A,reviewed_bundle_sha256:H,reviewed_bundle_verification:'trusted_base_fixed_manifest',native_authorship_verified:false};
  readback.artifact.blob_sha=createHash('sha1').update(Buffer.from('blob '+auditBytes.length+'\0')).update(auditBytes).digest('hex');
  const externalProof=sign(3,{subject:rolloutSubject,role:'external_audit_readback',seat:'claude',channel:'repository_pr_readback',verdict:'approve',reviewed_source_commit:A,artifact_sha256:readback.artifact.sha256,audit_pr_number:244,audit_pr_head_sha:C,readback_sha256:sha256(canonical(readback)),native_authorship_verified:false,counts_toward_model_quorum:false});
  config.external_stage_audits=[externalProof];
  const pr={number:250,state:'open',draft:false,merged:false,base:{ref:'main',sha:A,repo:{full_name:REPO}},head:{sha:B,repo:{full_name:REPO}},author_association:'OWNER',mergeable:true,mergeable_state:'clean'};
  const T='1'.repeat(40),U='2'.repeat(40),V='3'.repeat(40),D='d'.repeat(40);
  const state={refs:new Map(),merges:0,receipts:[],pr,main:A,
    commits:{[A]:{sha:A,tree:{sha:T},parents:[]},[B]:{sha:B,tree:{sha:U},parents:[{sha:A}]},[C]:{sha:C,tree:{sha:V},parents:[{sha:A},{sha:B}]}},
    trees:{[T]:[],[U]:[{path:snapshot.files[0].path,mode:'100644',type:'blob',sha:D}],[V]:[{path:snapshot.files[0].path,mode:'100644',type:'blob',sha:D}]}};
  const api=async(method,url,body)=>{
    validateA2Request(method,url,body);
    if(method==='GET'&&url===ROOT+'/pulls/250')return {status:200,data:structuredClone(state.pr)};
    if(method==='GET'&&url===ROOT+'/git/ref/heads/main')return {status:200,data:{ref:'refs/heads/main',object:{sha:state.main}}};
    if(method==='GET'&&url.startsWith(ROOT+'/git/commits/'))return {status:200,data:structuredClone(state.commits[url.split('/').at(-1)])};
    if(method==='GET'&&url.startsWith(ROOT+'/git/trees/')){const sha=url.split('/').at(-1).split('?')[0];return {status:200,data:{sha,truncated:false,tree:structuredClone(state.trees[sha])}};}
    if(method==='GET'&&url.startsWith(ROOT+'/compare/'))return {status:200,data:{base_commit:{sha:A},merge_base_commit:{sha:A},status:'ahead'}};
    if(method==='GET'&&url===ROOT+'/git/ref/heads/'+A2_STOP_REF){const ref='refs/heads/'+A2_STOP_REF;return state.refs.has(ref)?{status:200,data:{ref,object:{sha:state.refs.get(ref)}}}:{status:404};}
    if(method==='DELETE'&&url===ROOT+'/git/refs/heads/'+A2_STOP_REF){state.refs.delete('refs/heads/'+A2_STOP_REF);return {status:204};}
    if(method==='POST'&&url===ROOT+'/git/refs'){
      if(state.refs.has(body.ref))return {status:422};state.refs.set(body.ref,body.sha);return {status:201,data:{ref:body.ref,object:{sha:body.sha}}};
    }
    if(method==='GET'&&url.startsWith(ROOT+'/git/ref/heads/patchgate-a2-actions/')){
      const ref='refs/heads/'+url.split('/git/ref/heads/')[1];return state.refs.has(ref)?{status:200,data:{ref,object:{sha:state.refs.get(ref)}}}:{status:404};
    }
    if(method==='PUT'&&url===ROOT+'/pulls/250/merge'){
      state.merges++;if(body.sha!==state.pr.head.sha)return {status:409};state.pr.merged=true;state.pr.state='closed';state.pr.merge_commit_sha=C;state.main=C;return {status:200,data:{merged:true,sha:C}};
    }
    if(method==='PUT'&&url.includes('/contents/knowledge/results/patchgate/a2/')){state.receipts.push(JSON.parse(Buffer.from(body.content,'base64').toString()));return {status:201};}
    throw Error('fixture_unhandled');
  };
  const args={api,config,registry,policy,trust,snapshot,attestations:[author,checks,review(1),review(2)],checkRuns,runnerSha:A,runtimeBundleSha256:H,externalAuditReadbacks:[readback],prNumber:250,runId:'12345',now};
  return {args,state,sign,subject,author,checks,review,readback,externalProof,rolloutSubject};
}

test('production configuration remains disabled, unsigned and no side effects',()=>{
  assert.equal(validateA2Config(defaults),defaults);assert.equal(defaults.enabled,false);assert.equal(defaults.production_signing_keys_provisioned,false);
  assert.equal(defaults.base_compare_and_swap_verified,false);assert.deepEqual(defaults.stage_audits,[]);assert.deepEqual(defaults.notification_actors,[]);
});
async function controlledFixture(){
 const f=fixture();f.args.config={...defaults,enabled:true,runtime_bundle_sha256:H};f.args.attestations=[];
 f.args.trust={schema_version:1,enabled:false,keys:[]};f.args.registry={executors:[]};f.args.snapshot.trust_sha256=sha256(canonical(f.args.trust));
 const authorize=createControllerDecisionAuthority({controllerIds:['gpt'],authenticate:async()=>({verified:true,controller_id:'gpt',identity_evidence_sha256:H})});
 const subject=controllerMergeSubject({...f.args,subject:subjectFor(f.args.snapshot)});
 f.args.controllerDecision=await authorize({subject,now});return f;
}
test('controller mode merges docs through the same latch and readback with no model signing keys',async()=>{
 const f=await controlledFixture(),r=await mergeDocsOnce(f.args);assert.equal(r.status,'merged_readback_verified');assert.equal(f.state.merges,1);
 assert.equal(r.receipt_persisted,true);assert.equal(r.stop_latch_released,true);assert.equal(f.args.trust.keys.length,0);
});
test('configuration, advisory prose and serialized controller evidence cannot authorize a merge',async()=>{
 for(const token of [undefined,{verified:true}]){const f=await controlledFixture();f.args.controllerDecision=token;const r=await mergeDocsOnce(f.args);assert.equal(r.status,'A2_controller_identity_required');assert.equal(f.state.merges,0);assert.equal(f.state.refs.size,0);}
 const f=await controlledFixture();f.args.controllerDecision=controllerDecisionEvidence(f.args.controllerDecision);assert.equal((await mergeDocsOnce(f.args)).automatic_merge,false);
});
test('controller grant cannot authorize changed head, checks or runtime bytes',async()=>{
 for(const mutate of [f=>f.args.snapshot.head_sha=C,f=>f.args.checkRuns[0].conclusion='failure',f=>f.args.runtimeBundleSha256='2'.repeat(64)]){
  const f=await controlledFixture();mutate(f);assert.equal((await mergeDocsOnce(f.args)).automatic_merge,false);assert.equal(f.state.merges,0);
 }
});
test('controller mode retains protected-path, binary and mode fences',async()=>{
 for(const change of [{path:'wallet/addresses.md'},{mode:'120000'},{binary:true},{path:'.github/workflows/evil.md'}]){
  const f=await controlledFixture();Object.assign(f.args.snapshot.files[0],change);
  const authorize=createControllerDecisionAuthority({controllerIds:['gpt'],authenticate:async()=>({verified:true,controller_id:'gpt',identity_evidence_sha256:H})});
  f.args.controllerDecision=await authorize({subject:controllerMergeSubject({...f.args,subject:subjectFor(f.args.snapshot)}),now});
  assert.equal((await mergeDocsOnce(f.args)).automatic_merge,false);assert.equal(f.state.merges,0);
 }
});
test('real current executor transports are not yet admitted as cryptographic signers',()=>{
  const registry=JSON.parse(fs.readFileSync(new URL('../../config/patchgate-executors.json',import.meta.url))),trust=JSON.parse(fs.readFileSync(new URL('../../config/patchgate-trust.json',import.meta.url)));
  assert.equal(validateExecutorRegistry({registry,trust}),false);
});
test('disabled A2 makes zero network calls even if candidate proof fixtures are valid',async()=>{
  const f=fixture();let calls=0;
  const r=await mergeDocsOnce({...f.args,config:defaults,api:async()=>{calls++;throw Error('no network');}});
  assert.equal(r.status,'A2_disabled_or_runtime_not_bound');assert.equal(calls,0);
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
test('two native model signers plus separate Claude PR readback required',()=>{
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
  assert.equal(f.state.merges,1);assert.equal(results.filter(r=>r.status==='merged_readback_verified').length,1);assert.equal(results.filter(r=>['existing_claim_reconcile_no_repeat','A2_execution_stopped_reconcile_required'].includes(r.status)).length,1);
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
  const r=await mergeDocsOnce({...f.args,api});assert.equal(r.status,'outcome_unknown_reconcile_no_retry');assert.equal(r.automatic_retry,false);assert.equal(f.state.merges,1);assert.equal(f.state.refs.size,2);assert.equal(f.state.refs.has('refs/heads/'+A2_STOP_REF),true);
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

test('B2 PR248 requires post-merge controls for L0 and makes no atomic expected-base claim',()=>{const f=fixture();assert.equal(rolloutApproved({...f.args,config:{...f.args.config,base_compare_and_swap_verified:false}}),true);assert.throws(()=>validateA2Config({...defaults,postmerge_readback_enforced:false}));assert.throws(()=>validateA2Config({...defaults,allowed_risk_classes:['L1']}));});

test('readonly preflight reports real blockers; bundle changes invalidate approved audits',async()=>{
  const {bundleDigest,preflightA2}=await import('../patchgate-a2-preflight.mjs');
  const read=name=>fs.readFileSync(new URL('../../'+name,import.meta.url));
  const out=preflightA2({read,sourceCommit:A,now});
  assert.equal(out.blockers.includes('registered_real_signers_not_provisioned'),false);
  assert.ok(out.blockers.includes('controller_runtime_not_enabled_or_bound'));
  assert.ok(out.blockers.includes('A2_switch_disabled'));assert.equal(out.blockers.includes('atomic_base_fence_not_implemented_or_verified'),false);
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

function externalCase(f,{metadata={},readback={},payload={}}={}){
  const r=structuredClone(f.readback),text=Buffer.from(r.body_base64,'base64').toString('utf8');
  const original=JSON.parse(/^```json\n([\s\S]*?)\n```/.exec(text)[1]);
  const bytes=Buffer.from('```json\n'+JSON.stringify({...original,...metadata})+'\n```\nExternal fixture report.\n');
  r.body_base64=bytes.toString('base64');r.artifact.sha256=sha256(bytes);
  r.artifact.blob_sha=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
  Object.assign(r,readback);
  const proof=f.sign(3,{...f.externalProof.payload,readback_sha256:sha256(canonical(r)),artifact_sha256:r.artifact.sha256,...payload});
  return {...f.args,config:{...f.args.config,external_stage_audits:[proof]},externalAuditReadbacks:[r]};
}
function advisoryMatches(args){
  return externalAuditProofMatches({record:args.config.external_stage_audits[0],trust:args.trust,readbacks:args.externalAuditReadbacks,
    subject:{task_id:TASK,phase:'A2',runtime_bundle_sha256:H},now});
}
test('controller mode removes native signer prerequisites; Claude remains advisory',()=>{
  assert.equal(defaults.authorization_mode,'authenticated_controller');
  assert.deepEqual(defaults.required_stage_auditors,[]);
  assert.deepEqual(defaults.required_candidate_review_providers,[]);
  assert.equal(defaults.claude_audit_channel.native_authorship_verified,false);
  assert.equal(defaults.claude_audit_channel.counts_toward_model_quorum,false);
  assert.equal(defaults.claude_audit_channel.required_before_rollout,false);
  assert.equal(defaults.claude_audit_channel.admission_authority,'none_shared_github_login');
  assert.throws(()=>validateA2Config({...defaults,required_stage_auditors:['anthropic','aliyun_dashscope']}));
  assert.throws(()=>validateA2Config({...defaults,claude_audit_channel:{...defaults.claude_audit_channel,required_before_rollout:true}}));
});
test('C1 shared-login Claude readback is advisory; exact two-provider quorum remains mandatory',()=>{
  const f=fixture();assert.equal(rolloutApproved({...f.args,externalAuditReadbacks:[]}),true);
  assert.equal(rolloutApproved({...f.args,config:{...f.args.config,external_stage_audits:[]}}),true);
  assert.equal(rolloutApproved(externalCase(f)),true);
  const forged=externalCase(f,{payload:{native_authorship_verified:true,counts_toward_model_quorum:true}});
  for(const stage_audits of [[],[f.args.config.stage_audits[0]],[f.externalProof]])
    assert.equal(rolloutApproved({...forged,config:{...forged.config,stage_audits}}),false);
});
test('B1 infrastructure Claude readback cannot replace either native model signature',()=>{
  const f=fixture();assert.equal(rolloutApproved({...f.args,config:{...f.args.config,stage_audits:[f.args.config.stage_audits[0],f.externalProof]}}),false);
  assert.equal(advisoryMatches(externalCase(f,{payload:{native_authorship_verified:true}})),false);
  assert.equal(advisoryMatches(externalCase(f,{payload:{counts_toward_model_quorum:true}})),false);
  const proof=f.sign(1,{...f.externalProof.payload,role:'stage_review'});
  assert.equal(rolloutApproved({...f.args,config:{...f.args.config,stage_audits:[proof],external_stage_audits:[proof]}}),false);
});
test('advisory helper does not relabel old REVISE, forged subject, wrong report head or unchecked bundle as approve',()=>{
  const f=fixture();
  for(const changes of [{metadata:{verdict:'revise'}},{metadata:{verdict:'reject'}},{metadata:{runtime_bundle_sha256:'0'.repeat(64)}},{metadata:{task_id:'ANOTHER-TASK'}},{metadata:{seat:'gpt'}},{metadata:{reviewed_source_commit:C}},{readback:{reviewed_bundle_verification:'model_self_report'}},{payload:{audit_pr_head_sha:A}}])
    assert.equal(advisoryMatches(externalCase(f,changes)),false);
});
test('B1 changed bytes, Git blob, stale readback, path escape and unsafe clock fail closed',()=>{
  const f=fixture();
  for(const changes of [{body_base64:Buffer.from('tampered').toString('base64')},{artifact:{...f.readback.artifact,blob_sha:A}},{fetched_at_utc:'2026-10-20T00:00:00.000Z'},{fetched_at_utc:'2026-10-26T00:00:00.000Z'},{artifact:{...f.readback.artifact,path:'knowledge/results/patchgate/../other.md'}},{file_http_status:404}])
    assert.equal(advisoryMatches(externalCase(f,{readback:changes})),false);
  const proof={record:f.externalProof,trust:f.args.trust,readbacks:[f.readback],subject:f.rolloutSubject};
  assert.equal(externalAuditProofMatches({...proof,now:NaN}),false);
  assert.equal(externalAuditProofMatches({...proof,now,maxAge:-1}),false);
});
test('B1 only evidence arrays are excluded from bundle; signing route remains protected',async()=>{
  const {bundleDigest}=await import('../patchgate-a2-preflight.mjs'),read=name=>fs.readFileSync(new URL('../../'+name,import.meta.url));
  const original=bundleDigest({read});
  const evidence=bundleDigest({read:name=>name==='config/patchgate-a2.json'?JSON.stringify({...defaults,external_stage_audits:[{untrusted:true}]}):read(name)});
  assert.equal(original.sha256,evidence.sha256);
  const changed=bundleDigest({read:name=>name==='config/patchgate-a2.json'?JSON.stringify({...defaults,claude_audit_channel:{...defaults.claude_audit_channel,required_before_rollout:true}}):read(name)});
  assert.notEqual(original.sha256,changed.sha256);
});
test('B1 helper authenticates its own raw record; unsigned provider prose and corrupted signatures fail',()=>{
  const f=fixture(),inputs={record:f.externalProof,trust:f.args.trust,readbacks:[f.readback],subject:f.rolloutSubject,now};
  assert.equal(externalAuditProofMatches(inputs),true);
  const forgeries=[{provider:'github_actions',payload:f.externalProof.payload},{...f.externalProof,signature:'A'.repeat(86)+'=='},{...f.externalProof,key_id:'unregistered'},{...f.externalProof,payload:{...f.externalProof.payload,verdict:'reject'}}];
  for(const record of forgeries){assert.equal(externalAuditProofMatches({...inputs,record}),false);assert.equal(rolloutApproved({...f.args,config:{...f.args.config,stage_audits:[],external_stage_audits:[record]}}),false);}
});
test('B1 schema checks are deterministic and noncanonical base64 or unsafe artifact paths are rejected',()=>{
  const f=fixture();
  assert.equal(advisoryMatches(externalCase(f,{metadata:{schema:'ltzzz.external-stage-audit.v0.9'}})),false);
  for(const path of ['knowledge/results/patchgate/evil\0.md','knowledge/results/patchgate/evil\\name.md','knowledge/results/patchgate/evil／name.md','knowledge/results/patchgate/../evil.md'])
    assert.equal(advisoryMatches(externalCase(f,{readback:{artifact:{...f.readback.artifact,path}}})),false);
  for(const body_base64 of [f.readback.body_base64+'\n','!'+f.readback.body_base64])
    assert.equal(advisoryMatches(externalCase(f,{readback:{body_base64}})),false);
});
test('C3 changing the candidate-test workflow invalidates the registered runtime bundle',async()=>{
  const {bundleDigest}=await import('../patchgate-a2-preflight.mjs'),read=name=>fs.readFileSync(new URL('../../'+name,import.meta.url));
  const original=bundleDigest({read});
  const changed=bundleDigest({read:name=>name==='.github/workflows/patchgate-a2-verify.yml'?Buffer.concat([read(name),Buffer.from('\n# altered checker\n')]):read(name)});
  assert.notEqual(original.sha256,changed.sha256);
});

test('B2 verified merge records exact parents and content manifest before releasing global stop',async()=>{
  const f=fixture(),r=await mergeDocsOnce(f.args);
  assert.equal(r.postmerge_verification.verified,true);assert.equal(r.postmerge_verification.actual_base_sha,A);
  assert.equal(r.postmerge_verification.approved_head_sha,B);assert.equal(r.postmerge_verification.merge_commit_sha,C);
  assert.equal(r.postmerge_verification.candidate_manifest_sha256,r.postmerge_verification.actual_manifest_sha256);
  assert.equal(r.stop_latch_released,true);assert.equal(f.state.refs.has('refs/heads/'+A2_STOP_REF),false);
});
test('B2 identical filenames with altered bytes, extra files or executable modes halt subsequent invocations',async()=>{
  for(const mutate of [s=>s.trees['3'.repeat(40)][0].sha='e'.repeat(40),s=>s.trees['3'.repeat(40)].push({path:'docs/unreviewed.md',mode:'100644',type:'blob',sha:A}),s=>s.trees['3'.repeat(40)][0].mode='100755',s=>s.trees['3'.repeat(40)][0].mode='120000']){
    const f=fixture();mutate(f.state);const r=await mergeDocsOnce(f.args);
    assert.equal(r.status,'post_merge_validation_failed_stopped');assert.equal(r.merge_operation_confirmed,true);
    assert.equal(r.automatic_merge,false);assert.equal(r.execution_stopped,true);assert.equal(f.state.receipts.length,1);
    const fresh=fixture();fresh.state.refs=f.state.refs;
    assert.equal((await mergeDocsOnce(fresh.args)).status,'A2_execution_stopped_reconcile_required');assert.equal(fresh.state.merges,0);
  }
});
test('B2 actual merge must have exactly two parents and the approved HEAD as second parent',async()=>{
  for(const parents of [[{sha:A}],[{sha:B},{sha:A}],[{sha:A},{sha:B},{sha:C}]]){
    const f=fixture();f.state.commits[C].parents=parents;
    const r=await mergeDocsOnce(f.args);assert.equal(r.status,'post_merge_validation_failed_stopped');assert.equal(r.error_code,'readback_merge_parents_mismatch');
  }
});
test('B2 premerge head tree must match approved paths and regular Markdown modes',async()=>{
  for(const mutate of [s=>s.trees['2'.repeat(40)][0].mode='120000',s=>s.trees['2'.repeat(40)].push({path:'scripts/hidden.mjs',mode:'100644',type:'blob',sha:A})]){
    const f=fixture();mutate(f.state);await assert.rejects(mergeDocsOnce(f.args),/manifest_mismatch/);assert.equal(f.state.refs.size,0);assert.equal(f.state.merges,0);
  }
});
test('B2 truncated or unreadable postmerge trees cannot be accepted and retain stop',async()=>{
  for(const change of [r=>r.data.truncated=true,r=>r.status=503,r=>r.data.tree.push({...r.data.tree[0]})]){
    const f=fixture(),base=f.args.api,api=async(m,u,b)=>{const r=await base(m,u,b);if(u.includes('/git/trees/'+'3'.repeat(40)))change(r);return r;};
    const r=await mergeDocsOnce({...f.args,api});assert.equal(r.status,'post_merge_validation_failed_stopped');assert.equal(r.execution_stopped,true);
  }
});
function concurrentBase(f,path='docs/unrelated.md'){
  const P='e'.repeat(40),W='4'.repeat(40),entry={path,mode:'100644',type:'blob',sha:'f'.repeat(40)};
  f.state.commits[C].parents[0].sha=P;f.state.commits[P]={sha:P,tree:{sha:W},parents:[{sha:A}]};
  f.state.trees[W]=[entry];f.state.trees['3'.repeat(40)].push(entry);return P;
}
test('B2 concurrent ordinary Markdown remains outside our delta and exact candidate bytes survive',async()=>{
  const f=fixture(),P=concurrentBase(f),r=await mergeDocsOnce(f.args);
  assert.equal(r.status,'merged_readback_verified');assert.equal(r.postmerge_verification.base_moved,true);assert.equal(r.postmerge_verification.actual_base_sha,P);assert.equal(r.postmerge_verification.changed_file_count,1);
});
test('B2 concurrent executable or policy base changes invalidate old audits even if merge delta is docs',async()=>{
  for(const path of ['scripts/changed.mjs','config/patch-policy.json','memory/promote/queue.json']){
    const f=fixture();concurrentBase(f,path);const r=await mergeDocsOnce(f.args);
    assert.equal(r.status,'post_merge_validation_failed_stopped');assert.equal(r.error_code,'readback_concurrent_base_not_L0_docs');
  }
});
test('B2 concurrent changes to an approved path cannot be silently merged into different bytes',async()=>{
  const f=fixture();concurrentBase(f,'docs/a2-acceptance.md');
  const r=await mergeDocsOnce(f.args);assert.equal(r.status,'post_merge_validation_failed_stopped');assert.equal(r.execution_stopped,true);
});
test('B2 receipt persistence or latch-release uncertainty never resumes execution',async()=>{
  for(const phase of ['receipt','release']){
    const f=fixture(),base=f.args.api,api=async(m,u,b)=>{if((phase==='receipt'&&u.includes('/contents/'))||(phase==='release'&&m==='DELETE'))throw Error('response_lost');return base(m,u,b);};
    const r=await mergeDocsOnce({...f.args,api});assert.equal(r.status,'merged_readback_verified');assert.equal(r.stop_latch_released,false);assert.equal(r.execution_stopped,true);assert.equal(f.state.refs.has('refs/heads/'+A2_STOP_REF),true);
  }
});
test('B2 new REST reads and deletion are exact whitelist routes; arbitrary ref deletion remains forbidden',async()=>{
  validateA2Request('DELETE',ROOT+'/git/refs/heads/'+A2_STOP_REF);
  let calls=0;const api=a2GithubApi({fetchImpl:async()=>{calls++;throw Error('forbidden');}});
  for(const endpoint of ['/git/refs/heads/main','/git/refs/heads/'+A2_STOP_REF+'?force=1','/git/refs/heads/another','/git/refs/heads/'+A2_STOP_REF+'/../main'])await assert.rejects(api('DELETE',ROOT+endpoint));
  for(const endpoint of ['/git/trees/'+A+'?recursive=1&x=1','/git/commits/main','/compare/main...'+B])await assert.rejects(api('GET',ROOT+endpoint));
  assert.equal(calls,0);
});
test('B2 postmerge verifier implementation is inside the reviewed runtime bundle',async()=>{
  const {bundleDigest}=await import('../patchgate-a2-preflight.mjs'),read=name=>fs.readFileSync(new URL('../../'+name,import.meta.url));
  assert.notEqual(bundleDigest({read}).sha256,bundleDigest({read:name=>name==='scripts/lib/patchgate-a2-readback.mjs'?Buffer.concat([read(name),Buffer.from('\n// changed\n')]):read(name)}).sha256);
});
