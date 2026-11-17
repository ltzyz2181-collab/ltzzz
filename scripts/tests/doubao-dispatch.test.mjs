import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runOnce, validateCard, pending, assertProxyOnly} from '../run-doubao-dispatch.mjs';

const mk = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-')); return {queueDir: path.join(d, 'q'), receiptDir: path.join(d, 'r')}; };
const card = (dir, over = {}) => { fs.mkdirSync(dir, {recursive: true}); const c = {id: 'DOUBAO-TEST-0001', agent: 'doubao', prompt: '请只读复核下面给出的账本写入边界，逐条给出结论，不要声称已部署。', max_tokens: 1024, ...over}; fs.writeFileSync(path.join(dir, c.id + '.json'), JSON.stringify(c)); return c; };

test('no cards -> no call', async () => {
  const p = mk(); let calls = 0;
  const r = await runOnce({...p, call: async () => { calls++; }});
  assert.equal(r.executed, false); assert.equal(calls, 0);
});

test('a lost durable reservation blocks before the provider; a recorded reservation is not repurchased', async () => {
  const p = mk(); card(p.queueDir); let calls = 0;
  await assert.rejects(() => runOnce({...p, reserve: async () => { throw Error('write_unknown'); }, call: async () => { calls++; }}), /write_unknown/);
  const r = await runOnce({...p, call: async () => { calls++; }});
  assert.equal(r.model_calls, 0); assert.equal(calls, 0);
  const rec = JSON.parse(fs.readFileSync(path.join(p.receiptDir, 'DOUBAO-TEST-0001.json')));
  assert.equal(rec.status, 'reserved_before_provider_call'); assert.equal(rec.accepted, false);
});

test('valid card -> one call, draft only, never accepted/paid/financial', async () => {
  const p = mk(); card(p.queueDir); let calls = 0;
  const r = await runOnce({...p, call: async () => { calls++; return {ok: true, status: 'success', output: '复核结论', provider: 'volcengine_ark', model: 'doubao-seed-2-1-pro', model_source: 'provider_response', finish_reason: 'stop', tokens_used: 12}; }});
  assert.equal(calls, 1); assert.equal(r.status, 'draft_delivered_pending_independent_review');
  const rec = JSON.parse(fs.readFileSync(path.join(p.receiptDir, 'DOUBAO-TEST-0001.json')));
  assert.equal(rec.accepted, false); assert.equal(rec.paid, false); assert.equal(rec.tx_hash, null);
  assert.equal(rec.financial_execution, false); assert.equal(rec.actual_cloud_deployment, false);
  assert.equal(rec.executor, 'doubao'); assert.equal(rec.native_doubao_call, true);
  assert.equal(rec.output_sha256.length, 64); assert.equal(rec.independent_review, 'pending_other_provider');
  assert.deepEqual(pending(p), []);
});

test('second run does not re-call a processed card', async () => {
  const p = mk(); card(p.queueDir); let calls = 0;
  const call = async () => { calls++; return {ok: true, status: 'success', output: 'x'}; };
  await runOnce({...p, call}); await runOnce({...p, call}); assert.equal(calls, 1);
});

test('provider failure is recorded as failure, not success, and not retried', async () => {
  const p = mk(); card(p.queueDir); let calls = 0;
  const r = await runOnce({...p, call: async () => { calls++; return {ok: false, status: 'proxy_auth_error', error: 'HTTP 401'}; }});
  assert.equal(r.status, 'proxy_auth_error'); assert.equal(calls, 1); assert.deepEqual(pending(p), []);
});

test('missing required section is a rejected delivery, not a second paid request', async () => {
  const p = mk(); card(p.queueDir, {required_sections: ['【核查结论】']});
  const r = await runOnce({...p, call: async () => ({ok: true, status: 'success', output: '普通产出\n【交付结束】', finish_reason: 'stop', model: 'doubao-seed-2-1-pro', model_source: 'provider_response'})});
  assert.equal(r.status, 'missing_required_section');
  const rec = JSON.parse(fs.readFileSync(path.join(p.receiptDir, 'DOUBAO-TEST-0001.json')));
  assert.equal(rec.accepted, false); assert.deepEqual(rec.delivery_integrity.missing_sections, ['【核查结论】']);
  assert.deepEqual(pending(p), []);
});

test('only one card per run, sorted by filename', async () => {
  const p = mk(); card(p.queueDir, {id: 'DOUBAO-TEST-0002'}); card(p.queueDir, {id: 'DOUBAO-TEST-0001'});
  const seen = [];
  await runOnce({...p, call: async input => { seen.push(input.prompt.slice(0, 20)); return {ok: true, status: 'success', output: 'x'}; }});
  assert.equal(seen.length, 1);
  assert.equal(pending(p).length, 1);
});

test('invalid cards rejected without model call', async () => {
  for (const over of [{real_money: true}, {agent: 'qianwen'}, {max_tokens: 99999}, {max_tokens: 64}, {model: 'gpt-4o'}, {prompt: 'x'.repeat(40001)}, {original_task_id: 'x'}]) {
    const p = mk(); card(p.queueDir, over); let calls = 0;
    const r = await runOnce({...p, call: async () => { calls++; }});
    assert.equal(r.reason, 'invalid_card', JSON.stringify(over).slice(0, 40)); assert.equal(calls, 0);
  }
  assert.ok(validateCard({id: 'DOUBAO-TEST-0001', agent: 'doubao', prompt: 'x'.repeat(30)}, 'OTHER.json').includes('filename_must_equal_id'));
  assert.ok(validateCard({id: 'DOUBAO-TEST-0001', agent: 'doubao', prompt: 'x'.repeat(30), required_sections: ['']}, 'DOUBAO-TEST-0001.json').includes('invalid_required_sections'));
});

test('doubao may not be called without the existing proxy', () => {
  assert.throws(() => assertProxyOnly({}), /existing_proxy_only_no_fallback/);
  assert.throws(() => assertProxyOnly({DOUBAO_USE_PROXY: '1'}), /existing_proxy_only_no_fallback/);
  assert.doesNotThrow(() => assertProxyOnly({DOUBAO_USE_PROXY: 'true'}));
});