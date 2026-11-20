// Bounded relay adjudication stage (owner authorization 2026-11-19).
// The relay GPT seat may adjudicate every matter except the six owner-retained
// families: funds, refund terminal decisions, signing, private keys, wallet
// operations and credentials. Those are structurally short-circuited before any
// relay call. The five-signature wallet stays with the owner/multisig and is
// never escalated to the GPT seat. Production writes, releases and deploys are
// delegated and no longer short-circuited. This module is pure: no network, no
// storage, no side effects, so the rules can be tested without provider calls.

import scopeRegistry from '../../config/relay-adjudication-scopes.json' with {type: 'json'};

export const ADJUDICATION_REVISION = 'relay-bounded-adjudication-v3';
export const DISPOSITIONS = ['approve_in_scope', 'conditional_approve', 'return_for_revision', 'needs_decision'];

// Owner scope: everything except the important/funds family is delegated.
// A hit here is never adjudicated by the relay seat; it is escalated instead.
// five_signature_safe is checked first so 五签/5-of-5 never falls into the
// generic wallet family and never gets the GPT escalation target.
const FUND_FAMILY = [
  {family: 'five_signature_safe', pattern: /五签|5\s*签|五个签名|5\s*(?:of|\/)\s*5|five[ _-]?signature|five[ _-]?sign/i},
  {family: 'funding_moves', pattern: /资金|经费|打款|付款|支付|结算|转账|提现|入金|出金|充值|购买|订购|订阅|续费|手续费|佣金|分账|收款|营收|\btransfer\b|\bpayout\b|\bpayment\b|\bpurchase\b|\bsubscri|\bbilling\b|\brecharge\b|\btop[- ]?up\b/i},
  {family: 'loan_disbursement', pattern: /放款|放贷|贷款|借款|额度|授信|disburse|loan|credit line|borrow/i},
  {family: 'refund_semantics', pattern: /退款|退货退款|退单|refund|chargeback|对账口径/i},
  {family: 'wallet_or_safe_ops', pattern: /钱包|多签|safe\b|wallet|multisig/i},
  {family: 'signing', pattern: /签名|私钥|助记词|signer|private[ _-]?key|sign(?:ed|ing)?\b/i},
  {family: 'credential_access', pattern: /凭据|密钥|token\b|secret\b|password|credential/i},
];

export function fundFamilyHit({task_id = '', prompt = '', outputs = []} = {}) {
  const text = [task_id, prompt, ...(Array.isArray(outputs) ? outputs.map(o => typeof o === 'string' ? o : o?.text ?? '') : [])].join('\n');
  for (const { family, pattern } of FUND_FAMILY) if (pattern.test(text)) return { hit: true, family };
  return { hit: false, family: null };
}

// Five-signature decisions never leave the owner/multisig path; every other
// funds-family hit is a manual GPT decision. Neither target may be a relay seat.
export function escalationTargetFor(family) {
  return family === 'five_signature_safe' ? 'owner_multisig' : 'gpt_decision_seat';
}

// Deterministic record for the short-circuit path: no provider was called, so
// model_calls must stay untouched and the record must say so.
export function fundShortCircuit({ task_id, input_sha256, family }) {
  const escalate_to = escalationTargetFor(family);
  return {
    revision: ADJUDICATION_REVISION,
    stage: 'relay_adjudication',
    seat: 'gpt',
    transport: 'none',
    relay_called: false,
    model_calls: 0,
    disposition: 'needs_decision',
    why_out_of_scope: escalate_to === 'owner_multisig'
      ? 'owner_multisig_excludes_five_signature_safe: the five-signature wallet is reserved to the owner/multisig, not the GPT decision seat and never the relay'
      : `owner_scope_excludes_${family}: funds/signing family is reserved to the GPT decision seat as a manual decision`,
    escalate_to,
    five_signature_owner_required: escalate_to === 'owner_multisig',
    task_id,
    input_sha256,
    relay_attested: false,
    financial_execution: false,
    execution_authority: false,
  };
}

const STRING_ARRAY = v => Array.isArray(v) && v.length > 0 && v.every(s => typeof s === 'string' && s.trim() && s.length <= 300);

// Scope registry is data, not delegated authority: every permitted action must
// match a named scope that already cites an owner authority source.
export const ADJUDICATION_SCOPES = (scopeRegistry.scopes || []).map(scope => ({
  ...scope,
  allowed_action_patterns: (scope.allowed_action_patterns || []).map(p => new RegExp(p, 'i')),
  forbidden_action_patterns: (scope.forbidden_action_patterns || []).map(p => new RegExp(p, 'i')),
}));

export function scopeById(scope_ref, scopes = ADJUDICATION_SCOPES) {
  return scopes.find(scope => scope.scope_ref === scope_ref) || null;
}

export function validateScopeActions({ scope_ref, permitted_actions, scopes = ADJUDICATION_SCOPES, now = new Date().toISOString() } = {}) {
  const scope = scopeById(scope_ref, scopes);
  if (!scope) return { ok: false, error: 'adjudication_scope_unknown', scope_ref: scope_ref ?? null };
  if (scope.expires_at && Date.parse(scope.expires_at) <= Date.parse(now)) {
    return { ok: false, error: 'adjudication_scope_expired', scope_ref };
  }
  for (const action of permitted_actions || []) {
    const funds = fundFamilyHit({ prompt: action });
    if (funds.hit) return { ok: false, error: 'adjudication_permitted_action_in_funds_family', action, family: funds.family };
    if (scope.forbidden_action_patterns.some(pattern => pattern.test(action))) {
      return { ok: false, error: 'adjudication_permitted_action_forbidden', action, scope_ref };
    }
    if (!scope.allowed_action_patterns.some(pattern => pattern.test(action))) {
      return { ok: false, error: 'adjudication_permitted_action_outside_scope', action, scope_ref };
    }
  }
  return { ok: true, scope_ref };
}

const REQUIRED = {
  approve_in_scope: { scope_ref: v => typeof v === 'string' && /^SCOPE-[A-Za-z0-9._-]{3,80}$/.test(v), permitted_actions: STRING_ARRAY, evidence_refs: STRING_ARRAY, rollback: v => typeof v === 'string' && v.trim().length > 0 },
  conditional_approve: { conditions: STRING_ARRAY, verification: STRING_ARRAY, deadline: v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v), evidence_refs: STRING_ARRAY },
  return_for_revision: { missing_items: STRING_ARRAY, acceptance_criteria: STRING_ARRAY },
  // A relay verdict never routes a routine internal decision to the owner.
  // The only target for the model is the GPT decision queue; owner/multisig is
  // reached solely by the five-signature short-circuit before any model call.
  needs_decision: { why_out_of_scope: v => typeof v === 'string' && v.trim().length > 0, escalate_to: v => v === 'gpt_decision_seat' },
};

// Fields that would turn a verdict into an execution claim. A relay verdict may
// never assert them, and the executor must not add them on its behalf.
const EXECUTION_CLAIMS = ['accepted', 'deployed', 'paid', 'tx_hash', 'financial_execution', 'execution_authority', 'writes_performed', 'merges_performed', 'deploys_performed'];

export function parseAdjudication(text, { task_id, input_sha256, scopes = ADJUDICATION_SCOPES, now = new Date().toISOString() } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(String(text ?? '').trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1'));
  } catch { return { ok: false, error: 'adjudication_json_invalid' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'adjudication_not_an_object' };
  if (!DISPOSITIONS.includes(parsed.disposition)) return { ok: false, error: 'adjudication_disposition_unknown' };
  if (parsed.task_id !== task_id) return { ok: false, error: 'adjudication_task_binding_mismatch' };
  if (parsed.input_sha256 !== input_sha256) return { ok: false, error: 'adjudication_input_binding_mismatch' };
  for (const claim of EXECUTION_CLAIMS) {
    const value = parsed[claim];
    if (value === undefined || value === null || value === false || value === 0) continue;
    return { ok: false, error: 'adjudication_may_not_assert_execution_' + claim };
  }
  if (typeof parsed.reason !== 'string' || !parsed.reason.trim() || parsed.reason.length > 2000) return { ok: false, error: 'adjudication_reason_missing' };
  const missing = [];
  for (const [field, check] of Object.entries(REQUIRED[parsed.disposition])) {
    if (!check(parsed[field])) missing.push(field);
  }
  if (missing.length) return { ok: false, error: 'adjudication_required_fields_missing', missing };
  if (parsed.disposition === 'approve_in_scope') {
    const scopeCheck = validateScopeActions({ scope_ref: parsed.scope_ref, permitted_actions: parsed.permitted_actions, scopes, now });
    if (!scopeCheck.ok) return scopeCheck;
  }
  const out = { disposition: parsed.disposition, reason: parsed.reason.slice(0, 2000), task_id, input_sha256 };
  for (const field of Object.keys(REQUIRED[parsed.disposition])) out[field] = parsed[field];
  return { ok: true, decision: out };
}

export function adjudicationPrompt({ task_id, input_sha256, input_text }) {
  const scopeLines = ADJUDICATION_SCOPES.map(scope => `${scope.scope_ref}: ${scope.description}`).join(' | ');
  const body = [
    'You are the bounded relay adjudicator for the LTZZZ Deep Superagent. You decide routine, low-risk, reversible internal-repo items only.',
    'Owner delegation excludes only the funds family and the key/signing families: funding moves, purchases, subscriptions, billing, disbursement, loans, refund terminal decisions, wallet, Safe, five-signature, signing, private keys, credentials. Production writes, releases and deploys are delegated.',
    'That family is already short-circuited before you are called; never approve it here. Five-signature items never reach you and belong to the owner/multisig.',
    'You cannot execute anything, cannot merge, cannot deploy, cannot claim acceptance.',
    'Return ONLY JSON with exactly these keys: disposition, reason, task_id, input_sha256, and the fields required by your disposition.',
    `approve_in_scope requires scope_ref from this registry: ${scopeLines}.`,
    'approve_in_scope also requires permitted_actions[] where every item names an action inside that scope, evidence_refs[], rollback.',
    'disposition=conditional_approve requires conditions[], verification[], deadline (YYYY-MM-DD), evidence_refs[].',
    'disposition=return_for_revision requires missing_items[], acceptance_criteria[].',
    'disposition=needs_decision requires why_out_of_scope, escalate_to (exactly gpt_decision_seat; owner escalation is not available to you).',
    `Bind task_id=${task_id} and input_sha256=${input_sha256}. Do not add accepted/deployed/paid/execution fields.`,
  ].join('\n');
  return [
    { role: 'system', content: body },
    { role: 'user', content: JSON.stringify({ task_id, input_sha256, input_text }) },
  ];
}

export function adjudicationAudit(receipt = {}) {
  return {
    prompt_tokens: receipt.prompt_tokens ?? null,
    completion_tokens: receipt.completion_tokens ?? null,
    tokens_used: receipt.tokens_used ?? null,
    estimated_cost_usd: receipt.estimated_cost_usd ?? null,
    actual_cost_usd: receipt.actual_cost_usd ?? null,
    latency_ms: receipt.latency_ms ?? null,
    balance_after_usd: receipt.balance_after_usd ?? null,
    budget_reservation_id: receipt.budget_reservation_id ?? null,
    upstream_http: receipt.upstream_http ?? null,
    request_id: receipt.request_id ?? null,
  };
}

export function adjudicationRecord({ task_id, input_sha256, decision, receipt = {} }) {
  return {
    revision: ADJUDICATION_REVISION,
    stage: 'relay_adjudication',
    seat: 'gpt',
    transport: receipt.relay_transport ?? 'ltzzz_proxy_seat_token',
    relay_called: true,
    actual_provider: 'apisrouter_relay',
    actual_model: receipt.actual_model ?? null,
    request_id: receipt.request_id ?? null,
    relay_attested: false,
    decision_authority: 'bounded_adjudication_owner_delegated_except_funds_and_five_signature',
    budget_gate: 'relay_proxy_durable_object',
    input_classification: 'public_distributable',
    decision,
    task_id,
    input_sha256,
    audit: adjudicationAudit(receipt),
    accepted: false,
    deployed: false,
    financial_execution: false,
    execution_authority: false,
  };
}

// A failed, malformed or abandoned attempt is a recorded undecided outcome.
// It is never retried and never filled in from another seat.
export function adjudicationUncertain({ task_id, input_sha256, adjudication_id, error, missing = null, relay_called = false, receipt = {}, at = new Date().toISOString() }) {
  return {
    revision: ADJUDICATION_REVISION,
    adjudication_id,
    stage: 'relay_adjudication',
    seat: 'gpt',
    relay_called,
    status: 'undecided',
    error,
    missing,
    actual_provider: relay_called ? 'apisrouter_relay' : null,
    actual_model: receipt.actual_model ?? null,
    request_id: receipt.request_id ?? null,
    relay_attested: false,
    task_id,
    input_sha256,
    audit: adjudicationAudit(receipt),
    accepted: false,
    deployed: false,
    financial_execution: false,
    execution_authority: false,
    at,
  };
}
