// Award replay must answer "would the current gate award this blocked task?" without
// touching the real ledger. Read-only is the whole point: patrol runs it every cycle.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {Subnet,MEMORY_GATE} from '../agi-econ/subnet.mjs';
import {replayAward} from '../agi-econ/award-replay.mjs';
const E='did:ltzzz:e',W='did:ltzzz:w',A='did:ltzzz:a';
function setup(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'replay-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const p of MEMORY_GATE){fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),p);}
  const s=new Subnet(root);
  for(const [did,roles] of [[E,['employer']],[W,['worker']],[A,['auditor']]])s.register({did,roles,deposit_usd:did===E?5:1});
  s.save();
  return {root,s};}
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

test('a blocked task with bids is replayable and reports the award tier',t=>{
  const {s}=setup(t);
  const task=s.postTask({employer:E,title:'stuck',budget_usd:.1,acceptance:['OK']});
  s.bid(task.id,W,.05);
  s.block(task.id,'execution_exception',{error:'no_eligible_bids_review_required',stage:'award'});
  s.save();
  const r=replayAward({root:s.root});
  assert.equal(r.ok,true);assert.equal(r.blocked_with_bids,1);assert.equal(r.replayed,1);
  assert.equal(r.awardable,1);assert.equal(r.still_rejected,0);
  assert.deepEqual(r.awardable_by_tier,{healthy:1});
  assert.equal(r.awardable_by_reason.execution_exception,1);
  assert.equal(r.model_calls,0);assert.equal(r.real_funds_moved,false);assert.equal(r.tx_hash,null);
});

test('replay never mutates the source ledger',t=>{
  const {root,s}=setup(t);
  const task=s.postTask({employer:E,title:'stuck',budget_usd:.1});
  s.bid(task.id,W,.05);s.block(task.id,'execution_exception',{error:'x'});
  s.save();
  const file=path.join(root,'data/agi-econ/state.json');
  const before=sha(file);
  replayAward({root});
  assert.equal(sha(file),before);
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).tasks[task.id].status,'blocked');
});

test('a seat that cannot pass the reputation floor is still rejected on replay',t=>{
  const {root,s}=setup(t);
  const task=s.postTask({employer:E,title:'floor',budget_usd:.1});
  s.bid(task.id,W,.05);
  s.state.agents[W].reputation=10;
  s.state.tasks[task.id].status='blocked';
  s.state.tasks[task.id].block_reason='execution_exception';
  s.save();
  const r=replayAward({root});
  assert.equal(r.awardable,0);assert.equal(r.still_rejected,1);
  assert.equal(r.replay[0].diagnostics.error,'no_eligible_bids_review_required');
  assert.equal(r.replay[0].diagnostics.rejected[0].worker,W);
});

test('replay tolerates a root without a ledger',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'replay-empty-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const r=replayAward({root});
  assert.equal(r.ok,false);assert.equal(r.error,'state_missing');assert.deepEqual(r.replay,[]);
});
