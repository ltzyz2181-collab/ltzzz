import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  estimateInputTokens,
  evaluateRelayCall,
  costUsd,
  billedPromptTokens,
  deriveBalance,
  appendSpend,
  setConfirmedBalance,
  closeRelaySeat,
  openRelaySeat,
  readSeatState,
  seatStatusOf,
  buildReplyRecord,
} from '../lib/relay-seat-guard.mjs';

const policy = {
  policy_id: 'TEST-POLICY',
  station: { key_env: 'TEST_KEY', local_key_file: 'nokey.txt' },
  balance_guard: {
    floor_usd: 3,
    ledger_path: 'knowledge/results/relay-seat/balance-ledger.json',
    state_path: 'knowledge/results/relay-seat/seat-state.json',
    reopen_requires: 'confirmed console balance at or above the floor',
  },
  routing: {
    min_input_tokens: 4096,
    allowlist: [
      { model: 'claude-opus-5-5', tier: 'claude', price_input_usd_per_1m: 3, price_output_usd_per_1m: 16 },
      { model: 'claude-haiku-5-5', tier: 'claude', price_input_usd_per_1m: 0.08, price_output_usd_per_1m: 0.4 },
      { model: 'gpt-6.1-sol', tier: 'gpt', price_input_usd_per_1m: 1.5, price_output_usd_per_1m: 8 },
    ],
  },
};

const cappedPolicy = {
  policy_id: 'TEST-POLICY-CAPPED',
  station: { key_env: 'TEST_KEY', local_key_file: 'nokey.txt' },
  balance_guard: {
    floor_usd: 3,
    ledger_path: 'knowledge/results/relay-seat/balance-ledger.json',
    state_path: 'knowledge/results/relay-seat/seat-state.json',
    reopen_requires: 'confirmed console balance at or above the floor',
  },
  routing: {
    min_input_tokens: 4096,
    allowlist: [
      { model: 'capped-model', tier: 'test', price_input_usd_per_1m: 10, price_output_usd_per_1m: 10 },
    ],
  },
  cost_guard: {
    per_call_cost_cap_usd: 0.05,
    daily_cost_cap_usd: 0.5,
    project_cost_cap_usd: 10,
    cap_status: 'test',
  },
};

const NOW = '2026-11-17T12:00:00.000Z';

function cappedCall(overrides = {}) {
  return evaluateRelayCall({
    policy: cappedPolicy,
    model: 'capped-model',
    inputTokens: 4096,
    maxCompletionTokens: 904,
    balanceUsd: 12,
    seatStatus: 'open',
    now: NOW,
    ledger: { baseline: { balance_usd: 12 }, entries: [] },
    ...overrides,
  });
}

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-relay-seat-'));
  fs.mkdirSync(path.join(root, 'knowledge/results/relay-seat'), { recursive: true });
  return root;
}

function seedLedger(root, balance, entries = []) {
  fs.writeFileSync(
    path.join(root, policy.balance_guard.ledger_path),
    JSON.stringify({ baseline: { balance_usd: balance, confirmed_at: 'fixture' }, entries }),
  );
}

test('only allowlisted Claude tiers and gpt-6.1-sol are routed to the station', () => {
  for (const model of ['claude-opus-5-5', 'claude-haiku-5-5', 'gpt-6.1-sol']) {
    const decision = evaluateRelayCall({ policy, model, inputTokens: 9000, balanceUsd: 12, seatStatus: 'open' });
    assert.equal(decision.allowed, true, model + ' should be allowed');
  }
  for (const model of ['gpt-6-sol', 'gpt-5.6-sol', 'claude-sonnet-5', 'gpt-6-astra', 'unknown-model']) {
    const decision = evaluateRelayCall({ policy, model, inputTokens: 9000, balanceUsd: 12, seatStatus: 'open' });
    assert.equal(decision.allowed, false, model + ' must be denied');
    assert.equal(decision.code, 'relay_model_not_allowlisted');
    assert.equal(decision.sent_http_request, false);
  }
});

test('short requests are refused before any HTTP request', () => {
  const decision = evaluateRelayCall({ policy, model: 'gpt-6.1-sol', inputTokens: 17, balanceUsd: 12, seatStatus: 'open' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'relay_short_request_forbidden');
  assert.equal(decision.sent_http_request, false);
  assert.equal(decision.requires_close, false);
});

test('a declared batch may go below the token floor and records the route reason', () => {
  const decision = evaluateRelayCall({ policy, model: 'claude-opus-5-5', inputTokens: 20, batch: true, balanceUsd: 12, seatStatus: 'open' });
  assert.equal(decision.allowed, true);
  assert.equal(decision.routing_reason, 'batch');
  assert.equal(decision.sent_http_request, true);
});

test('long-context requests above the floor are allowed', () => {
  const decision = evaluateRelayCall({ policy, model: 'claude-opus-5-5', inputTokens: 4096, balanceUsd: 12, seatStatus: 'open' });
  assert.equal(decision.allowed, true);
  assert.equal(decision.routing_reason, 'long_context');
  assert.equal(evaluateRelayCall({ policy, model: 'claude-opus-5-5', inputTokens: 4095, balanceUsd: 12, seatStatus: 'open' }).code, 'relay_short_request_forbidden');
});

test('closed and unreadable seat states fail closed', () => {
  const closed = evaluateRelayCall({ policy, model: 'claude-opus-5-5', inputTokens: 9000, balanceUsd: 12, seatStatus: 'closed' });
  assert.equal(closed.code, 'relay_seat_closed');
  const unknown = evaluateRelayCall({ policy, model: 'claude-opus-5-5', inputTokens: 9000, balanceUsd: 12, seatStatus: 'unknown' });
  assert.equal(unknown.code, 'relay_seat_state_unverified');
  assert.equal(unknown.sent_http_request, false);
});

test('unverified balance refuses instead of assuming money', () => {
  const decision = evaluateRelayCall({ policy, model: 'claude-opus-5-5', inputTokens: 9000, balanceUsd: null, seatStatus: 'open' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'relay_balance_unverified');
});

test('balance below the 3 USD floor requests a close, and the close persists', () => {
  const root = sandbox();
  seedLedger(root, 3, [{ at: 'fixture', model: 'x', cost_usd: 0.25 }]);
  const balance = deriveBalance({ baseline: { balance_usd: 3 }, entries: [{ cost_usd: 0.25 }] });
  assert.equal(balance, 2.75);
  const decision = evaluateRelayCall({ policy, model: 'claude-opus-5-5', inputTokens: 9000, balanceUsd: balance, seatStatus: 'open' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'relay_balance_below_floor');
  assert.equal(decision.requires_close, true);
  const state = closeRelaySeat(root, policy, { balanceUsd: balance, reason: decision.code, detail: decision.detail });
  assert.equal(state.status, 'closed');
  const after = evaluateRelayCall({ policy, model: 'claude-opus-5-5', inputTokens: 9000, balanceUsd: balance, seatStatus: seatStatusOf(readSeatState(root, policy)) });
  assert.equal(after.code, 'relay_seat_closed');
  assert.equal(after.sent_http_request, false);
  fs.rmSync(root, { recursive: true });
});

test('costs follow the station per-million price and the ledger subtracts them', () => {
  assert.equal(costUsd(policy, 'gpt-6.1-sol', 1446, 5), 0.002209);
  assert.equal(costUsd(policy, 'claude-opus-5-5', 5000, 100), 0.0166);
  assert.equal(costUsd(policy, 'claude-haiku-5-5', 4096, 0), 0.000328);
  assert.equal(costUsd(policy, 'gpt-6-sol', 1446, 5), null);
  const root = sandbox();
  seedLedger(root, 13, []);
  const recorded = appendSpend(root, policy, { model: 'claude-opus-5-5', cost: 0.0166, promptTokens: 5000, completionTokens: 100 });
  assert.equal(recorded.balance_usd, 12.9834);
  const second = appendSpend(root, policy, { model: 'gpt-6.1-sol', cost: 0.002209, promptTokens: 1446, completionTokens: 5 });
  assert.equal(second.balance_usd, 12.981191);
  fs.rmSync(root, { recursive: true });
});

test('a confirmed console balance replaces earlier deductions and can reopen the seat', () => {
  const root = sandbox();
  seedLedger(root, 2.5, [{ cost_usd: 0.5 }]);
  const rolled = setConfirmedBalance(root, policy, { balanceUsd: 10, actor: 'owner', basis: 'console dashboard' });
  assert.equal(rolled.balance_usd, 10);
  assert.equal(rolled.ledger.entries.length, 0);
  assert.equal(rolled.ledger.prior_periods.length, 1);
  assert.equal(rolled.ledger.prior_periods[0].recorded_cost_usd, 0.5);
  const opened = openRelaySeat(root, policy, { balanceUsd: 10, actor: 'owner', basis: 'console dashboard' });
  assert.equal(opened.status, 'open');
  assert.equal(opened.closed_at, null);
  assert.throws(() => openRelaySeat(root, policy, { balanceUsd: 2.99, actor: 'owner', basis: 'console dashboard' }), /relay_seat_reopen_balance_below_floor/);
  assert.throws(() => openRelaySeat(root, policy, { balanceUsd: 10, actor: '', basis: 'console' }), /relay_seat_reopen_requires_actor_and_basis/);
  fs.rmSync(root, { recursive: true });
});

test('a zero prompt_tokens report bills at the estimated input floor', () => {
  assert.equal(billedPromptTokens(0, 8589), 8589);
  assert.equal(billedPromptTokens(null, 5000), 5000);
  assert.equal(billedPromptTokens(1446, 900), 1446);
  assert.equal(costUsd(policy, 'claude-opus-5-5', billedPromptTokens(0, 8589), 252), 0.029799);
});

test('input token estimation covers CJK and ASCII without undercounting short prompts', () => {
  assert.equal(estimateInputTokens('abcd'), 1);
  assert.equal(estimateInputTokens('中'), 1);
  assert.equal(estimateInputTokens('中文四个'), 4);
  assert.ok(estimateInputTokens('a'.repeat(4000)) === 1000);
  assert.equal(estimateInputTokens(''), 0);
});

test('a per-call estimate equal to the cap is allowed and one unit above is refused before HTTP', () => {
  const allowed = cappedCall();
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.cost_guard.estimated_call_cost_usd, 0.05);
  assert.equal(allowed.cost_guard.per_call_cost_cap_usd, 0.05);

  const refused = cappedCall({ maxCompletionTokens: 905 });
  assert.equal(refused.allowed, false);
  assert.equal(refused.code, 'relay_per_call_cap_exceeded');
  assert.equal(refused.sent_http_request, false);
  assert.equal(refused.cost_guard.estimated_call_cost_usd, 0.05001);
});

test('the daily cap sums only the same UTC day and refuses the crossing call', () => {
  const allowed = cappedCall({ ledger: { baseline: { balance_usd: 12 }, entries: [{ at: '2026-11-17T00:00:00.000Z', cost_usd: 0.45 }] } });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.cost_guard.daily_spent_usd, 0.45);

  const refused = cappedCall({ ledger: { baseline: { balance_usd: 12 }, entries: [{ at: '2026-11-17T00:00:00.000Z', cost_usd: 0.450001 }] } });
  assert.equal(refused.allowed, false);
  assert.equal(refused.code, 'relay_daily_cap_exceeded');
  assert.equal(refused.sent_http_request, false);

  const yesterday = cappedCall({ ledger: { baseline: { balance_usd: 12 }, entries: [{ at: '2026-11-16T23:59:00.000Z', cost_usd: 0.45 }] } });
  assert.equal(yesterday.allowed, true);
  assert.equal(yesterday.cost_guard.daily_spent_usd, 0);
});

test('the project cap includes rolled prior periods and refuses over the lifetime cap', () => {
  const allowed = cappedCall({ ledger: { baseline: { balance_usd: 12 }, entries: [], prior_periods: [{ recorded_cost_usd: 9.95 }] } });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.cost_guard.project_spent_usd, 9.95);

  const refused = cappedCall({ ledger: { baseline: { balance_usd: 12 }, entries: [], prior_periods: [{ recorded_cost_usd: 9.950001 }] } });
  assert.equal(refused.allowed, false);
  assert.equal(refused.code, 'relay_project_cap_exceeded');
  assert.equal(refused.sent_http_request, false);
});

test('cost caps fail closed when the ledger is missing, unpriced, or the output bound is absent', () => {
  const noLedger = cappedCall({ ledger: null });
  assert.equal(noLedger.code, 'relay_cost_ledger_unverified');
  assert.equal(noLedger.sent_http_request, false);

  const unpriced = cappedCall({ ledger: { baseline: { balance_usd: 12 }, entries: [{ at: NOW }] } });
  assert.equal(unpriced.allowed, true);
  assert.equal(unpriced.cost_guard.unpriced_entry_count, 1);
  assert.equal(unpriced.cost_guard.unknown_reserve_usd, 0.05);

  const noPerCallCap = { ...cappedPolicy, cost_guard: { ...cappedPolicy.cost_guard, per_call_cost_cap_usd: null } };
  const unbounded = cappedCall({ policy: noPerCallCap, ledger: { baseline: { balance_usd: 12 }, entries: [{ at: NOW }] } });
  assert.equal(unbounded.code, 'relay_cost_ledger_unpriced_entries');
  assert.equal(unbounded.sent_http_request, false);

  const noBound = cappedCall({ maxCompletionTokens: null });
  assert.equal(noBound.code, 'relay_cost_estimate_unavailable');
  assert.equal(noBound.sent_http_request, false);
});

test('an unpriced legacy entry reserves the per-call cap and can still cross the daily cap', () => {
  const ledger = {
    baseline: { balance_usd: 12 },
    entries: [{ at: '2026-11-17T01:00:00.000Z', cost_usd: 0.41 }, { at: '2026-11-17T02:00:00.000Z', cost_usd: null }],
  };
  const decision = cappedCall({ ledger });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'relay_daily_cap_exceeded');
  assert.equal(decision.cost_guard.daily_spent_usd, 0.41);
  assert.equal(decision.cost_guard.daily_reserve_usd, 0.05);
  assert.equal(decision.sent_http_request, false);
});

test('an uncapped policy is unchanged: no ledger or output bound is required', () => {
  const decision = evaluateRelayCall({ policy, model: 'claude-opus-5-5', inputTokens: 4096, balanceUsd: 12, seatStatus: 'open' });
  assert.equal(decision.allowed, true);
  assert.equal(decision.cost_guard.enforced, false);
});

test('buildReplyRecord preserves the complete model reply', () => {
  const text = '{"files":[{"path":"docs/a.md","content":"' + 'x'.repeat(12000) + '"}]}';
  const reply = buildReplyRecord(text);
  assert.equal(reply.chars, text.length);
  assert.equal(reply.text, text);
  assert.equal(reply.preview.length, 160);
});
