import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../wep3.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'WEP3 receipt script must exist');

async function render(receipt, fetchError = null) {
  const elements = Object.fromEntries(['state', 'money', 'detail'].map(id => [id, {textContent: '', innerHTML: ''}]));
  const context = vm.createContext({
    document: {getElementById: id => elements[id]},
    fetch: async () => {
      if (fetchError) throw fetchError;
      return {ok: true, json: async () => receipt};
    },
  });
  new vm.Script(script, {filename: 'wep3.inline.js'}).runInContext(context);
  await new Promise(resolve => setImmediate(resolve));
  return elements;
}

test('failed live contract checks are visible without claiming settlement', async () => {
  const elements = await render({
    status: 'live_contract_check_failed', paid: false, tx_hash: null,
    worker_generation: {status: 'success', tokens_used: 1270},
    live_checks: [
      {id: 'TREASURY_PUBLIC_002', path: '/market/treasury', passed: false,
       comparison: {fields: [{key: 'controlled', expected: true, actual: false, matched: false}]}},
      {id: 'AAVE_STATUS_PUBLIC_003', path: '/market/aave/status', passed: false,
       comparison: {fields: [{key: 'ok', expected: true, actual: false, matched: false}]}},
      {id: 'HEALTH_PUBLIC_001', passed: true},
    ],
  });
  const detail = JSON.parse(elements.detail.textContent);
  assert.match(elements.state.textContent, /未通过/);
  assert.match(elements.money.textContent, /否/);
  assert.equal(detail.failed_checks.length, 2);
  assert.equal(detail.failed_checks[0].failed_fields[0].key, 'controlled');
  assert.equal(detail.worker_generation.tokens_used, 1270);
});

test('internal credit is not displayed as cash payment', async () => {
  const elements = await render({status: 'internal_credit_settled', paid: false, tx_hash: null});
  assert.match(elements.state.textContent, /内部积分/);
  assert.match(elements.money.textContent, /付款标记.*否/);
});

test('missing status and payment remain unknown', async () => {
  const elements = await render({});
  assert.equal(elements.state.textContent, '状态未知');
  assert.match(elements.money.textContent, /未知/);
});

test('malicious receipt strings remain text, never HTML', async () => {
  const payload = '<svg onload=alert(1)>';
  const elements = await render({status: payload, paid: 'false', live_checks: [{id: payload, passed: false}]});
  assert.equal(elements.state.innerHTML, '');
  assert.equal(elements.detail.innerHTML, '');
  assert.equal(JSON.parse(elements.detail.textContent).failed_checks[0].id, payload);
  assert.match(elements.money.textContent, /未知/);
});

test('missing or nonarray checks and network failure are handled', async () => {
  const elements = await render({status: 'live_contract_check_failed', live_checks: {}, paid: true});
  assert.equal(JSON.parse(elements.detail.textContent).failed_checks, undefined);
  assert.match(elements.money.textContent, /是/);
  const failed = await render(null, new Error('network'));
  assert.match(failed.state.textContent, /暂无可读取回执/);
});

test('execution and commit provenance remain visible for blocked provider deliveries', async () => {
  const elements = await render({
    at: '2026-10-31T01:45:22.188Z',
    execution_id: '41156800095',
    source_commit: '0527dc8e07a2e402420737010497ac0b637394f1',
    trigger_commit: '0527dc8e07a2e402420737010497ac0b637394f1',
    status: 'blocked',
    reason: 'fresh_provider_delivery_failed',
    worker_generation: {status: 'exception', tokens_used: 0},
    paid: false,
    tx_hash: null,
  });
  const detail = JSON.parse(elements.detail.textContent);
  assert.equal(detail.execution_id, '41156800095');
  assert.equal(detail.source_commit, '0527dc8e07a2e402420737010497ac0b637394f1');
  assert.equal(detail.trigger_commit, detail.source_commit);
  assert.equal(detail.reason, 'fresh_provider_delivery_failed');
  assert.match(elements.money.textContent, /付款标记.*否/);
  assert.equal(elements.detail.innerHTML, '');
});
