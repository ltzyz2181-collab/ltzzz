import fs from 'node:fs';
import path from 'node:path';

export const POLICY_PATH = 'config/relay-seat-policy.json';

export function loadPolicy(root = process.cwd()) {
  return JSON.parse(fs.readFileSync(path.join(root, POLICY_PATH), 'utf8'));
}

// Conservative estimator: CJK characters cost about one token each, other text about four characters per token.
export function estimateInputTokens(text) {
  const value = String(text ?? '');
  let cjk = 0;
  let other = 0;
  for (const ch of value) {
    if (/[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch)) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

export function findModel(policy, model) {
  return (policy?.routing?.allowlist || []).find((entry) => entry.model === model) || null;
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function deriveBalance(ledger) {
  const baseline = numberOrNull(ledger?.baseline?.balance_usd);
  if (baseline === null) return null;
  const entries = Array.isArray(ledger?.entries) ? ledger.entries : [];
  const spent = entries.reduce((sum, entry) => sum + (numberOrNull(entry?.cost_usd) || 0), 0);
  return Number((baseline - spent).toFixed(6));
}

// The station has been observed reporting prompt_tokens=0 for Claude calls.
// Billing must never fall below our own estimate, otherwise the balance drifts upward silently.
export function billedPromptTokens(reported, estimated) {
  const value = numberOrNull(reported);
  return value !== null && value > 0 ? value : numberOrNull(estimated) || 0;
}

export function costUsd(policy, model, promptTokens, completionTokens) {
  const entry = findModel(policy, model);
  if (!entry) return null;
  const prompt = numberOrNull(promptTokens) || 0;
  const completion = numberOrNull(completionTokens) || 0;
  return Number(
    ((prompt * entry.price_input_usd_per_1m + completion * entry.price_output_usd_per_1m) / 1e6).toFixed(6),
  );
}

// Every refusal is decided before any HTTP request is made. Unknown state never opens the seat.
export function evaluateRelayCall({ policy, model, inputTokens, batch = false, balanceUsd, seatStatus } = {}) {
  const floor = policy?.balance_guard?.floor_usd ?? 3;
  const minTokens = policy?.routing?.min_input_tokens ?? 4096;
  const balance = numberOrNull(balanceUsd);
  const base = {
    model,
    floor_usd: floor,
    balance_usd: balance,
    min_input_tokens: minTokens,
    estimated_input_tokens: numberOrNull(inputTokens),
    batch: batch === true,
    seat_status: seatStatus ?? 'unknown',
  };
  const denied = (code, detail, extra = {}) => ({
    ...base,
    allowed: false,
    sent_http_request: false,
    code,
    detail,
    requires_close: false,
    ...extra,
  });

  if (seatStatus === 'closed') {
    return denied('relay_seat_closed', 'the relay seat is closed; reopen it with a confirmed balance first');
  }
  if (seatStatus !== 'open') {
    return denied('relay_seat_state_unverified', 'no readable open seat state; fail closed instead of assuming the seat is open');
  }
  if (balance === null) {
    return denied('relay_balance_unverified', 'no confirmed balance plus recorded cost ledger; fail closed');
  }
  const entry = findModel(policy, model);
  if (!entry) {
    return denied('relay_model_not_allowlisted', 'this model is outside the owner-approved allowlist for the station');
  }
  if (balance < floor) {
    return {
      ...base,
      allowed: false,
      sent_http_request: false,
      code: 'relay_balance_below_floor',
      detail: 'balance is below the owner floor; the seat must be closed before any call',
      requires_close: true,
      model_tier: entry.tier,
    };
  }
  if (batch !== true && (numberOrNull(inputTokens) ?? 0) < minTokens) {
    return {
      ...base,
      allowed: false,
      sent_http_request: false,
      code: 'relay_short_request_forbidden',
      detail: 'short requests must not be sent to this station; use a long-context request or a declared batch',
      requires_close: false,
      model_tier: entry.tier,
    };
  }
  return {
    ...base,
    allowed: true,
    sent_http_request: true,
    code: 'relay_call_allowed',
    detail: 'allowlisted model with enough input context or a declared batch',
    requires_close: false,
    model_tier: entry.tier,
    routing_reason: batch === true ? 'batch' : 'long_context',
  };
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

export function readSeatState(root = process.cwd(), policy) {
  return readJson(path.join(root, policy.balance_guard.state_path), null);
}

export function readLedger(root = process.cwd(), policy) {
  return readJson(path.join(root, policy.balance_guard.ledger_path), null);
}

export function seatStatusOf(state) {
  if (!state || typeof state.status !== 'string') return 'unknown';
  return state.status;
}

export function closeRelaySeat(root, policy, { balanceUsd, reason, detail, at = new Date().toISOString(), actor = 'relay_seat_guard' }) {
  const file = path.join(root, policy.balance_guard.state_path);
  const prior = readJson(file, null) || {};
  const state = {
    schema_version: 1,
    seat: 'relay_paid_lane',
    status: 'closed',
    balance_usd: numberOrNull(balanceUsd),
    floor_usd: policy.balance_guard.floor_usd,
    closed_at: at,
    close_reason: reason,
    close_detail: detail ?? null,
    closed_by: actor,
    reopen_requires: policy.balance_guard.reopen_requires,
    last_open: prior.status === 'open' ? { balance_usd: prior.balance_usd, updated_at: prior.updated_at } : prior.last_open ?? null,
    updated_at: at,
  };
  writeJson(file, state);
  return state;
}

export function openRelaySeat(root, policy, { balanceUsd, actor, basis, at = new Date().toISOString() }) {
  const balance = numberOrNull(balanceUsd);
  if (balance === null || balance < policy.balance_guard.floor_usd) {
    throw new Error('relay_seat_reopen_balance_below_floor');
  }
  if (!actor || !basis) throw new Error('relay_seat_reopen_requires_actor_and_basis');
  const file = path.join(root, policy.balance_guard.state_path);
  const prior = readJson(file, null) || {};
  const state = {
    schema_version: 1,
    seat: 'relay_paid_lane',
    status: 'open',
    balance_usd: balance,
    floor_usd: policy.balance_guard.floor_usd,
    closed_at: null,
    close_reason: null,
    close_detail: null,
    closed_by: null,
    reopened_at: at,
    reopen_basis: basis,
    reopened_by: actor,
    prior_close: prior.status === 'closed' ? { closed_at: prior.closed_at, close_reason: prior.close_reason } : prior.prior_close ?? null,
    reopen_requires: policy.balance_guard.reopen_requires,
    updated_at: at,
  };
  writeJson(file, state);
  return state;
}

export function appendSpend(root, policy, { model, cost, promptTokens, completionTokens, at = new Date().toISOString(), evidence = null }) {
  const file = path.join(root, policy.balance_guard.ledger_path);
  const ledger = readJson(file, null);
  if (!ledger || numberOrNull(ledger?.baseline?.balance_usd) === null) {
    throw new Error('relay_ledger_baseline_missing');
  }
  ledger.entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  ledger.entries.push({
    at,
    model,
    prompt_tokens: numberOrNull(promptTokens),
    completion_tokens: numberOrNull(completionTokens),
    cost_usd: numberOrNull(cost),
    evidence,
  });
  ledger.updated_at = at;
  writeJson(file, ledger);
  return { ledger, balance_usd: deriveBalance(ledger) };
}

// A confirmed console balance is authoritative and replaces earlier deductions.
export function setConfirmedBalance(root, policy, { balanceUsd, actor, basis, note, at = new Date().toISOString() }) {
  const balance = numberOrNull(balanceUsd);
  if (balance === null) throw new Error('relay_balance_must_be_finite_number');
  if (!actor || !basis) throw new Error('relay_balance_confirmation_requires_actor_and_basis');
  const file = path.join(root, policy.balance_guard.ledger_path);
  const prior = readJson(file, null) || {};
  const rolled = Array.isArray(prior.entries) ? prior.entries : [];
  const rolledCost = rolled.reduce((sum, entry) => sum + (numberOrNull(entry?.cost_usd) || 0), 0);
  const ledger = {
    schema_version: 1,
    seat: 'relay_paid_lane',
    currency: 'USD',
    baseline: { balance_usd: balance, confirmed_at: at, confirmed_by: actor, source: basis, note: note ?? null },
    entries: [],
    prior_periods: [
      ...(Array.isArray(prior.prior_periods) ? prior.prior_periods : []),
      ...(prior.baseline ? [{ baseline_usd: numberOrNull(prior.baseline.balance_usd), entries: rolled.length, recorded_cost_usd: Number(rolledCost.toFixed(6)), closed_at: at }] : []),
    ],
    updated_at: at,
  };
  writeJson(file, ledger);
  return { ledger, balance_usd: deriveBalance(ledger) };
}
