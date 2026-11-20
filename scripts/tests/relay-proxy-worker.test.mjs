import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker, { ALLOWED_MODELS, BALANCE_FLOOR_USD, DAILY_COST_CAP_USD, MODEL_PRICES, MAX_CALL_COST_USD, MIN_INPUT_TOKENS, PROJECT_COST_CAP_USD, RelayBudget, authorized, estimateTokens, validateRequest } from '../../workers/relay-proxy/worker.mjs';
import { estimateInputTokens } from '../lib/relay-seat-guard.mjs';

const longText = '长上下文验收文本。'.repeat(700); // > 4096 estimated tokens

function request(body, { path = '/v1/chat/completions', token = 'proxy-token', method = 'POST' } = {}) {
  return new Request('https://ltzzz-relay-proxy.example.workers.dev' + path, {
    method,
    headers: token ? { 'content-type': 'application/json', 'x-ltzzz-seat-token': token } : { 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

// Minimal Durable Object storage: one Map plus a pass-through transaction.
class MemoryStorage {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.get(key); }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async transaction(fn) { return fn(this); }
}

function budgetEnv(env = {}, vars = { RELAY_CONFIRMED_BALANCE_USD: '12.737087' }) {
  const state = { storage: new MemoryStorage() };
  const instance = new RelayBudget(state, { ...vars, ...env });
  const binding = {
    idFromName: name => name,
    get: () => ({ fetch: request => instance.fetch(request) }),
  };
  return { binding, instance, state };
}

function budgetCall(instance, path, body) {
  return instance.fetch(new Request('https://relay-budget.internal' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })).then(response => response.json());
}

test('worker estimator matches the seat guard estimator', () => {
  const sample = '中文 abc 123\n' + longText;
  assert.equal(estimateTokens(sample), estimateInputTokens(sample));
});

test('proxy allowlists exactly the five seat models', () => {
  assert.deepEqual(ALLOWED_MODELS, ['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-4-6', 'claude-haiku-5-5', 'gpt-6.1-sol']);
});

test('allows a long gpt-class request', () => {
  const verdict = validateRequest({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: longText }], max_tokens: 512 });
  assert.equal(verdict.ok, true);
  assert.ok(verdict.estimated_input_tokens >= MIN_INPUT_TOKENS);
});

test('allows a short request because the policy floor is zero', () => {
  const verdict = validateRequest({ model: 'claude-opus-5-5', messages: [{ role: 'user', content: 'ping' }], max_tokens: 512 });
  assert.equal(verdict.ok, true);
  assert.equal(MIN_INPUT_TOKENS, 0);
});

test('refuses a model outside the allowlist', () => {
  const verdict = validateRequest({ model: 'gpt-5.5', messages: [{ role: 'user', content: longText }] });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'proxy_model_not_allowlisted');
});

test('refuses streaming, malformed bodies and bad max_tokens', () => {
  assert.equal(validateRequest({ model: 'gpt-6.1-sol', stream: true, messages: [{ role: 'user', content: longText }] }).code, 'proxy_stream_not_supported');
  assert.equal(validateRequest(null).code, 'proxy_body_invalid');
  assert.equal(validateRequest({ model: 'gpt-6.1-sol', messages: [] }).code, 'proxy_messages_invalid');
  assert.equal(validateRequest({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: longText }], max_tokens: 999999 }).code, 'proxy_max_tokens_invalid');
});

test('proxy token comparison rejects empty and mismatched tokens', () => {
  assert.equal(authorized(request({}, { token: 'proxy-token' }), 'proxy-token'), true);
  assert.equal(authorized(request({}, { token: 'wrong-token' }), 'proxy-token'), false);
  assert.equal(authorized(request({}, { token: null }), 'proxy-token'), false);
  assert.equal(authorized(request({}, { token: 'proxy-token' }), ''), false);
});

test('gateway rejects unauthenticated callers before reading the key', async () => {
  const response = await worker.fetch(request({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: longText }] }, { token: null }), { PROXY_ACCESS_TOKEN: 'proxy-token', RELAY_STATION_KEY: 'station-key' });
  assert.equal(response.status, 401);
});

test('gateway answers 503 when the station key secret is absent', async () => {
  const response = await worker.fetch(request({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: longText }] }), { PROXY_ACCESS_TOKEN: 'proxy-token' });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, 'proxy_key_missing');
});

test('gateway rejects unknown routes and methods', async () => {
  const notFound = await worker.fetch(request({}, { path: '/v1/models' }), { PROXY_ACCESS_TOKEN: 'proxy-token', RELAY_STATION_KEY: 'station-key' });
  assert.equal(notFound.status, 404);
  const wrongMethod = await worker.fetch(request({}, { method: 'GET', token: 'proxy-token' }), { PROXY_ACCESS_TOKEN: 'proxy-token', RELAY_STATION_KEY: 'station-key' });
  assert.equal(wrongMethod.status, 405);
});

test('the batch header no longer gates short requests; the context cap still applies', () => {
  const short = { model: 'gpt-6.1-sol', messages: [{ role: 'user', content: 'batch item: summarize one public note' }], max_tokens: 512 };
  assert.equal(validateRequest(short).ok, true);
  assert.equal(validateRequest(short, { batch: true }).ok, true);
  const tooBig = { model: 'gpt-6.1-sol', messages: [{ role: 'user', content: '长文'.repeat(600000) }] };
  assert.equal(validateRequest(tooBig, { batch: true }).code, 'proxy_context_too_large');
});

test('gateway accepts a short call and still routes it upstream', async () => {
  const env = { PROXY_ACCESS_TOKEN: 'proxy-token', RELAY_STATION_KEY: 'station-key', BUDGET: budgetEnv().binding };
  const realFetch = globalThis.fetch;
  let called = 0;
  globalThis.fetch = async () => {
    called += 1;
    return Response.json({ id: 'batch-req-1', model: 'gpt-6.1-sol', choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] });
  };
  try {
    const body = { model: 'gpt-6.1-sol', messages: [{ role: 'user', content: 'batch item' }], max_tokens: 512 };
    const plain = await worker.fetch(request(body), env);
    assert.equal(plain.status, 200);
    assert.equal(called, 1);
    const batched = new Request('https://ltzzz-relay-proxy.example.workers.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ltzzz-seat-token': 'proxy-token', 'x-ltzzz-batch': '1' },
      body: JSON.stringify(body),
    });
    const response = await worker.fetch(batched, env);
    assert.equal(response.status, 200);
    assert.equal(called, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('proxy prices match the seat policy allowlist and per-call cap', () => {
  const policy = JSON.parse(fs.readFileSync('config/relay-seat-policy.json', 'utf8'));
  assert.equal(policy.cost_guard.per_call_cost_cap_usd, MAX_CALL_COST_USD);
  for (const entry of policy.routing.allowlist) {
    assert.deepEqual(MODEL_PRICES[entry.model], {
      input: entry.price_input_usd_per_1m,
      output: entry.price_output_usd_per_1m,
      hiddenInputTokens: entry.known_input_inflation_tokens || 0,
    }, entry.model);
  }
});

test('proxy refuses a worst-case call above the per-call cap without an upstream request', () => {
  const atCap = validateRequest({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: longText }], max_tokens: 4797 });
  assert.equal(atCap.ok, true);
  assert.equal(atCap.worst_case_cost_usd, 0.049995);

  const over = validateRequest({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: longText }], max_tokens: 4798 });
  assert.equal(over.ok, false);
  assert.equal(over.code, 'proxy_per_call_cost_cap_exceeded');
  assert.equal(over.status, 403);
  assert.ok(over.worst_case_cost_usd > MAX_CALL_COST_USD);
});

test('proxy refuses an unbounded max_tokens because the call cost cannot be capped', () => {
  const verdict = validateRequest({ model: 'claude-opus-5-5', messages: [{ role: 'user', content: longText }] });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'proxy_max_tokens_required_for_cost_cap');
});

test('budget ledger refuses every call until a confirmed balance exists', async () => {
  const env = { PROXY_ACCESS_TOKEN: 'proxy-token', RELAY_STATION_KEY: 'station-key', BUDGET: budgetEnv({}, {}).binding };
  const response = await worker.fetch(request({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: longText }], max_tokens: 512 }), env);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, 'proxy_budget_refused_relay_balance_unverified');
});

test('gateway fails closed when the budget binding is missing', async () => {
  const env = { PROXY_ACCESS_TOKEN: 'proxy-token', RELAY_STATION_KEY: 'station-key' };
  const response = await worker.fetch(request({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: longText }], max_tokens: 512 }), env);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, 'proxy_budget_refused_relay_budget_binding_missing');
});

test('budget enforces the daily cap and allows a call exactly at the cap', async () => {
  const { instance } = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '100' });
  for (let index = 0; index < 10; index += 1) {
    const result = await budgetCall(instance, '/reserve', { call_id: 'daily-' + index, model: 'gpt-6.1-sol', estimated_cost_usd: MAX_CALL_COST_USD });
    assert.equal(result.ok, true, 'reservation ' + index);
  }
  const over = await budgetCall(instance, '/reserve', { call_id: 'daily-over', model: 'gpt-6.1-sol', estimated_cost_usd: MAX_CALL_COST_USD });
  assert.equal(over.ok, false);
  assert.equal(over.code, 'relay_daily_cap_exceeded');
  assert.equal(over.status, 429);
  assert.equal(over.snapshot.daily_spent_usd + over.snapshot.daily_reserved_usd, DAILY_COST_CAP_USD);
});

test('budget enforces the project lifetime cap across days', async () => {
  const { instance } = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '100' });
  let call = 0;
  for (let day = 1; day <= 20; day += 1) {
    const at = '2026-01-' + String(day).padStart(2, '0') + 'T00:00:00.000Z';
    for (let index = 0; index < 10; index += 1) {
      const result = await budgetCall(instance, '/reserve', { call_id: 'project-' + call, model: 'gpt-6.1-sol', estimated_cost_usd: MAX_CALL_COST_USD, at });
      assert.equal(result.ok, true, 'reservation ' + call);
      call += 1;
    }
  }
  const over = await budgetCall(instance, '/reserve', { call_id: 'project-over', model: 'gpt-6.1-sol', estimated_cost_usd: MAX_CALL_COST_USD, at: '2026-01-21T00:00:00.000Z' });
  assert.equal(over.ok, false);
  assert.equal(over.code, 'relay_project_cap_exceeded');
  assert.equal(over.snapshot.project_spent_usd, PROJECT_COST_CAP_USD);
});

test('budget refuses to reserve across the balance floor and closes the seat', async () => {
  const { instance } = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '3.04' });
  const reserved = await budgetCall(instance, '/reserve', { call_id: 'floor-1', model: 'gpt-6.1-sol', estimated_cost_usd: MAX_CALL_COST_USD });
  assert.equal(reserved.ok, false);
  assert.equal(reserved.code, 'relay_balance_below_floor');
  const state = await budgetCall(instance, '/state');
  assert.equal(state.baseline_usd, 3.04);
  assert.equal(state.closed, false);

  const closed = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '2.99' });
  const refused = await budgetCall(closed.instance, '/reserve', { call_id: 'floor-2', model: 'gpt-6.1-sol', estimated_cost_usd: MAX_CALL_COST_USD });
  assert.equal(refused.code, 'relay_balance_below_floor');
  const closedState = await budgetCall(closed.instance, '/state');
  assert.equal(closedState.closed, true);
  assert.equal(closedState.closed_reason, 'balance_below_floor');
});

test('an expired reservation is charged at its worst-case estimate, never forgotten', async () => {
  const { instance } = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '100' });
  const first = await budgetCall(instance, '/reserve', { call_id: 'expired-1', model: 'gpt-6.1-sol', estimated_cost_usd: 0.04, at: '2026-02-01T00:00:00.000Z' });
  assert.equal(first.ok, true);
  const later = await budgetCall(instance, '/reserve', { call_id: 'expired-2', model: 'gpt-6.1-sol', estimated_cost_usd: 0.04, at: '2026-02-01T00:20:00.000Z' });
  assert.equal(later.ok, true);
  assert.equal(later.snapshot.project_spent_usd, 0.04);
  assert.equal(later.snapshot.project_reserved_usd, 0.04);
});

test('settlement is idempotent and records the observed actual cost', async () => {
  const { instance } = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '100' });
  await budgetCall(instance, '/reserve', { call_id: 'settle-1', model: 'gpt-6.1-sol', estimated_cost_usd: MAX_CALL_COST_USD });
  const first = await budgetCall(instance, '/settle', { call_id: 'settle-1', actual_cost_usd: 0.01, prompt_tokens: 5000, completion_tokens: 100 });
  assert.equal(first.ok, true);
  assert.equal(first.cost_usd, 0.01);
  assert.equal(first.snapshot.project_spent_usd, 0.01);
  const second = await budgetCall(instance, '/settle', { call_id: 'settle-1', actual_cost_usd: 0.049 });
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(second.snapshot.project_spent_usd, 0.01);
});

test('a console confirmation resets the baseline and keeps prior spend as history', async () => {
  const { instance, state } = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '100' });
  await budgetCall(instance, '/reserve', { call_id: 'confirm-1', model: 'gpt-6.1-sol', estimated_cost_usd: MAX_CALL_COST_USD });
  await budgetCall(instance, '/settle', { call_id: 'confirm-1', actual_cost_usd: 0.02 });
  const confirmed = await budgetCall(instance, '/confirm', { balance_usd: 90.5, confirmed_by: 'owner_console_read', basis: 'console dashboard 2026-02-02' });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.snapshot.baseline_usd, 90.5);
  assert.equal(confirmed.snapshot.project_spent_usd, 0);
  const stored = state.storage.map.get('budget');
  assert.equal(stored.entries.length, 0);
  assert.equal(stored.prior_periods.length, 1);
  assert.equal(stored.prior_periods[0].recorded_cost_usd, 0.02);
});

test('gateway reserves before egress and returns cost and balance headers', async () => {
  const budget = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '100' });
  const env = { PROXY_ACCESS_TOKEN: 'proxy-token', RELAY_STATION_KEY: 'station-key', BUDGET: budget.binding };
  const realFetch = globalThis.fetch;
  let activeDuringUpstream = null;
  globalThis.fetch = async () => {
    activeDuringUpstream = await budgetCall(budget.instance, '/state');
    return Response.json({
      id: 'req-budget-1',
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 6000, completion_tokens: 100 },
    });
  };
  try {
    const response = await worker.fetch(request({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: longText }], max_tokens: 512 }), env);
    assert.equal(response.status, 200);
    assert.equal(activeDuringUpstream.active_reservations, 1);
    assert.equal(response.headers.get('x-ltzzz-budget-settled'), '1');
    const cost = Number(response.headers.get('x-ltzzz-cost-usd'));
    assert.ok(cost > 0 && cost <= MAX_CALL_COST_USD);
    const balance = Number(response.headers.get('x-ltzzz-balance-after-usd'));
    assert.ok(balance > 100 - MAX_CALL_COST_USD && balance < 100);
    assert.ok(response.headers.get('x-ltzzz-budget-reservation'));
    const state = await budgetCall(budget.instance, '/state');
    assert.equal(state.active_reservations, 0);
    assert.equal(state.project_spent_usd, cost);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('gateway charges the worst case when the upstream connection fails', async () => {
  const budget = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '100' });
  const env = { PROXY_ACCESS_TOKEN: 'proxy-token', RELAY_STATION_KEY: 'station-key', BUDGET: budget.binding };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network down'); };
  try {
    const response = await worker.fetch(request({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: longText }], max_tokens: 512 }), env);
    assert.equal(response.status, 504);
    assert.ok(Number(response.headers.get('x-ltzzz-cost-usd')) > 0);
    const state = await budgetCall(budget.instance, '/state');
    assert.equal(state.active_reservations, 0);
    assert.ok(state.project_spent_usd > 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('unverified callers cannot confirm a new balance', async () => {
  const { instance } = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '100' });
  const response = await instance.fetch(new Request('https://relay-budget.internal/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ balance_usd: 1000, confirmed_by: 'self', basis: 'self' }),
  }));
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.snapshot.baseline_usd, 1000);
  const gateway = await worker.fetch(new Request('https://ltzzz-relay-proxy.example.workers.dev/v1/budget/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ balance_usd: 1000, confirmed_by: 'self', basis: 'self' }),
  }), { PROXY_ACCESS_TOKEN: 'proxy-token', BUDGET: { idFromName: () => 'x', get: () => ({ fetch: r => instance.fetch(r) }) } });
  assert.equal(gateway.status, 401);
});
