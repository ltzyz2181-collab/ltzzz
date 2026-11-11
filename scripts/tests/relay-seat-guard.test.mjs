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
