import test from 'node:test';
import assert from 'node:assert/strict';
import {PROBE_TASK,PROBE_REPO,validateProbeCard,probeContext,probeKey,checkProbePR,validateProbeRequest,probeGithubApi,createProbeClaim,liveRaceProbe,summarizeProbeEvidence,assessProbeOnce} from '../lib/patchgate-doubao-probe.mjs';
const A='a'.repeat(40),B='b'.repeat(40),ROOT='/repos/'+PROBE_REPO;
const card={schema:'ltzzz.patchgate.doubao-probe.v1',task_id:PROBE_TASK,candidate_pr:240,candidate_head:B,run_live_cas:true,model_review:true,scope:'candidate_adversarial_probe_not_production_admission'};
function transport(){
 const refs=new Map(),writes=[];
 const api=async(method,url,body)=>{
  validateProbeRequest(method,url,body);
  if(method==='POST'){if(refs.has(body.ref))return {status:422};refs.set(body.ref,body.sha);return {status:201,data:{ref:body.ref,object:{sha:body.sha}}};}
  if(method==='GET'){const ref='refs/heads/'+url.split('/git/ref/heads/')[1];return refs.has(ref)?{status:200,data:{ref,object:{sha:refs.get(ref)}}}:{status:404};}
  if(method==='PUT'){writes.push(JSON.parse(Buffer.from(body.content,'base64')));return {status:201};}
  throw Error('unexpected test request');
 };return {api,refs,writes};
}
const candidate={schema:'ltzzz.patchgate.candidate-probes.v1',task_id:PROBE_TASK,candidate_head:B,source_main_sha:A,run_id:'123',shell_execution_provider:'github_actions',coverage:{forged_head:true,same_key_concurrency:true,receipt_injection:true,'422_without_ref':true},tests_passed:4,tests_failed:0,passed:true,paid:false,tx_hash:null};
test('probe card is exact, original task only, fixed full candidate and zero business authority',()=>{
 assert.equal(validateProbeCard(card),card);
 for(const x of [{...card,candidate_head:null},{...card,task_id:'NEW-ORDER'},{...card,candidate_pr:'240'},{...card,model_review:false},{...card,automatic_merge:true}])assert.throws(()=>validateProbeCard(x));
});
test('credentialed probe context must be exact main checkout, never PR candidate',()=>{
 const c={repository:PROBE_REPO,ref:'refs/heads/main',event:'push',sourceCommit:A,checkoutCommit:A,runId:'123'};
 assert.equal(probeContext(c).source_commit,A);
 for(const x of [{...c,event:'pull_request'},{...c,checkoutCommit:B},{...c,ref:'refs/heads/patch'},{...c,repository:'attacker/repo'}])assert.throws(()=>probeContext(x));
});
test('candidate PR must retain exact same-repo head, trusted author; draft probe allowed',()=>{
 const pr={number:240,state:'open',draft:true,base:{ref:'main',repo:{full_name:PROBE_REPO}},head:{sha:B,repo:{full_name:PROBE_REPO}},author_association:'OWNER'};
 assert.equal(checkProbePR(pr,card),true);
 for(const x of [{...pr,head:{sha:A,repo:{full_name:PROBE_REPO}}},{...pr,state:'closed'},{...pr,author_association:'NONE'},{...pr,head:{sha:B,repo:{full_name:'evil/repo'}}}])assert.throws(()=>checkProbePR(x,card));
});
test('API is fixed host, isolated create-only refs/receipts, no merge or arbitrary content',async()=>{
 let calls=0;const api=probeGithubApi({token:'fixture-token',fetchImpl:async()=>{calls++;throw Error('no outgoing');}});
 const bad=[['PUT',ROOT+'/pulls/240/merge',{sha:B}],['PATCH',ROOT+'/git/refs/heads/main',{sha:B}],['POST',ROOT+'/git/refs',{ref:'refs/heads/main',sha:A}],['GET',ROOT+'/git/ref/heads/main'],['GET','https://evil.invalid'],['PUT',ROOT+'/contents/README.md',{}],['GET','/repos/evil/repo/pulls/240']];
 for(const x of bad)await assert.rejects(api(...x));assert.equal(calls,0);
});
test('exact same key reservation across simultaneous callers makes exactly one model allowance',async()=>{
 const f=transport(),r=await Promise.all([createProbeClaim({api:f.api,card,sourceCommit:A}),createProbeClaim({api:f.api,card,sourceCommit:A})]);
 assert.equal(r.filter(x=>x.owned).length,1);assert.equal(r.filter(x=>x.status==='already_reserved_no_model_replay').length,1);assert.equal(f.refs.size,1);
});
test('422 without a matching ref fails closed, no model allowance',async()=>{
 const api=async(method)=>method==='POST'?{status:422}:{status:404};
 await assert.rejects(createProbeClaim({api,card,sourceCommit:A}),/422_without_matching_ref/);
});
test('unknown reservation outcome is not permission to retry',async()=>{
 const x=await createProbeClaim({api:async()=>{throw Error('timeout');},card,sourceCommit:A});assert.equal(x.owned,false);assert.match(x.status,/unknown/);
});
test('two live runner reports must show one new ref and one verified 422, not two old claims',async()=>{
 const f=transport(),races=await Promise.all(['a','b'].map(lane=>liveRaceProbe({api:f.api,card,sourceCommit:A,runId:'123',lane})));
 const r=summarizeProbeEvidence({card,sourceCommit:A,runId:'123',candidate,races});assert.equal(r.live_cross_runner_CAS_verified,true);assert.equal(r.deterministic_probe_passed,true);
 const old=await Promise.all(['a','b'].map(lane=>liveRaceProbe({api:f.api,card,sourceCommit:A,runId:'124',lane})));
 const noNew=summarizeProbeEvidence({card,sourceCommit:A,runId:'124',candidate:{...candidate,run_id:'124'},races:old});assert.equal(noNew.live_cross_runner_CAS_verified,false);
});
test('invalid, mismatched or missing candidate probe cases cannot be promoted',()=>{
 const noRace={...card,run_live_cas:false};
 for(const c of [{...candidate,candidate_head:A},{...candidate,run_id:'999'},{...candidate,paid:true}])assert.throws(()=>summarizeProbeEvidence({card:noRace,sourceCommit:A,runId:'123',candidate:c}));
 const x=summarizeProbeEvidence({card:noRace,sourceCommit:A,runId:'123',candidate:{...candidate,coverage:{}}});assert.equal(x.deterministic_probe_passed,false);
});
test('forged race head or duplicate lane is rejected as evidence',async()=>{
 const f=transport(),races=await Promise.all(['a','b'].map(lane=>liveRaceProbe({api:f.api,card,sourceCommit:A,runId:'123',lane})));
 assert.throws(()=>summarizeProbeEvidence({card,sourceCommit:A,runId:'123',candidate,races:[races[0],races[0]]}));
 assert.throws(()=>summarizeProbeEvidence({card,sourceCommit:A,runId:'123',candidate,races:[races[0],{...races[1],candidate_head:A}]}));
});
test('one native model assessment preserves runner/model distinction and never signs or authorizes',async()=>{
 const f=transport();let count=0;const result=await assessProbeOnce({api:f.api,card,sourceCommit:A,runId:'123',evidence:{deterministic_probe_passed:true},model:'doubao-seed-fixture',redactKeys:['secret-test-value'],call:async args=>{
  count++;assert.equal(f.refs.size,1);assert.equal(args.thinking,'disabled');assert.equal(args.maxTokens,4096);
  return {ok:true,model:'doubao-native-fixture',model_source:'provider_response',finish_reason:'stop',tokens_used:42,output:'{"verdict":"approve","note":"secret-test-value"}'};
 }});
 assert.equal(count,1);assert.equal(result.actual_model_provider,'volcengine_ark');assert.equal(result.shell_execution_provider,'github_actions');assert.equal(result.native_doubao_generation_verified,true);assert.equal(result.accepted,false);assert.equal(result.financial_execution,false);assert.equal(result.signing_executor_verified,false);assert.equal(result.receipt_persisted,true);assert.ok(!JSON.stringify(f.writes).includes('secret-test-value'));
 const duplicate=await assessProbeOnce({api:f.api,card,sourceCommit:A,runId:'124',evidence:{},model:'fixture',call:async()=>{count++;}});assert.equal(duplicate.model_calls,0);assert.equal(count,1);
});
test('incomplete, truncated or requested-model-only assessment is never native verified',async()=>{
 for(const response of [{ok:true,model_source:'requested_model',finish_reason:'stop',output:'text'},{ok:true,model_source:'provider_response',finish_reason:'length',output:'partial'},{ok:false,status:'unknown'}]){
  const f=transport(),r=await assessProbeOnce({api:f.api,card,sourceCommit:A,runId:'123',evidence:{},model:'fixture',call:async()=>response});assert.equal(r.model_calls,1);assert.equal(r.native_doubao_generation_verified,false);assert.equal(r.status,'model_incomplete_or_uncertain_no_retry');
 }
});
test('no credentials makes zero model requests and preserves durable blocker',async()=>{
 const f=transport();let calls=0;const r=await assessProbeOnce({api:f.api,card,sourceCommit:A,runId:'123',evidence:{},model:'fixture',credentialConfigured:false,call:async()=>{calls++;}});
 assert.equal(calls,0);assert.equal(r.model_calls,0);assert.equal(r.status,'blocked_model_channel_not_configured');assert.equal(r.receipt_persisted,true);
});
test('unknown model result or receipt write preserves reservation, never replays',async()=>{
 const f=transport(),api=async(m,u,b)=>{if(m==='PUT')throw Error('lost response');return f.api(m,u,b);};let calls=0;
 const r=await assessProbeOnce({api,card,sourceCommit:A,runId:'123',evidence:{},model:'fixture',call:async()=>{calls++;throw Error('unknown');}});assert.equal(r.model_calls,1);assert.equal(r.receipt_persisted,false);assert.equal(f.refs.size,1);
 const again=await assessProbeOnce({api,card,sourceCommit:A,runId:'124',evidence:{},model:'fixture',call:async()=>{calls++;}});assert.equal(again.model_calls,0);assert.equal(calls,1);
});
test('probe keys bind exact candidate/card but unrelated main commits and JSON order cannot create new allowance',()=>{
 const reordered=Object.fromEntries(Object.entries(card).reverse());
 assert.equal(probeKey(card,A),probeKey({...card},A));assert.notEqual(probeKey(card,A),probeKey({...card,candidate_head:A},A));assert.equal(probeKey(card,A),probeKey(card,B));assert.equal(probeKey(card,A),probeKey(reordered,B));
 assert.throws(()=>probeKey(card,'main'),/source_commit_required/);
});
test('a changed main source and reordered equivalent card still reuse reservation and make zero extra model calls',async()=>{
 const f=transport();let calls=0;
 const call=async()=>{calls++;return {ok:true,model:'fixture',model_source:'provider_response',finish_reason:'stop',output:'{"verdict":"approve"}'};};
 const first=await assessProbeOnce({api:f.api,card,sourceCommit:A,runId:'123',evidence:{},model:'fixture',call});
 const second=await assessProbeOnce({api:f.api,card:Object.fromEntries(Object.entries(card).reverse()),sourceCommit:B,runId:'124',evidence:{},model:'fixture',call});
 assert.equal(first.model_calls,1);assert.equal(second.model_calls,0);assert.equal(second.status,'already_reserved_no_model_replay');assert.equal(first.idempotency_key,second.idempotency_key);assert.equal(calls,1);assert.equal(f.refs.size,1);
});
test('receipt wrapper rejects authority escalation and card/key mismatch before HTTP',async()=>{
 const f=transport();await assessProbeOnce({api:f.api,card,sourceCommit:A,runId:'123',evidence:{},model:'fixture',credentialConfigured:false});
 const valid=f.writes[0],key=probeKey(card,A),url=ROOT+'/contents/knowledge/results/patchgate/a2-doubao/'+key+'.json';let sent=0;
 const api=probeGithubApi({token:'fixture',fetchImpl:async()=>{sent++;throw Error('no send');}});
 for(const mutation of [{paid:true},{tx_hash:'injected'},{accepted:true},{signing_executor_verified:true},{production_checker_verified:true},{api_bill_verified:true},{financial_execution:true},{automatic_deploy:true},{automatic_merge:true},{model_calls:2},{candidate_head:A},{probe_card:{...card,candidate_head:A}},{status:'merged'}]){
  const body={branch:'patchgate-a2-doubao-probes/'+key,message:'A2 Doubao probe evidence only; no admission authority',content:Buffer.from(JSON.stringify({...valid,...mutation})).toString('base64')};
  await assert.rejects(api('PUT',url,body));
 }
 assert.equal(sent,0);
});
