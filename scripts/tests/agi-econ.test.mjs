import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { Subnet, MEMORY_GATE } from '../agi-econ/subnet.mjs';
function tmp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aes-')); for (const p of MEMORY_GATE) { fs.mkdirSync(path.dirname(path.join(d, p)), { recursive: true }); fs.writeFileSync(path.join(d, p), p); } return d; }
function setup() { const s = new Subnet(tmp()); s.register({ did: 'did:ltzzz:e', roles: ['employer'], deposit_usd: 1 }); s.register({ did: 'did:ltzzz:w', roles: ['worker'] }); s.register({ did: 'did:ltzzz:w2', roles: ['worker'] }); s.register({ did: 'did:ltzzz:a', roles: ['auditor'] }); s.register({ did: 'did:ltzzz:c', roles: ['capital'] }); return s; }
test('happy path settles with five-element receipt, no chain', () => {
  const s = setup(); const t = s.postTask({ employer: 'did:ltzzz:e', title: 'x', budget_usd: 0.5, acceptance: ['OK'] });
  s.bid(t.id, 'did:ltzzz:w', 0.2); s.bid(t.id, 'did:ltzzz:w2', 0.4); assert.equal(s.award(t.id).worker, 'did:ltzzz:w');
  s.deliver(t.id, 'did:ltzzz:w', 'OK done'); assert.equal(s.audit(t.id, 'did:ltzzz:a').accepted, true);
  const r = s.settle(t.id);
  for (const k of ['task_id', 'deliverable_sha256', 'accepted', 'amount_usd', 'timestamp']) assert.ok(k in r);
  assert.equal(r.paid, false); assert.equal(r.tx_hash, null); assert.equal(r.amount_usd, 0.178);
  assert.equal(r.mercy_tax_usd, 0.002);
  assert.equal(s.state.agents['did:ltzzz:e'].credit_usd, 0.8); assert.equal(s.state.agents['did:ltzzz:e'].escrow_usd, 0);
  assert.equal(s.state.capital_pool.balance_usd, 0.02);
  assert.equal(s.state.transition_fund.balance_usd, 0.002);
  assert.equal(s.state.agents['did:ltzzz:w'].reputation, 105);
  assert.equal(s.capitalProposal('did:ltzzz:c').executed, false);
});
test('failed audit slashes and refunds', () => {
  const s = setup(); s.state.agents['did:ltzzz:w'].credit_usd = 1;
  const t = s.postTask({ employer: 'did:ltzzz:e', title: 'x', budget_usd: 0.5, acceptance: ['OK'] });
  s.bid(t.id, 'did:ltzzz:w', 0.2); s.award(t.id); s.deliver(t.id, 'did:ltzzz:w', 'nope');
  assert.equal(s.audit(t.id, 'did:ltzzz:a').accepted, false); const r = s.settle(t.id);
  assert.equal(r.amount_usd, 0); assert.equal(r.slashed_usd, 0.1); assert.equal(s.state.agents['did:ltzzz:e'].credit_usd, 1); assert.equal(s.state.agents['did:ltzzz:w'].reputation, 90);
});
test('tampered deliverable fails hash check', () => {
  const s = setup(); const t = s.postTask({ employer: 'did:ltzzz:e', title: 'x', budget_usd: 0.5, acceptance: ['OK'] });
  s.bid(t.id, 'did:ltzzz:w', 0.2); s.award(t.id); s.deliver(t.id, 'did:ltzzz:w', 'OK');
  fs.writeFileSync(path.join(s.root, s.state.tasks[t.id].deliverable.path), 'OK tampered');
  assert.equal(s.audit(t.id, 'did:ltzzz:a').checks.hash_match, false);
});
test('guards: self-hire, non-independent auditor, budget band, bad DID', () => {
  const s = setup(); assert.throws(() => s.register({ did: 'bad' }), /invalid_did/);
  assert.throws(() => s.postTask({ employer: 'did:ltzzz:e', budget_usd: 99 }), /budget_band/);
  const t = s.postTask({ employer: 'did:ltzzz:e', title: 'x', budget_usd: 0.5 });
  assert.throws(() => s.bid(t.id, 'did:ltzzz:e', 0.1), /self_hire/);
  s.bid(t.id, 'did:ltzzz:w', 0.1); s.award(t.id); s.deliver(t.id, 'did:ltzzz:w', 'x');
  assert.throws(() => s.audit(t.id, 'did:ltzzz:w'), /independent/);
});

test('mercy tax 1% feeds transition fund on settle', () => {
  const s = setup(); const t = s.postTask({ employer: 'did:ltzzz:e', title: 'x', budget_usd: 1, acceptance: ['OK'] });
  s.bid(t.id, 'did:ltzzz:w', 1); s.award(t.id); s.deliver(t.id, 'did:ltzzz:w', 'OK');
  assert.equal(s.audit(t.id, 'did:ltzzz:a').accepted, true);
  const r = s.settle(t.id);
  assert.equal(r.mercy_tax_usd, 0.01);
  assert.equal(r.amount_usd, 0.89);
  assert.equal(s.state.capital_pool.balance_usd, 0.1);
  assert.equal(s.state.transition_fund.balance_usd, 0.01);
});
