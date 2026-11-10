import test from 'node:test';import assert from 'node:assert/strict';
import doubao from '../../doubao-proxy-worker.js';

const UPSTREAM='https://ark.cn-beijing.volces.com/api/v3/chat/completions';

test('a synchronous downstream that never answers is cut at the proxy timeout and reported deterministically instead of as an ambiguous 524',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,UPSTREAM);
  assert.ok(options.signal,'the upstream fetch must carry an abort signal');
  const err=new Error('The operation was aborted due to timeout');err.name='TimeoutError';throw err;
 };
 try{
  const env={DOUBAO_API_KEY:'provider',DOUBAO_MODEL:'doubao-seed-2-1-pro-260915',LTZZZ_AGENT_TOKEN:'service'};
  const body={messages:[{role:'user',content:'fixture'}],task_id:'DOUBAO-TIMEOUT-FIXTURE-01',data_classification:'public_distributable'};
  const r=await doubao.fetch(new Request('https://fixture/',{method:'POST',headers:{Authorization:'Bearer service','Content-Type':'application/json'},body:JSON.stringify(body)}),env);
  assert.equal(r.status,504);
  const d=await r.json();
  assert.equal(d.error,'upstream_timeout');assert.equal(d.stage,'upstream_call');assert.equal(d.timeout_ms,90000);
  assert.equal(d.upstream_outcome_unknown,true);
  assert.equal(d.ltzzz_receipt.timeout_observed,true);assert.equal(d.ltzzz_receipt.generation_verified,false);
  assert.equal(d.ltzzz_receipt.executed_by,'doubao');assert.equal(d.ltzzz_receipt.task_id,'DOUBAO-TIMEOUT-FIXTURE-01');
 }finally{globalThis.fetch=old;}
});

test('the same route still completes normally and keeps carrying the abort signal',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,UPSTREAM);
  assert.ok(options.signal,'normal calls must keep the same timeout boundary');
  return Response.json({model:'doubao-seed-2-1-pro-260915',choices:[{message:{content:'complete'},finish_reason:'stop'}],usage:{total_tokens:17}});
 };
 try{
  const env={DOUBAO_API_KEY:'provider',DOUBAO_MODEL:'doubao-seed-2-1-pro-260915',LTZZZ_AGENT_TOKEN:'service'};
  const r=await doubao.fetch(new Request('https://fixture/',{method:'POST',headers:{Authorization:'Bearer service','Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'fixture'}]})}),env);
  assert.equal(r.status,200);
  const d=await r.json();
  assert.equal(d.choices[0].message.content,'complete');
  assert.equal(d.ltzzz_receipt.timeout_observed,undefined);
  assert.equal(d.ltzzz_receipt.generation_verified,true);
 }finally{globalThis.fetch=old;}
});
