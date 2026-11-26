import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker, { ALLOWED_MODELS, BALANCE_FLOOR_USD, BUDGET_SCHEMA, DAILY_COST_CAP_USD, MODEL_PRICES, MAX_CALL_COST_USD, MIN_INPUT_TOKENS, PROJECT_COST_CAP_USD, RelayBudget, authorized, estimateTokens, validateRequest } from '../../workers/relay-proxy/worker.mjs';
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

test('owner 2026-11-23: budget allows a call without a confirmed balance', async () => {
  const { instance } = budgetEnv({}, {});
  const reserved = await budgetCall(instance, '/reserve', { call_id: 'no-balance-1', model: 'gpt-6.1-sol', estimated_cost_usd: MAX_CALL_COST_USD });
  assert.equal(reserved.ok, true);
  assert.equal(reserved.snapshot.baseline_usd, null);
  assert.equal(reserved.snapshot.closed, false);
  assert.equal(reserved.snapshot.limits.balance_floor_enabled, false);
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

test('owner 2026-11-23: a low or zero balance does not block reservation or close the seat', async () => {
  for (const balance of ['3.04', '2.99', '0']) {
    const { instance } = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: balance });
    const reserved = await budgetCall(instance, '/reserve', { call_id: 'floor-' + balance, model: 'gpt-6.1-sol', estimated_cost_usd: MAX_CALL_COST_USD });
    assert.equal(reserved.ok, true, 'balance ' + balance);
    const state = await budgetCall(instance, '/state');
    assert.equal(state.baseline_usd, Number(balance));
    assert.equal(state.closed, false);
  }
});

test('an explicitly closed seat is still refused', async () => {
  const { instance } = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '100' });
  const closed = await budgetCall(instance, '/close', { reason: 'operator_stop', closed_by: 'test_operator' });
  assert.equal(closed.snapshot.closed, true);
  const refused = await budgetCall(instance, '/reserve', { call_id: 'after-close-1', model: 'gpt-6.1-sol', estimated_cost_usd: MAX_CALL_COST_USD });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'relay_seat_closed');
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
  assert.equal(confirmed.snapshot.project_spent_usd, 0.02);
  assert.equal(confirmed.snapshot.balance_usd, 90.5);
  assert.equal(confirmed.snapshot.daily_spent_usd, 0);
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

// Seed the ledger with already-settled spend so the post-call reconciliation can
// be tested without running hundreds of reservations first.
function spendEntry({ at, callId, cost }) {
  return {
    at,
    call_id: callId,
    model: 'gpt-6.1-sol',
    task_id: null,
    estimated_cost_usd: MAX_CALL_COST_USD,
    cost_usd: cost,
    prompt_tokens: null,
    completion_tokens: null,
    upstream_http: 200,
    request_id: null,
    outcome: 'completed',
    settled_at: at,
  };
}

function seededBudget(entries, vars = { RELAY_CONFIRMED_BALANCE_USD: '100' }) {
  const { instance, state } = budgetEnv({}, vars);
  state.storage.map.set('budget', {
    schema: BUDGET_SCHEMA,
    currency: 'USD',
    baseline: { balance_usd: Number(vars.RELAY_CONFIRMED_BALANCE_USD), confirmed_at: null, confirmed_by: 'test_seed', source: 'test_seed' },
    entries,
    reservations: {},
    prior_periods: [],
    closed: false,
    closed_reason: null,
    updated_at: null,
  });
  return { instance, state };
}

test('project lifetime cap includes archived spend after a balance confirmation', async () => {
  const entries = [];
  for (let day = 1; day <= 20; day += 1) {
    entries.push(spendEntry({
      at: '2026-04-' + String(day).padStart(2, '0') + 'T00:00:00.000Z',
      callId: 'archive-' + day,
      cost: 0.499,
    }));
  }
  const { instance, state } = seededBudget(entries);
  const confirmed = await budgetCall(instance, '/confirm', {
    balance_usd: 100,
    confirmed_by: 'owner_console_read',
    basis: 'verified current balance readback',
    at: '2026-04-21T00:00:00.000Z',
  });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.snapshot.project_spent_usd, 9.98);
  assert.equal(confirmed.snapshot.balance_usd, 100);
  assert.equal(confirmed.snapshot.daily_spent_usd, 0);

  const over = await budgetCall(instance, '/reserve', {
    call_id: 'archive-cap-over',
    model: 'gpt-6.1-sol',
    estimated_cost_usd: 0.05,
    at: '2026-04-21T00:00:01.000Z',
  });
  assert.equal(over.ok, false);
  assert.equal(over.code, 'relay_project_cap_exceeded');
  assert.equal(over.snapshot.project_spent_usd, 9.98);
  assert.equal(state.storage.map.get('budget').prior_periods.length, 1);
});

test('confirmation archives prior spend even when the previous balance was unverified', async () => {
  const { instance, state } = budgetEnv({}, {});
  state.storage.map.set('budget', {
    schema: BUDGET_SCHEMA,
    currency: 'USD',
    baseline: null,
    entries: [spendEntry({ at: '2026-05-01T00:00:00.000Z', callId: 'unknown-balance-1', cost: 0.02 })],
    reservations: {},
    prior_periods: [],
    closed: false,
    closed_reason: null,
    updated_at: null,
  });
  const confirmed = await budgetCall(instance, '/confirm', {
    balance_usd: 10,
    confirmed_by: 'owner',
    basis: 'owner top-up instruction',
    at: '2026-05-02T00:00:00.000Z',
  });
  assert.equal(confirmed.snapshot.project_spent_usd, 0.02);
  assert.equal(confirmed.snapshot.balance_usd, 10);
  assert.equal(state.storage.map.get('budget').prior_periods.length, 1);
});

test('project spend history is not truncated after 24 confirmations', async () => {
  const { instance, state } = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '100' });
  state.storage.map.set('budget', {
    schema: BUDGET_SCHEMA,
    currency: 'USD',
    baseline: { balance_usd: 100, confirmed_at: null, confirmed_by: 'test_seed', source: 'test_seed' },
    entries: [],
    reservations: {},
    prior_periods: Array.from({ length: 24 }, (_, index) => ({
      baseline_usd: 100,
      entries: 1,
      recorded_cost_usd: 0.01,
      closed_at: '2026-01-' + String(index + 1).padStart(2, '0') + 'T00:00:00.000Z',
    })),
    closed: false,
    closed_reason: null,
    updated_at: null,
  });
  const confirmed = await budgetCall(instance, '/confirm', {
    balance_usd: 100,
    confirmed_by: 'owner',
    basis: 'verified current balance readback',
    at: '2026-02-01T00:00:00.000Z',
  });
  assert.equal(state.storage.map.get('budget').prior_periods.length, 25);
  assert.equal(confirmed.snapshot.project_spent_usd, 0.24);
});

test('a settled call above the per-call cap closes the seat before the next reservation', async () => {
  const { instance } = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '100' });
  const reserved = await budgetCall(instance, '/reserve', {
    call_id: 'overrun-1', model: 'gpt-6.1-sol', estimated_cost_usd: 0.04, at: '2026-03-01T00:00:00.000Z',
  });
  assert.equal(reserved.ok, true);
  const settled = await budgetCall(instance, '/settle', {
    call_id: 'overrun-1', actual_cost_usd: 0.064951, at: '2026-03-01T00:01:00.000Z',
  });
  assert.equal(settled.ok, true);
  assert.equal(settled.cost_usd, 0.064951);
  assert.equal(settled.snapshot.closed, true);
  assert.equal(settled.snapshot.closed_reason, 'per_call_cap_breach_after_call');
  assert.equal(settled.snapshot.last_overrun.reason, 'per_call_cap_breach_after_call');
  assert.equal(settled.snapshot.last_overrun.cap_usd, MAX_CALL_COST_USD);
  assert.equal(settled.snapshot.last_overrun.cost_usd, 0.064951);
  assert.equal(settled.snapshot.last_overrun.call_id, 'overrun-1');

  const next = await budgetCall(instance, '/reserve', {
    call_id: 'overrun-2', model: 'gpt-6.1-sol', estimated_cost_usd: 0.01, at: '2026-03-01T00:02:00.000Z',
  });
  assert.equal(next.ok, false);
  assert.equal(next.status, 403);
  assert.equal(next.code, 'relay_seat_closed');
  assert.equal(next.detail, 'per_call_cap_breach_after_call');
});

test('a settled call that pushes the day over its cap closes the seat', async () => {
  const at = '2026-03-02T00:00:00.000Z';
  const { instance } = seededBudget([spendEntry({ at, callId: 'seed-day-1', cost: 0.47 })]);
  const reserved = await budgetCall(instance, '/reserve', {
    call_id: 'day-post-1', model: 'gpt-6.1-sol', estimated_cost_usd: 0.02, at,
  });
  assert.equal(reserved.ok, true);
  const settled = await budgetCall(instance, '/settle', {
    call_id: 'day-post-1', actual_cost_usd: 0.04, at: '2026-03-02T00:05:00.000Z',
  });
  assert.equal(settled.ok, true);
  assert.equal(settled.snapshot.closed, true);
  assert.equal(settled.snapshot.closed_reason, 'daily_cap_breach_after_call');
  assert.equal(settled.snapshot.last_overrun.daily_spent_usd, 0.51);
  assert.equal(settled.snapshot.last_overrun.cap_usd, DAILY_COST_CAP_USD);

  const next = await budgetCall(instance, '/reserve', {
    call_id: 'day-post-2', model: 'gpt-6.1-sol', estimated_cost_usd: 0.01, at: '2026-03-02T00:06:00.000Z',
  });
  assert.equal(next.code, 'relay_seat_closed');
});

test('a settled call that pushes lifetime spend over the project cap closes the seat', async () => {
  const entries = [];
  for (let day = 1; day <= 20; day += 1) {
    entries.push(spendEntry({ at: '2026-04-' + String(day).padStart(2, '0') + 'T00:00:00.000Z', callId: 'seed-project-' + day, cost: 0.499 }));
  }
  const { instance } = seededBudget(entries);
  const at = '2026-04-21T00:00:00.000Z';
  const reserved = await budgetCall(instance, '/reserve', {
    call_id: 'project-post-1', model: 'gpt-6.1-sol', estimated_cost_usd: 0.01, at,
  });
  assert.equal(reserved.ok, true);
  assert.equal(reserved.snapshot.project_spent_usd, 9.98);
  const settled = await budgetCall(instance, '/settle', {
    call_id: 'project-post-1', actual_cost_usd: 0.03, at: '2026-04-21T00:01:00.000Z',
  });
  assert.equal(settled.ok, true);
  assert.equal(settled.snapshot.project_spent_usd, 10.01);
  assert.equal(settled.snapshot.closed, true);
  assert.equal(settled.snapshot.closed_reason, 'project_cap_breach_after_call');
  assert.equal(settled.snapshot.last_overrun.cap_usd, PROJECT_COST_CAP_USD);
});

test('settlement without a provider cost charges the reserved worst case', async () => {
  const { instance } = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '100' });
  await budgetCall(instance, '/reserve', { call_id: 'no-actual-1', model: 'gpt-6.1-sol', estimated_cost_usd: 0.04 });
  const settled = await budgetCall(instance, '/settle', { call_id: 'no-actual-1' });
  assert.equal(settled.ok, true);
  assert.equal(settled.cost_usd, 0.04);
  assert.equal(settled.snapshot.closed, false);
});

test('the close endpoint stops the seat idempotently and keeps the first reason', async () => {
  const { instance } = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '100' });
  const first = await budgetCall(instance, '/close', { reason: 'operator_stop', closed_by: 'test_operator' });
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.snapshot.closed, true);
  assert.equal(first.snapshot.closed_reason, 'operator_stop');
  const second = await budgetCall(instance, '/close', { reason: 'a_different_reason' });
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(second.snapshot.closed_reason, 'operator_stop');
  const refused = await budgetCall(instance, '/reserve', { call_id: 'close-1', model: 'gpt-6.1-sol', estimated_cost_usd: 0.01 });
  assert.equal(refused.code, 'relay_seat_closed');
});

test('gateway exposes budget close to authenticated callers only', async () => {
  const budget = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '100' });
  const env = { PROXY_ACCESS_TOKEN: 'proxy-token', RELAY_STATION_KEY: 'station-key', BUDGET: budget.binding };
  const unauthenticated = await worker.fetch(new Request('https://ltzzz-relay-proxy.example.workers.dev/v1/budget/close', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'owner_stop' }),
  }), env);
  assert.equal(unauthenticated.status, 401);
  const response = await worker.fetch(request({ reason: 'owner_stop' }, { path: '/v1/budget/close' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.snapshot.closed, true);
  assert.equal(body.snapshot.closed_reason, 'owner_stop');
});

test('a response without provider-reported usage still settles at the worst-case estimate', async () => {
  const budget = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '100' });
  const env = { PROXY_ACCESS_TOKEN: 'proxy-token', RELAY_STATION_KEY: 'station-key', BUDGET: budget.binding };
  const realFetch = globalThis.fetch;
  // actual_provider is unavailable when the upstream omits usage; the call must
  // not be treated as free.
  globalThis.fetch = async () => Response.json({
    id: 'req-no-usage',
    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
  });
  try {
    const response = await worker.fetch(request({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: longText }], max_tokens: 512 }), env);
    assert.equal(response.status, 200);
    const cost = Number(response.headers.get('x-ltzzz-cost-usd'));
    assert.ok(cost > 0);
    const state = await budgetCall(budget.instance, '/state');
    assert.equal(state.project_spent_usd, cost);
    assert.equal(state.active_reservations, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a failed upstream is settled once as outcome-unknown and never replayed', async () => {
  const budget = budgetEnv({}, { RELAY_CONFIRMED_BALANCE_USD: '100' });
  const env = { PROXY_ACCESS_TOKEN: 'proxy-token', RELAY_STATION_KEY: 'station-key', BUDGET: budget.binding };
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('network down'); };
  try {
    const response = await worker.fetch(request({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: longText }], max_tokens: 512 }), env);
    assert.equal(response.status, 504);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls, 1, 'the unreachable upstream must be attempted exactly once');
  const stored = budget.state.storage.map.get('budget');
  assert.equal(stored.entries.length, 1);
  assert.equal(stored.entries[0].outcome, 'proxy_upstream_unreachable');
  assert.ok(stored.entries[0].cost_usd > 0, 'the unknown outcome is charged at the worst case');
  assert.equal(Object.keys(stored.reservations).length, 0);
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
