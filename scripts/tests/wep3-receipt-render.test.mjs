import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../wep3.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'WEP3 receipt script must exist');

async function render(receipt, fetchError = null, now = Date.parse('2026-11-09T06:00:00Z')) {
  const elements = Object.fromEntries(['state', 'freshness', 'money', 'detail'].map(id => [id, {textContent: '', innerHTML: ''}]));
  const FixedDate = class extends Date { static now() { return now; } };
  const context = vm.createContext({
    Date: FixedDate,
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

test('transaction hash missing, explicit null and empty strings remain distinct',async()=>{
  const absent=await render({paid:false}),none=await render({paid:false,tx_hash:null}),empty=await render({paid:false,tx_hash:''}),spaces=await render({paid:false,tx_hash:'  '});
  assert.match(absent.money.textContent,/字段缺失/);assert.match(none.money.textContent,/明确 null/);assert.match(empty.money.textContent,/空字符串/);assert.match(spaces.money.textContent,/空字符串/);
  assert.equal(new Set([absent.money.textContent,none.money.textContent,empty.money.textContent]).size,3);
});
test('malformed transaction hash types are not presented as absent transactions',async()=>{
  for(const tx_hash of [false,0,{},[]])assert.match((await render({tx_hash})).money.textContent,/类型错误/);
});
test('reported hash is rendered as text and remains explicitly unverified',async()=>{
  const hash='0x'+'a'.repeat(64),r=await render({paid:true,tx_hash:hash});assert.ok(r.money.textContent.includes(hash));assert.match(r.money.textContent,/未独立链上核验/);assert.equal(r.money.innerHTML,'');
});

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

test('null field entries do not hide a real failed check', async () => {
  const elements = await render({status: 'live_contract_check_failed', paid: false,
    live_checks: [null, {id: 'CONTROL', passed: false, comparison: {fields: [null,
      {key: 'controlled', expected: true, actual: false, matched: false}]}}]});
  assert.match(elements.state.textContent, /未通过/);
  assert.equal(JSON.parse(elements.detail.textContent).failed_checks[0].failed_fields[0].actual, false);
  assert.match(elements.money.textContent, /否/);
});

test('stale archived receipts are explicitly distinguished from current chain state', async () => {
  const elements = await render({at: '2026-11-02T01:44:32.360Z'});
  assert.match(elements.freshness.textContent, /超过24小时/);
  assert.match(elements.freshness.textContent, /不代表当前链上状态/);
});

test('fresh receipt timestamps are shown as recent without implying chain verification', async () => {
  const elements = await render({at: '2026-11-09T05:30:00.000Z'});
  assert.match(elements.freshness.textContent, /在24小时内/);
  assert.doesNotMatch(elements.freshness.textContent, /已超过24小时/);
});

test('missing, invalid and future receipt timestamps remain unverified', async () => {
  for (const receipt of [{}, {at: 'not-a-date'}, {at: '2026-11-09T07:00:00.000Z'}]) {
    const elements = await render(receipt);
    assert.match(elements.freshness.textContent, /不能判断新鲜度/);
  }
});

test('network failure does not leave a stale freshness claim', async () => {
  const elements = await render(null, new Error('network'));
  assert.match(elements.freshness.textContent, /读取失败/);
});

test('prototype property names remain literal statuses', async () => {
  for (const status of ['toString', 'constructor', '__proto__']) {
    assert.equal((await render({status})).state.textContent, status);
  }
});

test('generation summary permits only primitive public metadata', async () => {
  const elements = await render({status: 'blocked', worker_generation: {
    status: 'exception', model: 'test-model', tokens_used: 0,
    request_id: {error: 'TEST_ONLY_SECRET'}, error: 'TEST_ONLY_SECRET',
    headers: {Authorization: 'Bearer TEST_ONLY_SECRET'},
  }});
  assert.deepEqual(JSON.parse(elements.detail.textContent).worker_generation,
    {status: 'exception', model: 'test-model', tokens_used: 0});
  assert.doesNotMatch(elements.detail.textContent, /TEST_ONLY_SECRET|Authorization/);
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

test('failed HTTP status and malformed expected shape are visible in receipt details', async () => {
  const elements = await render({
    status: 'live_contract_check_failed', paid: false, tx_hash: null,
    live_checks: [
      {id: 'HTTP_503', path: '/health', passed: false, http: 503,
       comparison: {expected_http: 200, actual_http: 503, http_matched: false, expected_shape_valid: true, fields: []}},
      {id: 'INVALID_SPEC', path: '/status', passed: false,
       comparison: {expected_http: 200, actual_http: 200, http_matched: true, expected_shape_valid: false, fields: []}},
    ],
  });
  const failed = JSON.parse(elements.detail.textContent).failed_checks;
  assert.equal(failed.length, 2);
  assert.equal(failed[0].expected_http, 200);
  assert.equal(failed[0].actual_http, 503);
  assert.equal(failed[0].http_matched, false);
  assert.equal(failed[1].expected_shape_valid, false);
  assert.match(elements.state.textContent, /未通过/);
  assert.match(elements.money.textContent, /付款标记.*否/);
});
