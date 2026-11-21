import test from 'node:test';
import assert from 'node:assert/strict';
import {closeAndVerify} from '../relay-budget-close.mjs';

const promptText = 'a'.repeat(16384);
const baseUrl = 'https://relay.example/v1';
const token = 'test-only-token';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
  });
}

function fakeFetch({initialClosed = false, closeNetworkUnknown = false, syntheticCode = 'proxy_budget_refused_relay_seat_closed', stateAvailable = true} = {}) {
  const calls = [];
  const state = {
    ok: true,
    closed: initialClosed,
    closed_reason: initialClosed ? 'prior_close' : null,
    active_reservations: 0,
    daily_spent_usd: 0,
    project_spent_usd: 0,
  };
  const fetchImpl = async (url, init = {}) => {
    const pathname = new URL(url).pathname;
    calls.push({pathname, method: init.method || 'GET'});
    assert.equal(new Headers(init.headers).get('x-ltzzz-seat-token'), token);
    if (pathname.endsWith('/budget/state')) {
      return stateAvailable ? json(200, state) : json(503, {ok: false, error: 'unavailable'});
    }
    if (pathname.endsWith('/budget/close')) {
      state.closed = true;
      state.closed_reason = 'gpt_decision_hold_pending_balance_reconciliation';
      if (closeNetworkUnknown) throw new Error('simulated_timeout_after_write');
      return json(200, {ok: true, status: 200, duplicate: false, snapshot: {...state}});
    }
    if (pathname.endsWith('/chat/completions')) {
      return json(403, {error: {code: syntheticCode}});
    }
    throw new Error('unexpected_route');
  };
  return {fetchImpl, calls, state};
}

test('closes an open seat and proves the next synthetic reservation is refused before upstream', async () => {
  const mock = fakeFetch();
  const result = await closeAndVerify({
    fetchImpl: mock.fetchImpl,
    baseUrl,
    token,
    promptText,
    at: '2026-11-21T20:00:00.000Z',
    runId: '100',
    runAttempt: '1',
    sourceCommit: 'abc123',
  });
  assert.equal(result.verified, true);
  assert.equal(result.status, 'closed_verified');
  assert.equal(result.state_after_close.closed, true);
  assert.equal(result.synthetic_reserve_probe.error_code, 'proxy_budget_refused_relay_seat_closed');
  assert.equal(result.state_after_probe.active_reservations, 0);
  assert.deepEqual(mock.calls.map(x => x.pathname), [
    '/v1/budget/state',
    '/v1/budget/close',
    '/v1/budget/state',
    '/v1/chat/completions',
    '/v1/budget/state',
  ]);
});

test('an already closed seat is verified without issuing another close write', async () => {
  const mock = fakeFetch({initialClosed: true});
  const result = await closeAndVerify({fetchImpl: mock.fetchImpl, baseUrl, token, promptText});
  assert.equal(result.verified, true);
  assert.deepEqual(mock.calls.map(x => x.pathname), [
    '/v1/budget/state',
    '/v1/budget/state',
    '/v1/chat/completions',
    '/v1/budget/state',
  ]);
});

test('a close response timeout is not retried; authoritative readback decides the result', async () => {
  const mock = fakeFetch({closeNetworkUnknown: true});
  const result = await closeAndVerify({fetchImpl: mock.fetchImpl, baseUrl, token, promptText});
  assert.equal(result.verified, true);
  assert.equal(mock.calls.filter(x => x.pathname.endsWith('/budget/close')).length, 1);
});

test('unknown initial state blocks without attempting a close or synthetic request', async () => {
  const mock = fakeFetch({stateAvailable: false});
  const result = await closeAndVerify({fetchImpl: mock.fetchImpl, baseUrl, token, promptText});
  assert.equal(result.verified, false);
  assert.equal(result.error, 'runtime_budget_state_unavailable');
  assert.equal(mock.calls.some(x => x.pathname.endsWith('/budget/close')), false);
  assert.equal(mock.calls.some(x => x.pathname.endsWith('/chat/completions')), false);
});

test('a response other than the closed-seat refusal is not accepted as a successful probe', async () => {
  const mock = fakeFetch({syntheticCode: 'proxy_short_request_forbidden'});
  const result = await closeAndVerify({fetchImpl: mock.fetchImpl, baseUrl, token, promptText});
  assert.equal(result.verified, false);
  assert.equal(result.status, 'blocked_evidence');
});
