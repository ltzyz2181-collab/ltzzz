// PROBATION: reputation debt must be repayable, but only through capped, supervised bids.
// Regression guard for the "no_eligible_bids_review_required" deadlock: three verified
// quality failures used to lock a seat out forever.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {actionProfile,PROBATION} from '../agi-econ/action-policy.mjs';
import {verifyActionEvidence} from '../agi-econ/action-evidence.mjs';
import {Subnet,MEMORY_GATE} from '../agi-econ/subnet.mjs';
const W='did:ltzzz:w',W2='did:ltzzz:w2',E='did:ltzzz:e',A='did:ltzzz:a';
function setup(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'probation-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const p of MEMORY_GATE){fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),p);}
  const s=new Subnet(root);
  for(const [did,roles] of [[E,['employer']],[W,['worker']],[W2,['worker']],[A,['auditor']]])s.register({did,roles,deposit_usd:did===E?5:1});
  return s;
}
// Runs one full hire-shaped cycle; the auditor rejects anything without 'OK', which is a real slash.
function complete(s,body='OK unique',worker=W){
  const t=s.postTask({employer:E,title:'probation',budget_usd:.1,acceptance:['OK']});
  s.bid(t.id,worker,.05);s.award(t.id);s.deliver(t.id,worker,body);
  const verdict={status:'success',did:A,model:'unit-test-auditor',accepted:body.includes('OK')};
  s.audit(t.id,A,null,verdict);
  const rc=s.settle(t.id);
  rc.auditor_model={did:verdict.did,model:verdict.model,accepted:verdict.accepted};
  fs.writeFileSync(path.join(s.root,t.receipt),JSON.stringify(rc,null,2)+'\n');
  return t;
}
const profileOf=(s,did)=>actionProfile(Object.values(s.state.tasks).filter(x=>x.worker===did),{verify:task=>verifyActionEvidence(s.root,task)});

test('three verified failures put a seat on probation instead of permanent lockout',t=>{
  const s=setup(t);for(let n=0;n<3;n++)complete(s,'bad '+n);
  const p=profileOf(s,W);
  assert.equal(p.quality_failures,3);assert.equal(p.debt,3);assert.equal(p.probation,true);assert.equal(p.status,'review_required');
  assert.equal(p.ask_cap_share,PROBATION.budget_share);
});

test('a capped probation bid can still be awarded when no healthy seat is left',t=>{
  const s=setup(t);for(let n=0;n<3;n++)complete(s,'bad '+n);
  const job=s.postTask({employer:E,title:'recovery',budget_usd:.1});
  s.bid(job.id,W,.1);
  const [b]=job.bids;
  assert.equal(b.ask_usd,0.04);assert.equal(b.probation_cap_usd,0.04);assert.equal(b.probation_debt,3);
  assert.equal(s.award(job.id).worker,W);
  assert.equal(job.action_incentive.tier,'probation');
  assert.deepEqual(job.probation,{debt_at_bid:3,cap_usd:0.04});
});

test('a probation win repays one debt unit and restores eligibility',t=>{
  const s=setup(t);for(let n=0;n<3;n++)complete(s,'bad '+n);
  complete(s,'OK recovered');
  const p=profileOf(s,W);
  assert.equal(p.debt,2);assert.equal(p.probation,false);assert.equal(p.status,'eligible');
  assert.equal(p.quality_failures,3); // raw window count is unchanged, only the debt is repaid
});

test('probation never outranks an unindebted seat, even at a lower ask',t=>{
  const s=setup(t);for(let n=0;n<3;n++)complete(s,'bad '+n);
  const job=s.postTask({employer:E,title:'tier',budget_usd:.1});
  s.bid(job.id,W,.01);s.bid(job.id,W2,.1);
  assert.equal(s.award(job.id).worker,W2);
  assert.equal(job.action_incentive.tier,'healthy');
  assert.equal(job.probation,undefined);
});

test('probation cap is exactly budget_share of budget, never above it',t=>{
  const s=setup(t);for(let n=0;n<3;n++)complete(s,'bad '+n);
  const job=s.postTask({employer:E,title:'cap',budget_usd:.5});
  s.bid(job.id,W,.5);
  assert.equal(job.bids[0].ask_usd,0.2);
  assert.equal(job.bids[0].probation_cap_usd,0.2);
});

test('bids placed before probation carry no cap metadata and then fail closed',t=>{
  const s=setup(t);complete(s,'bad 0');complete(s,'bad 1');
  assert.equal(profileOf(s,W).debt,2);
  const job=s.postTask({employer:E,title:'stale bid',budget_usd:.1});
  s.bid(job.id,W,.05);
  assert.equal(job.bids[0].probation_cap_usd,undefined);
  complete(s,'bad 2');
  assert.equal(profileOf(s,W).debt,3);
  assert.throws(()=>s.award(job.id),/no_eligible_bids_review_required/);
});

test('an optionless award reports why each bid was rejected',t=>{
  const s=setup(t);complete(s,'bad 0');complete(s,'bad 1');
  const job=s.postTask({employer:E,title:'diagnose',budget_usd:.1});
  s.bid(job.id,W,.05);
  complete(s,'bad 2');
  let err;try{s.award(job.id);}catch(e){err=e;}
  assert.equal(err.message,'no_eligible_bids_review_required');
  assert.equal(err.diagnostics.length,1);
  const [d]=err.diagnostics;
  assert.equal(d.worker,W);assert.equal(d.agent_status,'active');assert.equal(d.action_status,'review_required');
  assert.equal(d.debt,3);assert.equal(d.probation,true);assert.equal(d.probation_cap_usd,null);
});

test('probation cannot resurrect a withdrawn seat or bypass the reputation floor',t=>{
  const s=setup(t);for(let n=0;n<3;n++)complete(s,'bad '+n);
  const job=s.postTask({employer:E,title:'withdrawn',budget_usd:.1});
  s.bid(job.id,W,.04);
  s.state.agents[W].status='withdrawn_by_owner';
  assert.throws(()=>s.award(job.id),/no_eligible_bids/);
  assert.throws(()=>s.bid(job.id,W,.04),/agent_inactive/);
  const poor=s.postTask({employer:E,title:'floor',budget_usd:.1});
  s.state.agents[W].status='active';s.state.agents[W].reputation=10;
  assert.throws(()=>s.bid(poor.id,W,.04),/reputation_too_low/);
});

test('probation affects ordering only: no extra payment path or real money',t=>{
  const s=setup(t);for(let n=0;n<3;n++)complete(s,'bad '+n);
  const before={paid:s.state.capital_pool.balance_usd,real:false};
  complete(s,'OK paid');
  const rc=JSON.parse(fs.readFileSync(path.join(s.root,Object.values(s.state.tasks).at(-1).receipt)));
  assert.equal(rc.paid,false);assert.equal(rc.tx_hash,null);assert.equal(rc.settlement_mode,'internal_credit');
  assert.equal(rc.amount_usd,0.0356);
  assert.ok(s.state.capital_pool.balance_usd>before.paid);
});
