// Bounded relay adjudication stage (owner authorization 2026-11-17).
// The relay GPT seat may adjudicate routine items only. Funds, signing, wallet,
// Safe, disbursement and loan decisions are structurally short-circuited before
// any relay call: they stay with the GPT decision seat as a manual AI decision,
// never as an automated relay verdict. This module is pure: no network, no
// storage, no side effects, so the rules can be tested without provider calls.

export const ADJUDICATION_REVISION = 'relay-bounded-adjudication-v1';
export const DISPOSITIONS = ['approve_in_scope', 'conditional_approve', 'return_for_revision', 'needs_decision'];

// Owner scope: everything except the important/funds family is delegated.
// A hit here is never adjudicated by the relay seat; it is escalated instead.
const FUND_FAMILY = [
  {family: 'funding_moves', pattern: /资金|经费|打款|付款|转账|提现|入金|出金|\btransfer\b|\bpayout\b|\bpayment\b/i},
  {family: 'loan_disbursement', pattern: /放款|放贷|贷款|借款|额度|授信|disburse|loan|credit line|borrow/i},
  {family: 'refund_semantics', pattern: /退款|退货退款|退单|refund|chargeback|对账口径/i},
  {family: 'wallet_or_safe_ops', pattern: /钱包|多签|safe\b|wallet|multisig|五签|5\s*签/i},
  {family: 'signing', pattern: /签名|私钥|助记词|signer|private[ _-]?key|sign(?:ed|ing)?\b/i},
  {family: 'credential_access', pattern: /凭据|密钥|token\b|secret\b|password|credential/i},
  {family: 'production_write', pattern: /生产写|生产部署|production write|production deploy/i},
];

export function fundFamilyHit({ task_id = '', prompt = '', outputs = [] } = {}) {
  const text = [task_id, prompt, ...(Array.isArray(outputs) ? outputs.map(o => typeof o === 'string' ? o : o?.text ?? '') : [])].join('\n');
  for (const { family, pattern } of FUND_FAMILY) if (pattern.test(text)) return { hit: true, family };
  return { hit: false, family: null };
}

// Deterministic record for the short-circuit path: no provider was called, so
// model_calls must stay untouched and the record must say so.
export function fundShortCircuit({ task_id, input_sha256, family }) {
  return {
    revision: ADJUDICATION_REVISION,
    stage: 'relay_adjudication',
    seat: 'gpt',
    transport: 'none',
    relay_called: false,
    model_calls: 0,
    disposition: 'needs_decision',
    why_out_of_scope: `owner_scope_excludes_${family}: funds/signing family is reserved to the GPT decision seat as a manual decision`,
    escalate_to: 'gpt_decision_seat',
    task_id,
    input_sha256,
    relay_attested: false,
    financial_execution: false,
    execution_authority: false,
  };
}

const STRING_ARRAY = v => Array.isArray(v) && v.length > 0 && v.every(s => typeof s === 'string' && s.trim() && s.length <= 300);

const REQUIRED = {
  approve_in_scope: { scope_ref: v => typeof v === 'string' && /^SCOPE-[A-Za-z0-9._-]{3,80}$/.test(v), permitted_actions: STRING_ARRAY, evidence_refs: STRING_ARRAY, rollback: v => typeof v === 'string' && v.trim().length > 0 },
  conditional_approve: { conditions: STRING_ARRAY, verification: STRING_ARRAY, deadline: v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v), evidence_refs: STRING_ARRAY },
  return_for_revision: { missing_items: STRING_ARRAY, acceptance_criteria: STRING_ARRAY },
  needs_decision: { why_out_of_scope: v => typeof v === 'string' && v.trim().length > 0, escalate_to: v => ['gpt_decision_seat', 'owner'].includes(v) },
};

// Fields that would turn a verdict into an execution claim. A relay verdict may
// never assert them, and the executor must not add them on its behalf.
const EXECUTION_CLAIMS = ['accepted', 'deployed', 'paid', 'tx_hash', 'financial_execution', 'execution_authority', 'writes_performed', 'merges_performed', 'deploys_performed'];

export function parseAdjudication(text, { task_id, input_sha256 } = {}) {
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
  const out = { disposition: parsed.disposition, reason: parsed.reason.slice(0, 2000), task_id, input_sha256 };
  for (const field of Object.keys(REQUIRED[parsed.disposition])) out[field] = parsed[field];
  return { ok: true, decision: out };
}

export function adjudicationPrompt({ task_id, input_sha256, input_text }) {
  const body = [
    'You are the bounded relay adjudicator for the LTZZZ Deep Superagent. You decide routine items only.',
    'Owner delegation excludes the funds and signing family: funding moves, disbursement, loans, refunds, wallet, Safe, signing, credentials, production writes.',
    'That family is already short-circuited before you are called; never approve it here.',
    'You cannot execute anything, cannot merge, cannot deploy, cannot claim acceptance.',
    'Return ONLY JSON with exactly these keys: disposition, reason, task_id, input_sha256, and the fields required by your disposition.',
    'disposition=approve_in_scope requires scope_ref (SCOPE-...), permitted_actions[], evidence_refs[], rollback.',
    'disposition=conditional_approve requires conditions[], verification[], deadline (YYYY-MM-DD), evidence_refs[].',
    'disposition=return_for_revision requires missing_items[], acceptance_criteria[].',
    'disposition=needs_decision requires why_out_of_scope, escalate_to (gpt_decision_seat or owner).',
    `Bind task_id=${task_id} and input_sha256=${input_sha256}. Do not add accepted/deployed/paid/execution fields.`,
  ].join('\n');
  return [
    { role: 'system', content: body },
    { role: 'user', content: JSON.stringify({ task_id, input_sha256, input_text }) },
  ];
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
    decision_authority: 'owner_delegated_except_funds_family',
    decision,
    task_id,
    input_sha256,
    accepted: false,
    deployed: false,
    financial_execution: false,
    execution_authority: false,
  };
}
