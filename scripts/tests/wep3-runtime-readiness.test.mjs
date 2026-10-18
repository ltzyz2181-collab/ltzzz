import test from 'node:test';import assert from 'node:assert/strict';
import {waitMarketRuntime} from '../lib/wep3-runtime-readiness.mjs';
const current={ok:true,market_runtime_revision:'market-runtime-v3',aave_runtime_revision:'v5',aave_intent_count:3,first_supply_confirmed:true,exit_test_confirmed:true};
test('HTML propagation and old runtimes are recorded then retried only with authenticated GET',async()=>{
 let calls=0;const replies=[new Response('<!DOCTYPE html>edge',{status:503,headers:{'content-type':'text/html'}}),Response.json({...current,aave_runtime_revision:'v4'}),Response.json(current)];
 const r=await waitMarketRuntime({base:'https://example.invalid',token:'fixture',revision:'v5',pause:async()=>{},fetchImpl:async(url,options)=>{assert.equal(url,'https://example.invalid/market/runtime-state');assert.equal(options.headers['X-Lab-Pin'],'fixture');assert.equal(options.method,undefined);return replies[calls++];}});
 assert.equal(r.ready,true);assert.equal(calls,3);assert.equal(r.observations[0].error,'non_json_response');assert.equal(r.observations[0].http,503);assert.equal(JSON.stringify(r).includes('<!DOCTYPE'),false);
});
test('all transport failures produce a bounded observable failure without echoing credentials',async()=>{
 const r=await waitMarketRuntime({base:'https://example.invalid',token:'fixture-secret',revision:'v5',attempts:2,pause:async()=>{},fetchImpl:async()=>{throw Error('fixture-secret upstream')}});
 assert.equal(r.ready,false);assert.equal(r.observations.length,2);assert.equal(JSON.stringify(r).includes('fixture-secret'),false);assert.equal(r.state.error,'transport_or_body_timeout');
});

test('old runtime with a healthy legacy revision cannot pass a new procurement deployment',async()=>{
 let calls=0;const result=await waitMarketRuntime({base:'https://fixed.test',token:'fixture',revision:'aave-guard-v5',procurementRevision:'external-purchase-v1',pause:async()=>{},attempts:2,fetchImpl:async()=>{calls++;return Response.json({ok:true,market_runtime_revision:'market-runtime-v3',aave_runtime_revision:'aave-guard-v5',...(calls===2?{procurement_runtime_revision:'external-purchase-v1'}:{})});}});assert.equal(calls,2);assert.equal(result.ready,true);
});
