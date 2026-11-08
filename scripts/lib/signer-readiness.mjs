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
const READY_FLAGS = ['treasury_signer_configured', 'signer_configured', 'signer_ready'];
const MISSING_FLAGS = ['treasury_signer_missing', 'signer_missing'];
// A bounded, non-secret list of keys we are allowed to keep as evidence so the
// next run can calibrate against the real provider shape; see evidenceKeys().

export const SIGNER_STATES = Object.freeze(['ready', 'missing', 'auth_blocked', 'unknown']);

function evidenceKeys(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  const allowed = new Set([
    'ok', 'status', 'error', 'aave_runtime_revision',
    ...READY_FLAGS, ...MISSING_FLAGS,
  ]);
  return Object.keys(body).filter(key => allowed.has(key)).sort();
}

// Pure classifier: same inputs always yield the same state, so it can be
// regression-tested offline without any network access.
export function classifySignerResponse({ http, body } = {}) {
  if (http === 401 || http === 403) return { state: 'auth_blocked', reason: 'signer_status_auth_rejected' };
  if (http !== 200) return { state: 'unknown', reason: 'signer_status_not_observed' };
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { state: 'unknown', reason: 'signer_status_not_an_object' };
  if (body.ok === false && body.error === 'treasury_signer_missing') return { state: 'missing', reason: 'treasury_signer_missing' };
  if (body.status === 'blocked_missing_signer') return { state: 'missing', reason: 'blocked_missing_signer' };
  for (const flag of MISSING_FLAGS) if (body[flag] === true) return { state: 'missing', reason: flag };
  for (const flag of READY_FLAGS) if (body[flag] === true) return { state: 'ready', reason: flag };
  // Explicit false on any readiness flag is a positive statement of absence.
  for (const flag of READY_FLAGS) if (body[flag] === false) return { state: 'missing', reason: flag + '_false' };
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
