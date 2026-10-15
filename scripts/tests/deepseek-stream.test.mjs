import test from 'node:test';
import assert from 'node:assert/strict';
import {callAgent} from '../call-deepseek.mjs';
import {createModelRouter} from '../lib/domestic-model-router.mjs';
const encode=new TextEncoder();
const frame=data=>'data: '+(typeof data==='string'?data:JSON.stringify(data))+'\r\n\r\n';
const chunk=(content,finish_reason=null)=>({id:'completion-fixture',model:'deepseek-actual',choices:[{index:0,delta:{content},finish_reason}]});
function sse(parts,{fail=false}={}){let i=0;return new Response(new ReadableStream({pull(controller){if(i<parts.length)controller.enqueue(typeof parts[i]==='string'?encode.encode(parts[i++]):parts[i++]);else if(fail)controller.error(new TypeError('terminated private-fixture-key'));else controller.close();}}),{headers:{'content-type':'text/event-stream; charset=utf-8','x-request-id':'req-fixture'}});}
async function withFetch(mock,fn){const old=globalThis.fetch;globalThis.fetch=mock;try{await fn();}finally{globalThis.fetch=old;}}
test('stream reconstructs split UTF-8, CRLF, keepalive and final usage, retaining actual identities but never reasoning',async()=>{
 const snapshots=[],body=': keep-alive\r\n\r\n'+frame({id:'completion-fixture',model:'deepseek-actual',choices:[{index:0,delta:{reasoning_content:'PRIVATE_REASONING'}}]})+frame(chunk('国内正文。'))+frame(chunk('', 'stop'))+frame({choices:[],usage:{total_tokens:123}})+frame('[DONE]');
 const bytes=encode.encode(body),parts=Array.from(bytes,byte=>Uint8Array.of(byte));let requests=0;
 await withFetch(async(url,options)=>{requests++;assert.equal(url,'https://api.deepseek.com/v1/chat/completions');const b=JSON.parse(options.body);assert.equal(b.stream,true);assert.equal(b.stream_options.include_usage,true);return sse(parts);},async()=>{
  const r=await callAgent({apiKey:'private-fixture-key',model:'requested-alias',prompt:'Public task',onProgress:p=>snapshots.push(p)});
  assert.equal(r.ok,true);assert.equal(r.output,'国内正文。');assert.equal(r.model,'deepseek-actual');assert.equal(r.model_source,'provider_response');assert.equal(r.request_id,'req-fixture');assert.equal(r.completion_id,'completion-fixture');assert.equal(r.tokens_used,123);assert.equal(r.stream_complete,true);assert.equal(snapshots[0].partial_output,'');assert.ok(snapshots.some(p=>p.partial_output==='国内正文。'&&!p.stream_complete));assert.equal(JSON.stringify([r,snapshots]).includes('PRIVATE_REASONING'),false);assert.equal(requests,1);
 });
});
test('terminated after answer chunks checkpoints partial text and request ID without retry, fallback, or zero-use fiction',async()=>{
 const snapshots=[];let requests=0,fallback=0;
 await withFetch(async()=>{requests++;return sse([frame(chunk('Useful partial answer, not accepted.'))],{fail:true});},async()=>{
  const call=createModelRouter({env:{DEEPSEEK_API_KEY:'private-fixture-key',DOUBAO_API_KEY:'other-fixture-key'},callers:{DeepSeek:callAgent,Doubao:async()=>{fallback++;throw Error('must not repurchase');}}});
  const r=await call('GPT','Public task',{onProgress:p=>snapshots.push(p)});
  assert.equal(r.ok,false);assert.equal(r.status,'provider_incomplete_or_uncertain');assert.equal(r.partial_output,'Useful partial answer, not accepted.');assert.equal(r.output,'');assert.equal(r.tokens_used,null);assert.equal(r.request_id,'req-fixture');assert.equal(r.automatic_retry_allowed,false);assert.equal(fallback,0);assert.equal(requests,1);assert.ok(snapshots.some(p=>p.partial_output&&p.executed_by==='DeepSeek'));assert.equal(JSON.stringify([r,snapshots]).includes('private-fixture-key'),false);
 });
});
test('missing DONE, truncation, missing finish, provider errors and malformed frames cannot become complete deliveries',async()=>{
 const cases=[{parts:[frame(chunk('Substantive answer','stop'))],status:'stream_incomplete'},
  {parts:[frame(chunk('Truncated text','length')),frame('[DONE]')],status:'incomplete_output'},
  {parts:[frame(chunk('No final reason')),frame('[DONE]')],status:'incomplete_output'},
  {parts:[frame({error:{message:'PRIVATE_PROVIDER_ERROR'}})],status:'stream_interrupted'},
  {parts:['data: PRIVATE_MALFORMED_FRAME\n\n'],status:'stream_interrupted'}];
 for(const c of cases)await withFetch(async()=>sse(c.parts),async()=>{const r=await callAgent({apiKey:'fixture',prompt:'Public task'});assert.equal(r.ok,false);assert.equal(r.output,'');assert.equal(r.status,c.status);assert.equal(r.automatic_retry_allowed,false);assert.equal(JSON.stringify(r).includes('PRIVATE_'),false);});
});
test('failed local checkpoint aborts the response, does not retry, and never exports callback errors',async()=>{
 let requests=0,cancelled=0;await withFetch(async()=>{requests++;return new Response(new ReadableStream({cancel(){cancelled++;}}),{headers:{'content-type':'text/event-stream'}});},async()=>{
  const r=await callAgent({apiKey:'fixture',prompt:'Public task',onProgress:()=>{throw Error('PRIVATE_CHECKPOINT_DATA');}});assert.equal(r.ok,false);assert.equal(r.status,'checkpoint_failed');assert.equal(requests,1);assert.equal(cancelled,1);assert.equal(JSON.stringify(r).includes('PRIVATE_CHECKPOINT_DATA'),false);
 });
});
test('JSON-compatible responses preserve identity and usage; HTTP rejection and pre-header exceptions do not leak credentials',async()=>{
 await withFetch(async()=>Response.json({id:'completion-json',model:'actual-json-model',choices:[{message:{content:'Public answer'},finish_reason:'stop'}],usage:{total_tokens:42}},{headers:{'x-request-id':'req-json'}}),async()=>{const r=await callAgent({apiKey:'fixture',prompt:'Public task'});assert.equal(r.ok,true);assert.equal(r.request_id,'req-json');assert.equal(r.completion_id,'completion-json');assert.equal(r.model,'actual-json-model');assert.equal(r.tokens_used,42);});
 for(const status of [401,402,403,429,500])await withFetch(async()=>new Response('PRIVATE_UPSTREAM_BODY',{status}),async()=>{const r=await callAgent({apiKey:'private-fixture-key',prompt:'Public task'});assert.equal(r.ok,false);assert.equal(r.error,'HTTP '+status);assert.equal(r.tokens_used,null);assert.equal(JSON.stringify(r).includes('PRIVATE_UPSTREAM_BODY'),false);});
 let requests=0;await withFetch(async()=>{requests++;throw Error('private-fixture-key');},async()=>{const r=await callAgent({apiKey:'private-fixture-key',prompt:'Public task'});assert.equal(requests,1);assert.equal(r.status,'exception');assert.equal(r.tokens_used,null);assert.equal(r.automatic_retry_allowed,false);assert.equal(JSON.stringify(r).includes('private-fixture-key'),false);});
});
