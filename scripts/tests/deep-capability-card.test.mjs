import test from 'node:test';import assert from 'node:assert/strict';
import worker from '../../workers/patchgate-canary/index.js';
import {collectCapabilities} from '../run-patchgate-a3.mjs';
const SOURCE='a'.repeat(40),VERSION='11111111-1111-4111-8111-111111111111';
const env=()=>({CANARY_SOURCE_COMMIT:SOURCE,CF_VERSION_METADATA:{id:VERSION}});
const call=(route='/capabilities',method='GET',e=env())=>worker.fetch(new Request('https://canary.test'+route,{method}),e);
const expected={schema:'ltzzz.deep-superagent.capability-card.v1',coordinator:'deepseek',worker_seats:['doubao','qianwen','kimi','grok'],decision_seat:'gpt',deployment_executor:'trusted_CI_after_GPT_decision',financial_execution:false,external_submissions_enabled:false,native_paid_reserved_enabled:false,source_commit:SOURCE};
test('new capability route publishes exactly the declared isolated work-seat contract',async()=>{
 const r=await call();assert.equal(r.status,200);assert.deepEqual(await r.json(),expected);assert.match(r.headers.get('Content-Type'),/application\/json/);assert.equal(r.headers.get('Cache-Control'),'no-store');
});
test('both metadata routes bind source and actual platform version, with original canary bytes unchanged',async()=>{
 const canary=await call('/canary');assert.equal(await canary.text(),JSON.stringify({schema:'ltzzz.patchgate.canary.v1',source_commit:SOURCE})+'\n');
 for(const route of ['/canary','/capabilities']){const r=await call(route);assert.equal(r.headers.get('X-Source-Commit'),SOURCE);assert.equal(r.headers.get('X-Worker-Version-Id'),VERSION);}
});
test('caller parameters cannot fabricate source, enable money or activate reserved native APIs',async()=>{
 const r=await call('/capabilities?source_commit='+('b'.repeat(40))+'&financial_execution=true&native_paid_reserved_enabled=true');assert.deepEqual(await r.json(),expected);
});
test('POST, other mutation methods and unknown paths cannot be consumed as actions',async()=>{
 for(const route of ['/capabilities','/canary'])for(const method of ['POST','PUT','PATCH','DELETE','HEAD','OPTIONS'])assert.equal((await call(route,method)).status,404);
 for(const route of ['/','/capabilities/','/capabilities/run','/canary/deploy'])assert.equal((await call(route)).status,404);
});
test('unverified source or platform metadata fails closed on both public routes',async()=>{
 for(const e of [{},{CANARY_SOURCE_COMMIT:SOURCE},{...env(),CANARY_SOURCE_COMMIT:'main'},{...env(),CANARY_SOURCE_COMMIT:'a'.repeat(39)},{...env(),CF_VERSION_METADATA:{id:''}}])for(const route of ['/canary','/capabilities'])assert.equal((await call(route,'GET',e)).status,503);
});
test('endpoint does not read model credentials, wallet secrets or request external services',async()=>{
 const e=env();for(const name of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','XAI_API_KEY','TREASURY_EXECUTOR_KEY','TASKS'])Object.defineProperty(e,name,{enumerable:true,get(){throw Error('credential_or_service_read_forbidden');}});
 const original=globalThis.fetch;let calls=0;try{globalThis.fetch=async()=>{calls++;throw Error('external_fetch_forbidden');};assert.deepEqual(await (await call('/capabilities','GET',e)).json(),expected);assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
const TIME=Date.parse('2026-11-04T08:00:00Z');
async function remote({body=expected,headerSource=SOURCE,version=VERSION,changedVersion=false,date=new Date(TIME).toUTCString(),status=200}={}){
 let calls=0;return collectCapabilities({source:SOURCE,expectedVersion:VERSION,clock:()=>TIME,api:async()=>({deployments:[{versions:[{version_id:changedVersion&&++calls===2?'changed':VERSION,percentage:100}]}]}),fetcher:async(url,options)=>{
  assert.equal(url,'https://ltzzz-patchgate-canary.ltzyz2181.workers.dev/capabilities');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);
  return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Date':date,'X-Source-Commit':headerSource,'X-Worker-Version-Id':version}});
 }});
}
test('live capability collection verifies independent current version, actual response and fresh HTTP Date',async()=>{
 const r=await remote();assert.equal(r.passed,true);assert.deepEqual(Object.values(r.checks),[true,true,true,true,true]);assert.match(r.body_sha256,/^[a-f0-9]{64}$/);
});
test('live acceptance refuses invented capability, changed source/version, stale time and failed HTTP',async()=>{
 for(const options of [{body:{...expected,financial_execution:true}},{body:{...expected,unregistered:'extra'}},{headerSource:'b'.repeat(40)},{version:'unrelated'},{changedVersion:true},{date:new Date(TIME-301000).toUTCString()},{status:503}])assert.equal((await remote(options)).passed,false);
});
