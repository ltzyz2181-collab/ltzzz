import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../wep3-worker.js';
const env={LAB_PIN:'fixture',PAY_KV:{get:async()=>assert.fail('planning must not read balances'),put:async()=>assert.fail('planning must not write any KV state')}};
async function request(body,pin='fixture'){const r=await worker.fetch(new Request('https://test/swarm/hire',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Pin':pin},body:JSON.stringify(body)}),env);return {http:r.status,body:await r.json()};}
test('swarm creates only a conservative exact-micro plan, with no funds or model side effects',async()=>{const r=await request({budget_usd:'0.1'});assert.equal(r.http,200);assert.equal(r.body.status,'planned_not_dispatched');assert.deepEqual(r.body.children.map(c=>c.budget_micro),['33334','33333','33333']);assert.equal(r.body.children.reduce((n,c)=>n+BigInt(c.budget_micro),0n),100000n);assert.equal(r.body.settlement_type,'internal_credit_only');for(const field of ['execution_enabled','funds_reserved','paid'])assert.equal(r.body[field],false);assert.equal(r.body.model_calls,0);assert.equal(r.body.tx_hash,null);});
test('explicit zero, invalid decimals and unsafe amounts are rejected rather than defaulted',async()=>{for(const budget_usd of [0,-1,'NaN','Infinity','0.0000001','5.000001','0.000001'])assert.equal((await request({budget_usd})).http,400,String(budget_usd));});
test('unknown, duplicate, empty and excessive skill arrays fail without partial reservations',async()=>{for(const skills of [[],['signal','signal'],['signal','missing'],['signal',1],Array(20).fill('signal'),'signal'])assert.equal((await request({skills})).http,400);});
test('100 retries never spend twice; arming an unfinished swarm is a clear conflict',async()=>{for(let i=0;i<100;i++)assert.equal((await request({budget_usd:'0.000003'})).http,200);const r=await request({execute:true});assert.equal(r.http,409);assert.equal(r.body.error,'swarm_atomic_executor_not_implemented');assert.equal(r.body.funds_reserved,false);});
test('planning keeps existing write authentication and does not claim native model activation',async()=>{assert.equal((await request({},'wrong')).http,401);const r=await worker.fetch(new Request('https://test/agents/roles'),env);const data=await r.json();assert.ok(data.agents.includes('Claude'));assert.ok(data.agents.includes('Meya'));assert.equal(data.generation_verified,false);});
test('Microsoft is absent from active work routing and Claude remains independent audit and planning',async()=>{const r=await worker.fetch(new Request('https://test/agents/roles'),env),d=await r.json();assert.equal(d.agents.includes('Microsoft'),false);assert.deepEqual(d.temporarily_removed,['Microsoft']);assert.equal(d.roles.Claude.role,'独立审计＋规划');assert.equal(d.wallet_source,'wallet/addresses.md');});
test('temporarily removed Microsoft cannot start even a new plan, without touching legacy balances',async()=>{const r=await request({poster:'Microsoft'});assert.equal(r.http,403);assert.equal(r.body.error,'temporarily_removed_agent');});

// Regression: a placeholder router must never be deployable; unaudited recursive writes stay closed.
test('complete WEP3 router serves health and fails closed for nonatomic spawn',async()=>{
 const health=await worker.fetch(new Request('https://test/health'),env);
 assert.equal(health.status,200);
 assert.equal((await health.json()).service,'ltzzz-wep3');
 const unauth=await worker.fetch(new Request('https://test/swarm/spawn',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),env);
 assert.equal(unauth.status,401);
 const denied=await worker.fetch(new Request('https://test/swarm/spawn',{method:'POST',headers:{'x-lab-pin':'fixture','content-type':'application/json'},body:'{}'}),env);
 assert.equal(denied.status,503);
 const data=await denied.json();
 assert.equal(data.error,'swarm_spawn_atomic_reservation_not_implemented');
 assert.equal(data.funds_reserved,false);
 assert.equal(data.paid,false);
 assert.equal(data.tx_hash,null);
});
