import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {inactiveDailySeats} from '../lib/daily-seat-policy.mjs';import {readSafeGovernance,decodeOwners,SAFE} from '../lib/safe-governance-read.mjs';
test('native API daily policy cannot revoke an active role, imply an account balance or revive Microsoft delegation',()=>{
 const rows=inactiveDailySeats(JSON.parse(fs.readFileSync('data/tasks/daily-tasks.json'))),gpt=rows.find(r=>r.agent==='gpt'),claude=rows.find(r=>r.agent==='claude'),ms=rows.find(r=>r.agent==='microsoft');
 assert.equal(gpt.status,'disabled_by_owner');assert.equal(gpt.role_status,'active');assert.equal(gpt.status_scope,'native_API_daily_task_only_not_role_or_account_balance');assert.equal(gpt.native_api_account_balance_verified,false);
 assert.equal(claude.role_status,'active_external_audit_and_planning');assert.ok(!claude.output_preview.includes('未收到正式交付'));assert.ok(ms.output_preview.includes('不再运行旧GPT委托'));assert.equal(ms.expected_daily_model_delivery,false);
});
const uint=value=>'0x'+BigInt(value).toString(16).padStart(64,'0');
const owners=['0x'+'1'.repeat(40),'0x'+'2'.repeat(40),'0x'+'3'.repeat(40),'0x'+'4'.repeat(40),'0x'+'5'.repeat(40)];
const encoded=uint(32)+uint(5).slice(2)+owners.map(a=>a.slice(2).padStart(64,'0')).join('');
test('Safe verification sends view-only calls to the fixed contract, pins each endpoint to a block and does not invent seat mappings',async()=>{
 const seen=[];const report=await readSafeGovernance({rpcs:['https://one.invalid','https://two.invalid'],fetcher:async(url,o)=>{const b=JSON.parse(o.body);seen.push(b);const result=b.method==='eth_chainId'?'0x1':b.method==='eth_blockNumber'?'0x100':b.params[0].data==='0xa0e67e2b'?encoded:b.params[0].data==='0xe75235b8'?uint(3):uint(6);if(b.method==='eth_call'){assert.equal(b.params[0].to,SAFE);assert.equal(b.params[1],'0x100');}return Response.json({jsonrpc:'2.0',id:b.id,result});}});
 assert.equal(report.status,'consistent_across_rpc_endpoints');assert.equal(report.current.threshold,3);assert.equal(report.current.owner_count,5);assert.equal(report.private_key_control_verified,false);assert.equal(report.seat_owner_mapping_verified,false);assert.equal(report.transactions,0);assert.ok(seen.every(b=>['eth_chainId','eth_blockNumber','eth_call'].includes(b.method)));
});
test('malformed owners, wrong chain and mismatched RPC values never become a verified current Safe configuration',async()=>{
 assert.throws(()=>decodeOwners('0x'));assert.throws(()=>decodeOwners(encoded.slice(0,-1)));assert.throws(()=>decodeOwners(encoded.replace(owners[1].slice(2),owners[0].slice(2))));
 const report=await readSafeGovernance({rpcs:['fixture'],fetcher:async()=>Response.json({result:'0x2105'})});assert.equal(report.status,'unverified');assert.equal(report.current,null);
 const disagree=await readSafeGovernance({rpcs:['one','two'],fetcher:async(url,o)=>{const b=JSON.parse(o.body);return Response.json({result:b.method==='eth_chainId'?'0x1':b.method==='eth_blockNumber'?'0x100':b.params[0].data==='0xa0e67e2b'?encoded:b.params[0].data==='0xe75235b8'?uint(url==='one'?3:4):uint(6)});}});assert.equal(disagree.status,'rpc_disagreement');assert.equal(disagree.current,null);
});
