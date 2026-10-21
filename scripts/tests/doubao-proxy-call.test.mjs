import test from 'node:test';import assert from 'node:assert/strict';
import {callDoubaoProxy} from '../lib/doubao-proxy-call.mjs';
import {callAgent} from '../call-doubao.mjs';
import worker from '../../doubao-proxy-worker.js';
import {doubaoRoute} from '../../lib/doubao-route.js';
test('Pro keeps its funded key and coding-plan route together; credentials cannot be redirected off the official host',async()=>{
 assert.equal(doubaoRoute({DOUBAO_BASE_URL:'https://ark.cn-beijing.volces.com/api/coding/v3'}).url,'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions');
 assert.throws(()=>doubaoRoute({DOUBAO_BASE_URL:'https://attacker.invalid/api/v3'}));
 const old=globalThis.fetch;globalThis.fetch=async(url,o)=>{assert.equal(url,'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions');assert.equal(o.headers.Authorization,'Bearer funded-pro-key');return Response.json({model:'doubao-seed-2-1-pro-260915',choices:[{message:{content:'complete'},finish_reason:'stop'}]});};
 try{const r=await worker.fetch(new Request('https://fixture/',{method:'POST',headers:{Authorization:'Bearer service'},body:JSON.stringify({messages:[{role:'user',content:'fixture'}]})}),{LTZZZ_AGENT_TOKEN:'service',DOUBAO_API_KEY:'funded-pro-key',ARK_API_KEY:'old-lite-key',DOUBAO_BASE_URL:'https://ark.cn-beijing.volces.com/api/coding/v3',DOUBAO_MODEL:'doubao-seed-2-1-pro-260915'});assert.equal(r.status,200);}finally{globalThis.fetch=old;}
});
test('switching transport preserves the configured high model instead of falling through to a stale Worker Lite endpoint',async()=>{
 const names=['DOUBAO_USE_PROXY','LTZZZ_AGENT_TOKEN','DOUBAO_MODEL'],saved=names.map(n=>process.env[n]),old=globalThis.fetch;
 process.env.DOUBAO_USE_PROXY='true';process.env.LTZZZ_AGENT_TOKEN='service';process.env.DOUBAO_MODEL='doubao-seed-2-1-pro-260915';
 globalThis.fetch=async(url,o)=>{const payload=JSON.parse(o.body);assert.equal(payload.model,'doubao-seed-2-1-pro-260915');return Response.json({model:payload.model,choices:[{message:{content:'complete'},finish_reason:'stop'}],ltzzz_receipt:{receipt_source:'worker_code',executed_by:'doubao',model_source:'provider_response',actual_model:payload.model,generation_verified:true}});};
 try{const r=await callAgent({apiKey:'upstream-secret',prompt:'fixture'});assert.equal(r.ok,true);assert.equal(r.model,'doubao-seed-2-1-pro-260915');}finally{globalThis.fetch=old;names.forEach((n,i)=>saved[i]===undefined?delete process.env[n]:process.env[n]=saved[i]);}
});
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
