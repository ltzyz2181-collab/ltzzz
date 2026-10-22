import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Subnet, MEMORY_GATE } from '../agi-econ/subnet.mjs';
import { hire } from '../agi-econ/hire.mjs';
import { scanResumable, resumeTask, summary } from '../agi-econ/resume.mjs';
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-resume-'));
  for (const p of MEMORY_GATE) { fs.mkdirSync(path.join(root, path.dirname(p)), { recursive: true }); fs.writeFileSync(path.join(root, p), p); }
  const s = new Subnet(root);
  s.register({ did: 'did:ltzzz:gpt', roles: ['employer'], deposit_usd: 1 });
  s.register({ did: 'did:ltzzz:deepseek', roles: ['worker'] });
  s.register({ did: 'did:ltzzz:grok', roles: ['auditor'] });
  return s;
}
const job = { worker: 'did:ltzzz:deepseek', workerModel: 'deepseek', workerKey: 'mock', title: 'resume day', spec: 'test', mark: '# M', prompt: 'test', source: 'test', auditors: [] };
const goodCall = async () => ({ ok: true, output: '# M real', status: 'success', finish_reason: 'stop' });
const goodAuditor = [{ model: 'xai', did: 'did:ltzzz:grok', key: 'mock', fn: async () => ({ ok: true, output: '{"accepted":true,"score":90}', status: 'success', finish_reason: 'stop' }) }];
const receiptOf = (s, id) => JSON.parse(fs.readFileSync(path.join(s.root, s.state.tasks[id].receipt), 'utf8'));
const withOwnRunId = async (fn) => {
  const old = process.env.GITHUB_RUN_ID;
  try { delete process.env.GITHUB_RUN_ID; return await fn(); } finally { if (old !== undefined) process.env.GITHUB_RUN_ID = old; }
};
// Block a task at the worker stage so it has a pinned context but no deliverable.
const blocked = () => withOwnRunId(async () => {
  const s = setup();
  const r = await hire(s, { ...job, workerCall: async () => { throw new Error('mock transport failure'); } });
  return { s, id: r.task };
});

test('a blocked task with a context is reported resumable, a legacy one is not', async () => {
  const { s, id } = await blocked();
  const legacy = s.state.tasks[id];
  delete legacy.context;
  const rows = scanResumable(s.state);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].resumable, false);
  assert.equal(rows[0].reason, 'context_missing');
  assert.deepEqual(summary(rows), { blocked: 1, resumable: 0, blocked_by_reason: { context_missing: 1 }, model_calls: 0, real_funds_moved: false, paid: false, tx_hash: null });
});

test('reopening re-charges the employer so a resume cannot mint money', async () => {
  const { s, id } = await blocked();
  const e = s.state.agents['did:ltzzz:gpt'];
  assert.equal(e.credit_usd, 1);
  assert.equal(e.escrow_usd, 0);
  s.reopen(id, { reason: 'resume_blocked' });
  const budget = s.state.tasks[id].budget_usd;
  assert.equal(e.credit_usd, 1 - budget);
  assert.equal(e.escrow_usd, budget);
  assert.equal(s.state.tasks[id].status, 'open');
  assert.equal(s.state.tasks[id].resume_count, 1);
  assert.equal(s.state.tasks[id].bids.length, 0);
  assert.equal(s.state.tasks[id].resumes[0].paid, false);
  assert.equal(s.state.tasks[id].resumes[0].tx_hash, null);
});

test('reopening keeps the failed attempt receipt under history instead of overwriting it', async () => {
  const { s, id } = await blocked();
  const before = receiptOf(s, id);
  assert.equal(before.status, 'blocked_refunded');
  s.reopen(id, { reason: 'resume_blocked' });
  const hist = s.state.tasks[id].receipt_history;
  assert.equal(hist.length, 1);
  const kept = JSON.parse(fs.readFileSync(path.join(s.root, hist[0].path), 'utf8'));
  assert.equal(kept.status, 'blocked_refunded');
  assert.equal(kept.stage, 'worker_call');
  assert.equal(s.state.tasks[id].receipt, undefined);
});

test('a reopen fails closed when the context or the credit is missing', async () => {
  const { s, id } = await blocked();
  const ctx = s.state.tasks[id].context;
  delete s.state.tasks[id].context;
  assert.throws(() => s.reopen(id), /resume_without_context/);
  s.state.tasks[id].context = ctx;
  s.state.agents['did:ltzzz:gpt'].credit_usd = 0;
  try { s.reopen(id); assert.fail('should have thrown'); } catch (e) {
    assert.match(e.message, /employer_credit_insufficient/);
    assert.equal(e.diagnostics.credit_usd, 0);
  }
  assert.equal(s.state.tasks[id].status, 'blocked');
});

test('a resumed task runs the full gate and settles on the same task id', async () => {
  const { s, id } = await blocked();
  const r = await resumeTask(s, id, { workerCall: goodCall, workerKey: 'mock', workerModel: 'deepseek', auditors: goodAuditor });
  assert.equal(r.task, id);
  assert.equal(r.status, 'settled');
  const t = s.state.tasks[id];
  assert.equal(t.status, 'settled');
  assert.equal(t.resume_count, 1);
  const rc = receiptOf(s, id);
  assert.equal(rc.resumed, true);
  assert.equal(rc.paid, false);
  assert.equal(rc.tx_hash, null);
  assert.equal(rc.settlement_mode, 'internal_credit');
  assert.ok(s.state.agents['did:ltzzz:deepseek'].credit_usd > 0);
});

test('a resume refuses to run without a worker call or a recorded seat', async () => {
  const { s, id } = await blocked();
  await assert.rejects(() => resumeTask(s, id, { workersKey: 'mock' }), /worker_call_required/);
  const noBids = s.state.tasks[id];
  const w = noBids.bids; noBids.bids = []; delete noBids.worker;
  await assert.rejects(() => resumeTask(s, id, { workerCall: goodCall, workerKey: 'mock' }), /resume_without_worker/);
  noBids.bids = w;
});

// ---- backfill: owner-attested context intake for legacy blocked tasks (red-first) ----
import { backfillContext } from '../agi-econ/resume.mjs';

test('backfill attaches an owner-attested context and makes the legacy task resumable', async () => {
  const { s, id } = await blocked();
  delete s.state.tasks[id].context;
  const beforeReason = s.state.tasks[id].block_reason;
  const beforeCredit = s.state.agents['did:ltzzz:gpt'].credit_usd;
  const r = backfillContext(s, id, { prompt: 'original task prompt', source_excerpt: '# src', actor: 'owner-copilot', note: 'reconstructed from handoff' });
  assert.equal(r.sha256?.length, 64);
  assert.equal(s.state.tasks[id].context.prompt, 'original task prompt');
  assert.equal(s.state.tasks[id].context.backfilled, true);
  assert.equal(s.state.tasks[id].context.backfilled_by, 'owner-copilot');
  assert.equal(s.state.tasks[id].status, 'blocked');            // status untouched
  assert.equal(s.state.tasks[id].block_reason, beforeReason);   // block evidence untouched
  assert.equal(s.state.agents['did:ltzzz:gpt'].credit_usd, beforeCredit); // no escrow moves
  assert.equal(scanResumable(s.state)[0].resumable, true);
});

test('backfill fails closed on unknown / non-blocked / missing prompt / existing context', async () => {
  const { s, id } = await blocked();
  delete s.state.tasks[id].context;
  assert.throws(() => backfillContext(s, 'nope', { prompt: 'x', actor: 'a' }), /unknown_task/);
  assert.throws(() => backfillContext(s, id, { prompt: '  ', actor: 'a' }), /empty_prompt/);
  // existing context must not be overwritten
  backfillContext(s, id, { prompt: 'first', actor: 'a' });
  const sha1 = s.state.tasks[id].context.sha256;
  assert.throws(() => backfillContext(s, id, { prompt: 'second-attempt', actor: 'a' }), /already_has_context/);
  assert.equal(s.state.tasks[id].context.prompt, 'first');
  assert.equal(s.state.tasks[id].context.sha256, sha1);
  // settle a task, then backfill must be rejected
  const settled = await blocked();
  await resumeTask(settled.s, settled.id, { workerCall: goodCall, workerKey: 'mock', workerModel: 'deepseek', auditors: goodAuditor });
  assert.throws(() => backfillContext(settled.s, settled.id, { prompt: 'x', actor: 'a' }), /task_final:settled/);
});
