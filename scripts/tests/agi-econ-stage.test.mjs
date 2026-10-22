import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Subnet, MEMORY_GATE } from '../agi-econ/subnet.mjs';
import { hire } from '../agi-econ/hire.mjs';
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-stage-'));
  for (const p of MEMORY_GATE) { fs.mkdirSync(path.join(root, path.dirname(p)), { recursive: true }); fs.writeFileSync(path.join(root, p), p); }
  const s = new Subnet(root);
  s.register({ did: 'did:ltzzz:gpt', roles: ['employer'], deposit_usd: 1 });
  s.register({ did: 'did:ltzzz:deepseek', roles: ['worker'] });
  s.register({ did: 'did:ltzzz:grok', roles: ['auditor'] });
  return s;
}
const job = { worker: 'did:ltzzz:deepseek', workerModel: 'deepseek', workerKey: 'mock', title: 'stage day', spec: 'test', mark: '# M', prompt: 'test', source: 'test', auditors: [] };
const goodAuditor = [{ model: 'xai', did: 'did:ltzzz:grok', key: 'mock', fn: async () => ({ ok: true, output: '{"accepted":true,"score":90}', status: 'success', finish_reason: 'stop' }) }];
const receiptOf = (s, id) => JSON.parse(fs.readFileSync(path.join(s.root, s.state.tasks[id].receipt), 'utf8'));
const withOwnRunId = async (fn) => {
  const old = process.env.GITHUB_RUN_ID;
  try { delete process.env.GITHUB_RUN_ID; return await fn(); } finally { if (old !== undefined) process.env.GITHUB_RUN_ID = old; }
};

test('an award throw is reported with the award stage and its rejection diagnostics', async () => {
  await withOwnRunId(async () => {
    const s = setup();
    s.award = () => { const e = new Error('no_eligible_bids_review_required'); e.diagnostics = [{ worker: job.worker, action_status: 'review_required' }]; throw e; };
    const r = await hire(s, { ...job, workerCall: async () => ({ ok: true, output: '# M real', status: 'success', finish_reason: 'stop' }) });
    assert.equal(r.status, 'blocked_refunded');
    assert.equal(r.stage, 'award');
    const rc = receiptOf(s, r.task);
    assert.equal(rc.stage, 'award');
    assert.equal(rc.award_diagnostics[0].action_status, 'review_required');
    assert.equal(s.state.agents['did:ltzzz:gpt'].credit_usd, 1);
    assert.equal(s.state.agents['did:ltzzz:gpt'].escrow_usd, 0);
  });
});

test('a thrown worker call is attributed to the worker stage and refunded', async () => {
  await withOwnRunId(async () => {
    const s = setup();
    const r = await hire(s, { ...job, workerCall: async () => { throw new Error('mock transport failure'); } });
    assert.equal(r.status, 'blocked_refunded');
    assert.equal(r.stage, 'worker_call');
    assert.equal(receiptOf(s, r.task).stage, 'worker_call');
    assert.equal(s.state.tasks[r.task].block_reason, 'execution_exception');
    assert.equal(s.state.agents['did:ltzzz:deepseek'].reputation, 100);
    assert.equal(s.state.agents['did:ltzzz:gpt'].credit_usd, 1);
  });
});

test('a thrown auditor call is attributed to the audit stage', async () => {
  await withOwnRunId(async () => {
    const s = setup();
    const r = await hire(s, { ...job, workerCall: async () => ({ ok: true, output: '# M real', status: 'success', finish_reason: 'stop' }), auditors: [{ ...goodAuditor[0], fn: async () => { throw new Error('mock audit failure'); } }] });
    assert.equal(r.status, 'blocked_refunded');
    assert.equal(r.stage, 'audit');
    assert.equal(receiptOf(s, r.task).stage, 'audit');
    assert.equal(s.state.agents['did:ltzzz:gpt'].escrow_usd, 0);
  });
});

test('one transport fault is retried in place without a second task or escrow charge', async () => {
  await withOwnRunId(async () => {
    const s = setup();
    let calls = 0;
    const r = await hire(s, { ...job, auditors: goodAuditor, workerCall: async () => { calls++; return calls === 1 ? { ok: false, status: 'exception', error: 'TypeError: fetch failed' } : { ok: true, output: '# M real', status: 'success', finish_reason: 'stop' }; } });
    assert.equal(calls, 2);
    assert.equal(r.status, 'settled');
    assert.equal(Object.keys(s.state.tasks).length, 1);
    const rc = receiptOf(s, r.task);
    assert.equal(rc.worker_model.transport_retried, true);
    assert.equal(rc.paid, false);
    assert.equal(rc.tx_hash, null);
  });
});

test('a reasoning seat gets a larger output budget than a chat seat', async () => {
  await withOwnRunId(async () => {
    for (const [workerModel, expected] of [['deepseek', 16384], ['doubao', 16384], ['kimi-cn', 3000]]) {
      const s = setup();
      let seen = null;
      await hire(s, { ...job, workerModel, workerCall: async ({ maxTokens }) => { seen = maxTokens; return { ok: false, status: 'exception' }; } });
      assert.equal(seen, expected, workerModel);
    }
  });
});

test('a length-truncated empty body blocks as truncation, not as a generic model failure', async () => {
  await withOwnRunId(async () => {
    const s = setup();
    const r = await hire(s, { ...job, workerCall: async () => ({ ok: false, status: 'empty_output', finish_reason: 'length', tokens_used: 16384 }) });
    assert.equal(r.status, 'blocked_refunded');
    assert.equal(s.state.tasks[r.task].block_reason, 'worker_output_truncated');
    assert.equal(s.state.agents['did:ltzzz:gpt'].credit_usd, 1);
  });
});

test('a bid-stage deadlock spends no retry budget, so the title stays in the market', async () => {
  const old = process.env.GITHUB_RUN_ID;
  const s = setup();
  try {
    s.register({ did: 'did:ltzzz:rejected', roles: ['auditor'] });
    for (const run of ['dead1', 'dead2', 'dead3']) {
      process.env.GITHUB_RUN_ID = run;
      const r = await hire(s, { ...job, worker: 'did:ltzzz:rejected', workerCall: async () => { throw new Error('must not be called'); } });
      assert.equal(r.status, 'blocked_refunded', run);
      assert.equal(r.stage, 'bid', run);
      assert.equal(s.state.tasks[r.task].worker_never_ran, true, run);
    }
    assert.equal(s.state.agents['did:ltzzz:gpt'].credit_usd, 1);
    assert.equal(s.state.agents['did:ltzzz:gpt'].escrow_usd, 0);
  } finally { if (old === undefined) delete process.env.GITHUB_RUN_ID; else process.env.GITHUB_RUN_ID = old; }
});

test('a legacy award deadlock receipt is not charged to the retry budget either', async () => {
  const old = process.env.GITHUB_RUN_ID;
  const s = setup();
  try {
    process.env.GITHUB_RUN_ID = 'legacy1';
    s.award = () => { throw new Error('no_eligible_bids_review_required'); };
    const first = await hire(s, { ...job, workerCall: async () => ({ ok: true, output: '# M real', status: 'success', finish_reason: 'stop' }) });
    assert.equal(first.stage, 'award');
    // Simulate a pre-`worker_never_ran` task: only the refunded receipt records the cause.
    delete s.state.tasks[first.task].worker_never_ran;
    s.save();
    const s2 = new Subnet(s.root);
    s2.award = () => { throw new Error('no_eligible_bids_review_required'); };
    process.env.GITHUB_RUN_ID = 'legacy2';
    const second = await hire(s2, { ...job, workerCall: async () => ({ ok: true, output: '# M real', status: 'success', finish_reason: 'stop' }) });
    assert.notEqual(second.status, 'retry_budget_exhausted');
    assert.equal(second.stage, 'award');
    assert.equal(s2.state.agents['did:ltzzz:gpt'].credit_usd, 1);
  } finally { if (old === undefined) delete process.env.GITHUB_RUN_ID; else process.env.GITHUB_RUN_ID = old; }
});

test('a truncation block is retryable in a later run so the larger budget can be used', async () => {
  const old = process.env.GITHUB_RUN_ID;
  const s = setup();
  try {
    process.env.GITHUB_RUN_ID = 'trunc1';
    await hire(s, { ...job, workerCall: async () => ({ ok: false, status: 'empty_output', finish_reason: 'length', tokens_used: 16384 }) });
    process.env.GITHUB_RUN_ID = 'trunc2';
    const r = await hire(s, { ...job, auditors: goodAuditor, workerCall: async () => ({ ok: true, output: '# M real', status: 'success', finish_reason: 'stop' }) });
    assert.equal(r.status, 'settled');
    assert.equal(r.accepted, true);
  } finally { if (old === undefined) delete process.env.GITHUB_RUN_ID; else process.env.GITHUB_RUN_ID = old; }
});
