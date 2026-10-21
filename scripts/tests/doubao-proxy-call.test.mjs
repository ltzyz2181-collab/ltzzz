import test from 'node:test';import assert from 'node:assert/strict';
import {callDoubaoProxy} from '../lib/doubao-proxy-call.mjs';
test('proxy route sends only server credential to the fixed Worker and requires provider execution metadata',async()=>{
 let calls=0;const fetcher=async(url,o)=>{calls++;assert.equal(url,'https://ltzzz-doubao-proxy.ltzyz2181.workers.dev/');assert.equal(o.headers.Authorization,'Bearer service');assert.equal(JSON.stringify(o).includes('upstream-secret'),false);return Response.json({model:'actual-doubao',choices:[{message:{content:'complete'},finish_reason:'stop'}],usage:{total_tokens:17},ltzzz_receipt:{receipt_source:'worker_code',executed_by:'doubao',model_source:'provider_response',actual_model:'actual-doubao',generation_verified:true}});};
 const r=await callDoubaoProxy({prompt:'fixture',token:'service',fetcher});assert.equal(r.ok,true);assert.equal(r.model,'actual-doubao');assert.equal(r.tokens_used,17);assert.equal(calls,1);
});
test('missing credential, missing/wrong execution metadata and uncertain transport never fall back or retry',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('uncertain response');};
 assert.equal((await callDoubaoProxy({token:'',fetcher})).status,'service_auth_not_configured');assert.equal(calls,0);
 assert.equal((await callDoubaoProxy({token:'service',fetcher})).status,'proxy_transport_unknown_no_repurchase');assert.equal(calls,1);
 for(const receipt of [undefined,{executed_by:'gpt',generation_verified:true}]){const r=await callDoubaoProxy({token:'service',fetcher:async()=>Response.json({model:'x',choices:[{message:{content:'complete'},finish_reason:'stop'}],ltzzz_receipt:receipt})});assert.equal(r.ok,false);}
});
