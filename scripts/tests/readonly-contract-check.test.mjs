import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {runReadonlyContract} from '../lib/readonly-contract-check.mjs';
const original=JSON.parse(fs.readFileSync('knowledge/results/wep3/delivery-contract-2026-10-20.json')).artifact.tests;
test('all eight archived cases generate auditable comparisons without author, reviewer, settlement or fund requests',async()=>{
 const seen=[];const result=await runReadonlyContract({tests:original,token:'fixture-secret',fetcher:async(url,o)=>{
  seen.push(url);const t=original[seen.length-1];assert.equal(new URL(url).pathname,t.path);assert.ok(!url.endsWith('/hire'));
  if(t.auth==='valid')assert.equal(o.headers['X-Lab-Pin'],'fixture-secret');
  return Response.json(t.expected_json,{status:t.expected_http});
 }});assert.equal(seen.length,8);assert.equal(result.status,'readonly_contract_verified');assert.equal(result.model_calls,0);assert.equal(result.settlement_performed,false);assert.ok(result.checks.every(c=>c.passed&&c.response_sha256.length===64&&c.comparison.fields.every(f=>f.matched)));assert.ok(!JSON.stringify(result).includes('fixture-secret'));
});
test('unsafe requests anywhere in the artifact are rejected before the first network call',async()=>{
 for(const patch of [{path:'/hire',method:'POST'},{path:'/market/aave/execute',method:'POST'},{path:'https://attacker.invalid/health',method:'GET'},{path:'/market/aave/preview',method:'POST',body:{action:'withdraw',amount_usdc:'30',intent_id:'x'}}]){
  const tests=structuredClone(original);Object.assign(tests[7],patch);let calls=0;
  await assert.rejects(()=>runReadonlyContract({tests,token:'fixture',fetcher:async()=>{calls++;}}));assert.equal(calls,0);
 }
});
test('real field mismatch remains a failed predicate with exact types and no fabricated pass',async()=>{
 let count=0;const result=await runReadonlyContract({tests:original,token:'fixture',fetcher:async()=>{const t=original[count++];return Response.json(count===2?{...t.expected_json,controlled:'true'}:t.expected_json,{status:t.expected_http});}});
 assert.equal(result.status,'readonly_contract_failed');const c=result.checks[1];assert.equal(c.passed,false);assert.equal(c.comparison.fields.find(f=>f.key==='controlled').actual_type,'string');
});
