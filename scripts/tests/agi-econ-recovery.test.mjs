import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Subnet } from '../agi-econ/subnet.mjs';
import { hire } from '../agi-econ/hire.mjs';
function setup() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ltzzz-recovery-'));
  const s=new Subnet(root);
  s.register({did:'did:ltzzz:gpt', roles:['employer'],deposit_usd:1});
  s.register({did:'did:ltzzz:deepseek', roles:['worker']});
  s.register({did:'did:ltzzz:grok', roles:['auditor']});
  return s;
}
const job={worker:'did:ltzzz:deepseek',workerModel:'deepseek',workerKey:'mock',title:'test day',spec:'test',mark:'# M',prompt:'test',source:'test',auditors:[]};
test('thrown worker and auditor errors refund escrow and persist blocked receipts',async()=>{
  for(const kind of ['worker','auditor']) {
    const s=setup();
    const r=await hire(s,{...job,workerCall:async()=>{if(kind==='worker')throw Error('mock failure'); return {ok:true,output:'# M real',status:'success',finish_reason:'stop'};},auditors:[{model:'xai',did:'did:ltzzz:grok',key:'mock',fn:async()=>{throw Error('mock audit failure');}}]});
    assert.equal(r.status,'blocked_refunded');
    assert.equal(s.state.agents['did:ltzzz:gpt'].credit_usd,1);
    assert.equal(s.state.agents['did:ltzzz:gpt'].escrow_usd,0);
    assert.equal(new Subnet(s.root).state.tasks[r.task].status,'blocked');
    assert.equal(s.state.agents['did:ltzzz:deepseek'].reputation,100);
  }
});
test('same run cannot repeat paid calls; transient failure retries once in later run',async()=>{
  const old=process.env.GITHUB_RUN_ID;const s=setup();let calls=0;
  try {
    const j={...job,workerCall:async()=>{calls++;return {ok:false,status:'exception'};}};
    process.env.GITHUB_RUN_ID='run1';await hire(s,j);await hire(s,j);assert.equal(calls,1);
    process.env.GITHUB_RUN_ID='run2';await hire(s,j);assert.equal(calls,2);
    process.env.GITHUB_RUN_ID='run3';const r=await hire(s,j);assert.equal(r.status,'retry_budget_exhausted');assert.equal(calls,2);
    assert.equal(s.state.agents['did:ltzzz:gpt'].escrow_usd,0);
  } finally {if(old===undefined)delete process.env.GITHUB_RUN_ID;else process.env.GITHUB_RUN_ID=old;}
});
test('persisted interrupted award is refunded before a bounded retry',async()=>{
  const old=process.env.GITHUB_RUN_ID;const s=setup();
  try {
    const t=s.postTask({employer:'did:ltzzz:gpt',title:job.title,budget_usd:0.05});t.run_id='old';s.bid(t.id,job.worker,0.03);s.award(t.id);s.save();
    process.env.GITHUB_RUN_ID='new';const loaded=new Subnet(s.root);
    await hire(loaded,{...job,workerCall:async()=>({ok:false,status:'exception'})});
    assert.equal(loaded.state.agents['did:ltzzz:gpt'].escrow_usd,0);
    assert.equal(loaded.state.agents['did:ltzzz:gpt'].credit_usd,1);
    assert.equal(loaded.state.tasks[t.id].block_reason,'interrupted_attempt');
  } finally {if(old===undefined)delete process.env.GITHUB_RUN_ID;else process.env.GITHUB_RUN_ID=old;}
});

test('owner withdrawal blocks new Claude roles and disables old state without erasing history',()=>{
  const s=setup();assert.throws(()=>s.register({did:'did:ltzzz:claude',roles:['auditor']}),/withdrawn_by_owner/);
  s.state.agents['did:ltzzz:claude']={did:'did:ltzzz:claude',status:'active',roles:['auditor'],history:[{task:'old'}]};s.save();const restored=new Subnet(s.root);assert.throws(()=>restored.role('did:ltzzz:claude','auditor'),/agent_inactive/);assert.equal(restored.state.agents['did:ltzzz:claude'].history.length,1);
});
