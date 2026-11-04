import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeProbe,runProbe,probeSucceeded} from '../run-kimi-postfix-probe.mjs';
const card={task_id:'DEEP-SUPERAGENT-20261103-DEPLOY-E2E-20261104',package_id:'DEPLOY-CANARY-CAPABILITIES-01',probe_id:'KIMI-POSTFIX-20261104-01',repair_source_commit:'a'.repeat(40)};
class Store{value=null;async read(){return this.value;}async compareAndSwap(k,p,s){if(p!==this.value)return false;this.value={state:s};return true;}}
function fetcher({health={},native={},fail=false,output='KIMI_POSTFIX_20261104_OK'}={}){
 let posts=0;const call=async(url,o)=>{
  if(url.endsWith('/health'))return Response.json({source_commit:card.repair_source_commit,kimi_model_resolution_revision:'kimi-model-override-v1',configured_model:'kimi-k3',model_override_configured:true,generation_verified:false,auth_required:true,auth_configured:true,...health});
  if(url.endsWith('/auth/check')){const ok=o.headers.Authorization==='Bearer fixture-token';return Response.json({authenticated:ok,model_calls:0},{status:ok?200:401});}
  if(url.endsWith('/catalogue'))return Response.json({ok:true,selected_model:'kimi-k3',model_calls:0});
  assert.equal(url,'https://api-kimi.ltzzz.com/');assert.equal(o.redirect,'error');assert.equal(JSON.parse(o.body).model,'auto');assert.equal(JSON.parse(o.body).max_tokens,16384);posts++;
  if(fail)throw Error('credential fixture-token');
  return Response.json({ltzzz_receipt:{executed_by:'kimi',task_id:card.task_id,requested_model:'kimi-k3',actual_model:'kimi-k3',model_source:'provider_response',generation_verified:true,request_id:'actual-request',provider_response_id:'actual-provider',finish_reason:'stop',...native},choices:[{message:{content:output},finish_reason:'stop'}]});
 };return {call,posts:()=>posts};
}
test('fixed test card cannot select endpoint, input, model, task or credentials',()=>{
 assert.deepEqual(normalizeProbe(card),card);for(const patch of [{endpoint:'https://bad'},{prompt:'bad'},{model:'fake'},{task_id:'OTHER'},{repair_source_commit:'main'}])assert.throws(()=>normalizeProbe({...card,...patch}));
});
test('real response metadata and exact marker are required; rerun reuses the existing result without a second request',async()=>{
 const f=fetcher(),store=new Store(),r=await runProbe({card,token:'fixture-token',store,fetcher:f.call});assert.equal(r.status,'native_generation_and_marker_verified');assert.equal(r.actual_provider,'moonshot');assert.equal(r.new_model_calls,1);assert.equal(r.result_latch_written,true);assert.equal(r.old_524_request_repeated,false);
 const again=await runProbe({card,token:'fixture-token',store,fetcher:f.call});assert.equal(again.status,'existing_probe_result_reused');assert.equal(again.new_model_calls,0);assert.equal(f.posts(),1);
});
test('old deployment or auto health configuration blocks before any paid generation',async()=>{
 for(const health of [{source_commit:'b'.repeat(40)},{configured_model:'auto'},{model_override_configured:false},{kimi_model_resolution_revision:null}]){const f=fetcher({health}),r=await runProbe({card,token:'fixture-token',store:new Store(),fetcher:f.call});assert.equal(r.status,'preflight_blocked_zero_generation');assert.equal(r.new_model_calls,0);assert.equal(f.posts(),0);}
});
test('an unknown provider request is preserved and never replayed; credentials do not enter error evidence',async()=>{
 const f=fetcher({fail:true}),store=new Store(),r=await runProbe({card,token:'fixture-token',store,fetcher:f.call});assert.equal(r.status,'generation_failed_or_uncertain_no_retry');assert.equal(JSON.stringify(r).includes('fixture-token'),false);await runProbe({card,token:'fixture-token',store,fetcher:f.call});assert.equal(f.posts(),1);
});
test('missing native identity, fake success or incomplete output cannot count as generation',async()=>{
 for(const native of [{executed_by:'qianwen'},{actual_model:null},{generation_verified:false},{finish_reason:'length'},{provider_response_id:null}]){const f=fetcher({native}),r=await runProbe({card,token:'fixture-token',store:new Store(),fetcher:f.call});assert.equal(r.status,'generation_failed_or_uncertain_no_retry');assert.equal(f.posts(),1);}
 const f=fetcher({output:'Different answer'}),r=await runProbe({card,token:'fixture-token',store:new Store(),fetcher:f.call});assert.equal(r.status,'native_generation_verified_marker_rejected');assert.equal(r.accepted,false);
});
test('missing credentials and uncertain reservation cannot call the provider',async()=>{
 const f=fetcher();await assert.rejects(()=>runProbe({card,token:'',store:new Store(),fetcher:f.call}));await assert.rejects(()=>runProbe({card,token:'fixture-token',store:{read:async()=>null,compareAndSwap:async()=>{throw Error('write unknown');}},fetcher:f.call}));assert.equal(f.posts(),0);
});
test('concurrent copies have one paid-request winner, and replay of an unknown result cannot turn CI green',async()=>{
 const store=new Store(),f=fetcher(),args={card,token:'fixture-token',store,fetcher:f.call};
 const results=await Promise.all([runProbe(args),runProbe(args)]);assert.equal(f.posts(),1);assert.equal(results.filter(r=>r.new_model_calls===1).length,1);
 assert.equal(probeSucceeded({status:'existing_probe_result_reused',previous_result:{status:'generation_failed_or_uncertain_no_retry'}}),false);
 assert.equal(probeSucceeded({status:'existing_probe_result_reused',previous_result:{status:'native_generation_and_marker_verified'}}),true);
});
