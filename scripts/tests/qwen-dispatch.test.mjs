import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runOnce, validateCard, pending} from '../run-qwen-dispatch.mjs';

const mk = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-')); return {queueDir: path.join(d, 'q'), receiptDir: path.join(d, 'r')}; };
const card = (dir, over = {}) => { fs.mkdirSync(dir, {recursive: true}); const c = {id: 'QWEN-TEST-0001', agent: 'qianwen', prompt: '请用一句话说明什么是任务认领回执，不要执行任何命令。', max_tokens: 128, ...over}; fs.writeFileSync(path.join(dir, c.id + '.json'), JSON.stringify(c)); return c; };

test('no cards -> no call', async () => {
  const p = mk(); let calls = 0;
  const r = await runOnce({...p, call: async () => { calls++; }});
  assert.equal(r.executed, false); assert.equal(calls, 0);
});
test('valid card -> one call, draft only, never accepted/paid', async () => {
  const p = mk(); card(p.queueDir); let calls = 0;
  const r = await runOnce({...p, call: async () => { calls++; return {ok: true, status: 'success', output: '回执', native_qwen_call: true, model: 'qwen-plus', finish_reason: 'stop', tokens_used: 9}; }});
  assert.equal(calls, 1); assert.equal(r.status, 'draft_delivered_pending_independent_review');
  const rec = JSON.parse(fs.readFileSync(path.join(p.receiptDir, 'QWEN-TEST-0001.json')));
  assert.equal(rec.accepted, false); assert.equal(rec.paid, false); assert.equal(rec.tx_hash, null); assert.equal(rec.output_sha256.length, 64);
  assert.deepEqual(pending(p), []);
});
test('second run does not re-call a processed card', async () => {
  const p = mk(); card(p.queueDir); let calls = 0; const call = async () => { calls++; return {ok: true, status: 'success', output: 'x'}; };
  await runOnce({...p, call}); await runOnce({...p, call}); assert.equal(calls, 1);
});
test('provider failure is recorded as failure, not success, and not retried', async () => {
  const p = mk(); card(p.queueDir); let calls = 0;
  const r = await runOnce({...p, call: async () => { calls++; return {ok: false, status: 'billing_or_quota_error', error: 'HTTP 400'}; }});
  assert.equal(r.status, 'billing_or_quota_error'); assert.equal(calls, 1); assert.deepEqual(pending(p), []);
});
test('invalid cards rejected without model call (real_money, wrong agent, id mismatch)', async () => {
  for (const over of [{real_money: true}, {agent: 'deepseek'}, {max_tokens: 99999}]) {
    const p = mk(); card(p.queueDir, over); let calls = 0;
    const r = await runOnce({...p, call: async () => { calls++; }});
    assert.equal(r.reason, 'invalid_card'); assert.equal(calls, 0);
  }
  assert.ok(validateCard({id: 'QWEN-TEST-0001', agent: 'qianwen', prompt: 'x'.repeat(30)}, 'OTHER.json').includes('filename_must_equal_id'));
});

test('kimi card below profile floor is rejected before provider call', () => {
  const low = validateCard({id: 'QWEN-KIMI-0001', agent: 'qianwen', prompt: 'x'.repeat(30), model: 'kimi-k2', max_tokens: 1024}, 'QWEN-KIMI-0001.json');
  assert.ok(low.includes('kimi_max_tokens_below_profile_floor_3000'), low.join(','));
  // above the floor: no token-budget error
  const ok = validateCard({id: 'QWEN-KIMI-0002', agent: 'qianwen', prompt: 'x'.repeat(30), model: 'kimi-k2', max_tokens: 4000}, 'QWEN-KIMI-0002.json');
  assert.ok(!ok.some(e => e.startsWith('kimi_max_tokens_')), ok.join(','));
  assert.ok(!ok.some(e => e.startsWith('max_tokens_')), ok.join(','));
  // qwen card still bounded to the qwen ceiling
  assert.ok(validateCard({id: 'QWEN-Q-0001', agent: 'qianwen', prompt: 'x'.repeat(30), model: 'qwen-plus', max_tokens: 99999}, 'QWEN-Q-0001.json').includes('max_tokens_64_to_16384'));
});
