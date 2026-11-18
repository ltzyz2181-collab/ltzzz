// Pure relay cost accounting for the Deep Worker's audit record.
// The relay proxy is the authoritative budget gate (durable-object ledger);
// these helpers only reproduce its estimate so the Worker can record the
// worst-case cost it authorized and the actual cost it observed.
// Keep prices in sync with config/relay-seat-policy.json (same allowlist the
// proxy enforces); the parity test compares both sides explicitly.

import policy from '../../config/relay-seat-policy.json' with {type: 'json'};

export const RELAY_PRICES = Object.fromEntries(
  (policy.routing?.allowlist || []).map(entry => [entry.model, {
    input: entry.price_input_usd_per_1m,
    output: entry.price_output_usd_per_1m,
    hiddenInputTokens: entry.known_input_inflation_tokens || 0,
  }]),
);

export const RELAY_COST_GUARD = policy.cost_guard || {};
export const RELAY_BALANCE_FLOOR_USD = policy.balance_guard?.floor_usd ?? 3;

// Same ranges as scripts/lib/relay-seat-guard.mjs: CJK, compatibility ideographs
// and fullwidth forms count as one token each; other text as one token per four
// characters. Numeric comparison avoids escape-sequence drift between tools.
function isWideCharacter(ch) {
  const code = ch.codePointAt(0);
  return (code >= 0x3000 && code <= 0x9fff)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xff00 && code <= 0xffef);
}

export function estimateInputTokens(text) {
  const value = String(text ?? '');
  let cjk = 0;
  let other = 0;
  for (const ch of value) {
    if (isWideCharacter(ch)) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

export function messagesInputTokens(messages) {
  const text = (messages || []).map(message => (
    typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? '')
  )).join('\n');
  return estimateInputTokens(text);
}

export function modelPrices(model) {
  return RELAY_PRICES[model] || null;
}

// Worst-case bound before the HTTP request: estimated input plus the completion
// cap, priced with the allowlist entry. Returns null for a non-allowlisted model.
export function estimateWorstCaseCost({ model, messages, maxCompletionTokens }) {
  const prices = modelPrices(model);
  if (!prices) return null;
  const input = messagesInputTokens(messages) + prices.hiddenInputTokens;
  const output = Number(maxCompletionTokens);
  if (!Number.isFinite(output) || output < 0) return null;
  return Number(((input * prices.input + output * prices.output) / 1e6).toFixed(6));
}

// Actual cost after the response. A station-reported prompt count of 0 is
// billed at our own estimate plus the known hidden prefix, never below it.
export function usageCostUsd({ model, reportedPromptTokens, estimatedInputTokens, completionTokens }) {
  const prices = modelPrices(model);
  if (!prices) return null;
  const reported = Number(reportedPromptTokens);
  const estimated = Number(estimatedInputTokens) || 0;
  const billedInput = Math.max(Number.isFinite(reported) && reported > 0 ? reported : 0, estimated + prices.hiddenInputTokens);
  const completion = Number(completionTokens);
  const billedOutput = Number.isFinite(completion) && completion >= 0 ? completion : 0;
  return Number(((billedInput * prices.input + billedOutput * prices.output) / 1e6).toFixed(6));
}
