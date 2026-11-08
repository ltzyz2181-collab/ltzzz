// Treasury signer readiness preflight (read-only, no funding attempt).
//
// Context: run 42453653984 failed at the Aave step with HTTP 422
// `treasury_signer_missing` (on_chain_executed=false, tx_hash=null). The order
// fulfilment step of the same run had already succeeded (orders=[], model_calls=0).
// Re-running the whole workflow would risk paying twice, so instead each
// funding step is gated behind an explicit capability check.
//
// Contract:
//   ready        -> the caller MAY attempt the funding step.
//   missing      -> caller MUST skip and persist `blocked_missing_signer`.
//   auth_blocked -> caller MUST skip and persist `blocked_signer_auth`; no retry.
//   unknown      -> caller MUST skip (fail-closed); never infer capability.
//
// This module performs at most ONE read-only GET and never retries: an unknown
// transport outcome is not evidence that signing works, and it is not retried
// because a funding-capable endpoint must not be probed repeatedly.
const STATUS_PATH = '/market/aave/status';
// Explicit contract the producer must publish (see the 2026-11-08 ruling):
// schema + revision + scope, with `signer.configured` derived only from a real
// adapter binding and `signer.control_verified` from an existing control proof.
const CONTRACT_SCHEMA = 'ltzzz.treasury-signer-status.v1';
// Legacy aliases are still *recorded* as evidence but can never on their own
// turn the gate green: "any one of several aliases says true" is exactly the
// bypass this contract replaces.
const LEGACY_FLAGS = ['treasury_signer_configured', 'signer_configured', 'signer_ready', 'treasury_signer_ready'];
const MISSING_FLAGS = ['treasury_signer_missing', 'signer_missing'];
// A bounded, non-secret list of keys we are allowed to keep as evidence so the
// next run can calibrate against the real provider shape; see evidenceKeys().

export const SIGNER_STATES = Object.freeze(['ready', 'missing', 'auth_blocked', 'unknown']);

function evidenceKeys(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  const allowed = new Set([
    'ok', 'status', 'error', 'aave_runtime_revision', 'schema', 'revision',
    'scope', 'configured', 'control_verified', 'signer',
    ...LEGACY_FLAGS, ...MISSING_FLAGS,
  ]);
  return Object.keys(body).filter(key => allowed.has(key)).sort();
}

// Pure classifier: same inputs always yield the same state, so it can be
// regression-tested offline with zero network and zero funds.
//
// Order of precedence, fail-closed throughout:
//   1. transport/auth        -> auth_blocked
//   2. non-200               -> unknown
//   3. business failure      -> never ready (ok:false cannot prove capability)
//   4. explicit absence      -> missing
//   5. explicit contract     -> ready only when configured AND control_verified
//   6. legacy aliases        -> at most unknown; conflicting aliases -> unknown
export function classifySignerResponse({ http, body } = {}) {
  if (http === 401 || http === 403) return { state: 'auth_blocked', reason: 'signer_status_auth_rejected' };
  if (http !== 200) return { state: 'unknown', reason: 'signer_status_not_observed' };
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { state: 'unknown', reason: 'signer_status_not_an_object' };

  // A failing service response is evidence of *failure*, never of capability,
  // no matter which readiness flag a caller adds to it.
  if (body.ok === false) {
    if (body.error === 'treasury_signer_missing' || body.status === 'blocked_missing_signer') {
      return { state: 'missing', reason: 'treasury_signer_missing' };
    }
    return { state: 'unknown', reason: 'signer_status_reports_failure' };
  }

  for (const flag of MISSING_FLAGS) if (body[flag] === true) return { state: 'missing', reason: flag };
  if (body.status === 'blocked_missing_signer') return { state: 'missing', reason: 'blocked_missing_signer' };

  const contract = body.signer && typeof body.signer === 'object'
    ? body.signer
    : (body.schema === CONTRACT_SCHEMA ? body : null);

  if (contract) {
    const configured = contract.configured !== undefined ? contract.configured : contract.signer_configured;
    const verified = contract.control_verified !== undefined ? contract.control_verified : contract.signer_control_verified;
    if (configured === false) return { state: 'missing', reason: 'signer_configured_false' };
    if (configured !== true) return { state: 'unknown', reason: 'signer_configured_not_declared' };
    if (verified === false) return { state: 'unknown', reason: 'signer_control_not_verified' };
    if (verified !== true) return { state: 'unknown', reason: 'signer_control_unverified' };
    return { state: 'ready', reason: 'explicit_contract_ready' };
  }

  const declared = LEGACY_FLAGS.filter(flag => typeof body[flag] === 'boolean');
  if (declared.length) {
    const values = new Set(declared.map(flag => body[flag]));
    if (values.size > 1) return { state: 'unknown', reason: 'conflicting_signer_flags' };
    if (body[declared[0]] === false) return { state: 'missing', reason: declared[0] + '_false' };
    // true without the explicit contract is a legacy claim: it may not open the gate.
    return { state: 'unknown', reason: 'signer_capability_declared_without_contract' };
  }
  return { state: 'unknown', reason: 'signer_capability_not_declared' };
}

export async function probeSignerCapability({
  origin,
  pin,
  fetcher = fetch,
  timeoutMs = 20000,
  now = () => new Date().toISOString(),
} = {}) {
  const evidence = {
    schema: 'ltzzz.treasury-signer-preflight.v1',
    origin: origin || null,
    path: STATUS_PATH,
    checked_at_utc: now(),
    http: null,
    state: 'unknown',
    reason: 'signer_status_not_observed',
    observed_keys: [],
    retries: 0,
    funding_attempted: false,
    on_chain_executed: false,
    tx_hash: null,
  };
  if (!origin) { evidence.reason = 'origin_not_configured'; return evidence; }
  try {
    const response = await fetcher(origin + STATUS_PATH, {
      method: 'GET',
      redirect: 'error',
      headers: pin ? { 'X-Lab-Pin': pin } : {},
      signal: AbortSignal.timeout(timeoutMs),
    });
    evidence.http = response.status;
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    const verdict = classifySignerResponse({ http: response.status, body });
    evidence.state = verdict.state;
    evidence.reason = verdict.reason;
    evidence.observed_keys = evidenceKeys(body);
  } catch {
    // Transport failures are recorded as a fixed code; the raw error text is
    // never persisted, and the probe is deliberately not retried.
    evidence.state = 'unknown';
    evidence.reason = 'signer_status_transport_unavailable';
  }
  return evidence;
}

// Shared gate used by both funding scripts so the two can never disagree about
// what "not ready" means.
export function fundingGate(evidence) {
  const state = SIGNER_STATES.includes(evidence?.state) ? evidence.state : 'unknown';
  return {
    allowed: state === 'ready',
    state,
    blocked_status: state === 'ready' ? null : state === 'missing' ? 'blocked_missing_signer' : state === 'auth_blocked' ? 'blocked_signer_auth' : 'blocked_signer_unverified',
  };
}
