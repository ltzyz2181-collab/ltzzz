import test from 'node:test';import assert from 'node:assert/strict';
import {auditRequest,auditSubject,selectModel,executeAudit,hash,PREFIX} from '../lib/kimi-native-audit.mjs';
import {kimiCall} from '../agi-econ/kimi-cn.mjs';
const owner='ltzyz2181-collab',repository=owner+'/ltzzz';
const event=()=>({action:'opened',repository:{full_name:repository},issue:{number:101,title:PREFIX+' one audit',body:'### 执行\n一次Kimi原生WEP3复核\n### 模型\nauto',user:{login:owner},html_url:'https://github.com/'+repository+'/issues/101'}});
function subject() {
 const artifact={tests:Array.from({length:8},(_,id)=>({id,path:'/health',expected_http:200}))};
 const text=JSON.stringify({artifact,verification:Array.from({length:8},()=>({passed:true})),spec_provided_in_prompt:true});
 const receipt={source:'knowledge/results/wep3/delivery-contract-2026-10-15.json',result:{deliverable:text},deliverable_sha256:hash(text),execution_id:'old-run',auditor:'Grok'};
 return {receipt,delivery:{artifact},input:auditSubject(receipt,JSON.stringify(receipt),{artifact},JSON.stringify({artifact}))};
}
function fixture(patch={}) {
 const input=subject().input,record={status:'claimed',requested_model:'auto',native_generation_verified:false,artifact_bound_audit_verified:false,paid:false,tx_hash:null,automatic_retry_allowed:false};
 let calls=0,fetches=0;const checkpoints=[];
 const options={env:{MOONSHOT_API_KEY_CN:'native-test-key',LTZZZ_AGENT_TOKEN:'gate-test-token'},subject:input,save:async r=>checkpoints.push(structuredClone(r)),fetcher:async()=>{fetches++;return Response.json({data:[{id:'kimi-k2.6'},{id:'kimi-k2.5'}]});},call:async args=>{calls++;assert.equal(args.model,'kimi-k2.6');assert.equal(args.maxTokens,16384);assert.ok(args.prompt.includes('没有调用任何线上HTTP'));assert.equal(checkpoints.at(-1).status,'generation_started_completion_unknown');return {ok:true,status:'success',model_source:'provider_response',returned_model:'kimi-k2.6',finish_reason:'stop',http:200,request_id:'req-test',completion_id:'completion-test',tokens_used:200,upstream_attempts:1,output:JSON.stringify({accepted:true,artifact_sha256:input.deliverable_sha256,reason:'Historical assertions are internally consistent.',unverified:['No fresh live HTTP tests.']}),...patch};}};
 return {record,options,input,checkpoints,get calls(){return calls},get fetches(){return fetches}};
}
test('only an explicit repository owner issue can authorize one native call',()=>{
 assert.equal(auditRequest(event(),{actor:owner,repository}).requested_model,'auto');
 for(const change of [e=>e.issue.user.login='visitor',e=>e.action='edited',e=>e.issue.title='other',e=>e.issue.body='### 模型\nauto',e=>e.issue.body='### 执行\n一次Kimi原生WEP3复核\n### 模型\nhttps://arbitrary.example']){
  const e=event();change(e);assert.throws(()=>auditRequest(e,{actor:owner,repository}));
 }
 assert.throws(()=>auditRequest(event(),{actor:'visitor',repository}));
});
test('stored WEP3 delivery is bound to exact bytes and source artifact',()=>{
 const s=subject();assert.equal(s.input.deliverable_sha256,hash(s.receipt.result.deliverable));
 assert.throws(()=>auditSubject({...s.receipt,deliverable_sha256:'a'.repeat(64)},'x',s.delivery,'y'));
 assert.throws(()=>auditSubject(s.receipt,'x',{artifact:{tests:[]}},'y'));
 assert.throws(()=>auditSubject({...s.receipt,source:'../private'},'x',s.delivery,'y'));
});
test('model is selected only from official supported ids; explicit unavailable models never fall back',()=>{
 assert.equal(selectModel(['kimi-k2.5'],'auto'),'kimi-k2.5');
 assert.equal(selectModel(['kimi-k2.5','kimi-k2.6'],'kimi-k2.5'),'kimi-k2.5');
 assert.throws(()=>selectModel(['unrecognized-provider-model'],'auto'));
 assert.throws(()=>selectModel(['kimi-k2.6'],'kimi-k2.5'));
});
test('official catalogue and one native audit produce a bound result, not a new payment or deployment',async()=>{
 const f=fixture(),r=await executeAudit(f.record,f.options);
 assert.equal(f.fetches,1);assert.equal(f.calls,1);assert.equal(r.status,'native_audit_complete_accepted');assert.equal(r.native_generation_verified,true);assert.equal(r.artifact_bound_audit_verified,true);
 assert.equal(r.provider.actual_model,'kimi-k2.6');assert.equal(r.provider.completion_id,'completion-test');assert.equal(r.paid,false);assert.equal(r.tx_hash,null);
 await assert.rejects(()=>executeAudit(f.record,f.options),/unused_durable_claim/);assert.equal(f.calls,1);
});
test('native rejection still verifies the provider route and is never relabelled accepted',async()=>{
 const f=fixture();f.options.call=async()=>({ok:true,status:'success',model_source:'provider_response',returned_model:'kimi-k2.6',finish_reason:'stop',upstream_attempts:1,output:JSON.stringify({accepted:false,artifact_sha256:f.input.deliverable_sha256,reason:'Old evidence cannot prove current deployment.',unverified:['Fresh endpoint check needed.']})});
 const r=await executeAudit(f.record,f.options);assert.equal(r.status,'native_audit_complete_rejected');assert.equal(r.artifact_bound_audit_verified,true);assert.equal(r.verdict.accepted,false);
});
test('missing credentials, denied catalogue and unavailable model make zero generation requests',async()=>{
 for(const mode of ['missing','denied','model']){
  const f=fixture();if(mode==='missing')f.options.env.LTZZZ_AGENT_TOKEN='';
  if(mode==='denied')f.options.fetcher=async()=>Response.json({}, {status:401});
  if(mode==='model')f.record.requested_model='kimi-does-not-exist';
  const r=await executeAudit(f.record,f.options);assert.equal(f.calls,0);assert.equal(r.native_generation_verified,false);assert.equal(r.generation_started_at,undefined);
 }
});
test('truncation and requested-model-only metadata cannot verify native generation',async()=>{
 for(const patch of [{finish_reason:'length'},{model_source:'requested_model',returned_model:null}]){
  const f=fixture(patch),r=await executeAudit(f.record,f.options);assert.equal(f.calls,1);assert.equal(r.status,'blocked_provider_or_incomplete');assert.equal(r.native_generation_verified,false);assert.equal(r.artifact_bound_audit_verified,false);
 }
});
test('a wrong hash or malformed verdict cannot verify WEP3 audit even after native completion',async()=>{
 const f=fixture({output:JSON.stringify({accepted:true,artifact_sha256:'a'.repeat(64),reason:'Wrong artifact',unverified:[]})});
 const r=await executeAudit(f.record,f.options);assert.equal(r.native_generation_verified,true);assert.equal(r.artifact_bound_audit_verified,false);assert.equal(r.status,'blocked_unbound_or_invalid_verdict');assert.equal(f.calls,1);
});
test('unknown request outcome remains one-use and cannot cause a blind second call',async()=>{
 const f=fixture();let calls=0;f.options.call=async()=>{calls++;throw Error('connection lost');};
 const r=await executeAudit(f.record,f.options);assert.equal(r.status,'generation_outcome_unknown_no_retry');assert.equal(r.automatic_retry_allowed,false);
 await assert.rejects(()=>executeAudit(f.record,f.options));assert.equal(calls,1);
});
test('saved provider output redacts both secrets',async()=>{
 const f=fixture({output:'native-test-key gate-test-token'});const r=await executeAudit(f.record,f.options);assert.equal(r.output,'[REDACTED] [REDACTED]');
});
test('native adapter keeps provider and gateway credentials separate and records real response identity',async()=>{
 const old=process.env.LTZZZ_AGENT_TOKEN;process.env.LTZZZ_AGENT_TOKEN='gate-test';let generation=0;
 try {
  const result=await kimiCall({apiKey:'provider-test',prompt:'Audit',maxTokens:1500,model:'kimi-k2.5',fetcher:async(url,options)=>{
   if(url.endsWith('/reserve')){assert.equal(options.headers.Authorization,'Bearer gate-test');return Response.json({lease:'lease'});}
   if(url.endsWith('/release')){assert.equal(options.headers.Authorization,'Bearer gate-test');return Response.json({ok:true});}
   assert.equal(url,'https://api.moonshot.cn/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer provider-test');assert.equal(JSON.parse(options.body).model,'kimi-k2.5');generation++;
   return Response.json({id:'real-completion',model:'kimi-k2.5',choices:[{message:{content:'OK'},finish_reason:'stop'}]},{headers:{'x-request-id':'real-request'}});
  }});
  assert.equal(generation,1);assert.equal(result.returned_model,'kimi-k2.5');assert.equal(result.model_source,'provider_response');assert.equal(result.completion_id,'real-completion');assert.equal(result.request_id,'real-request');
 }finally{if(old===undefined)delete process.env.LTZZZ_AGENT_TOKEN;else process.env.LTZZZ_AGENT_TOKEN=old;}
});
