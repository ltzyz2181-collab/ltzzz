import test from 'node:test';import assert from 'node:assert/strict';
import kimi from '../../kimi-proxy-worker.js';

test('a synchronous upstream that never answers is cut at the proxy timeout and reported deterministically instead of as an ambiguous 524',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://api.moonshot.cn/v1/chat/completions');
  assert.ok(options.signal,'the upstream fetch must carry an abort signal');
  const err=new Error('The operation was aborted due to timeout');err.name='TimeoutError';throw err;
 };
 try{
  const env={KIMI_API_KEY:'provider',KIMI_MODEL:'kimi-k3',LTZZZ_AGENT_TOKEN:'service'};
  const body={messages:[{role:'user',content:'fixture'}],task_id:'KIMI-TIMEOUT-FIXTURE-01'};
  const r=await kimi.fetch(new Request('https://fixture/',{method:'POST',headers:{Authorization:'Bearer service','Content-Type':'application/json'},body:JSON.stringify(body)}),env);
  assert.equal(r.status,504);
  const d=await r.json();
  assert.equal(d.error,'upstream_timeout');assert.equal(d.stage,'upstream_call');assert.equal(d.timeout_ms,90000);
  assert.equal(d.upstream_outcome_unknown,true);
  assert.equal(d.ltzzz_receipt.timeout_observed,true);assert.equal(d.ltzzz_receipt.generation_verified,false);
  assert.equal(d.ltzzz_receipt.executed_by,'kimi');assert.equal(d.ltzzz_receipt.task_id,'KIMI-TIMEOUT-FIXTURE-01');
 }finally{globalThis.fetch=old;}
});
