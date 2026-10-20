import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dispatchResponse} from '../../workers/lib/dispatch-receipt.mjs';
import kimi from '../../kimi-proxy-worker.js';
test('worker identity remains independent of model prose and provider model', async()=>{
 const r=dispatchResponse(JSON.stringify({model:'provider-v2',choices:[{message:{content:'I am another model'},finish_reason:'stop'}]}),200,{}, {seat:'deepseek',model:'deepseek-flash',taskId:'T1'});
 const j=await r.json(); assert.equal(r.status,200);assert.equal(j.ltzzz_receipt.did,'did:ltzzz:deepseek');assert.equal(j.ltzzz_receipt.requested_model,'deepseek-flash');assert.equal(j.ltzzz_receipt.provider_reported_model,'provider-v2');assert.equal(j.ltzzz_receipt.signed,false);
});
test('HTTP 200 with empty, truncated or invalid body is failure',async()=>{
 for(const body of ['not json',JSON.stringify({choices:[{message:{content:''},finish_reason:'stop'}]}),JSON.stringify({choices:[{message:{content:'partial'},finish_reason:'length'}]})]) assert.equal(dispatchResponse(body,200,{}, {seat:'kimi',model:'kimi-k3'}).status,502);
 assert.equal(dispatchResponse('{}',429,{}, {seat:'kimi',model:'kimi-k3'}).status,429);
});
test('Kimi dispatch budget and configured model reach upstream',async()=>{
 const original=globalThis.fetch;let sent;
 globalThis.fetch=async(u,init)=>{sent=JSON.parse(init.body);return new Response(JSON.stringify({model:'kimi-k3',choices:[{message:{content:'OK'},finish_reason:'stop'}]}));};
 try{const r=await kimi.fetch(new Request('https://test/',{method:'POST',body:JSON.stringify({messages:[{role:'user',content:'ack'}],max_tokens:900,task_id:'T2'})}),{KIMI_API_KEY:'test'});assert.equal(r.status,200);assert.equal(sent.max_tokens,3000);assert.equal(sent.model,'kimi-k3');}finally{globalThis.fetch=original;}
});
