import {ALLOWED_PROPOSAL_KINDS} from './limits.mjs';

const PROVIDERS = new Set(['deepseek', 'doubao', 'qianwen', 'grok', 'kimi', 'gpt', 'claude']);

function isIso(s) {
  return typeof s === 'string' && !Number.isNaN(Date.parse(s));
}

function isSha256(s) {
  return typeof s === 'string' && /^[a-f0-9]{64}$/i.test(s);
}

/**
 * Validate proposal shape. Free-text instructions are rejected (anti-injection).
 * @returns {{ok:true, proposal}|{ok:false, error:string, details?:any}}
 */
export function validateProposal(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {ok: false, error: 'proposal_must_be_object'};
  }
  const extra = Object.keys(raw).filter(
    (k) =>
      ![
        'id',
        'kind',
        'proposer_seat',
        'proposer_provider',
        'requested',
        'evidence',
        'created_at',
        'notes_hash'
      ].includes(k)
  );
  if (extra.length) return {ok: false, error: 'unknown_fields', details: extra};

  if (typeof raw.id !== 'string' || raw.id.length < 8 || raw.id.length > 80) {
    return {ok: false, error: 'bad_id'};
  }
  if (!ALLOWED_PROPOSAL_KINDS.includes(raw.kind)) {
    return {ok: false, error: 'bad_kind'};
  }
  if (typeof raw.proposer_seat !== 'string' || !raw.proposer_seat) {
    return {ok: false, error: 'bad_proposer_seat'};
  }
  if (!PROVIDERS.has(String(raw.proposer_provider || '').toLowerCase())) {
    return {ok: false, error: 'bad_proposer_provider'};
  }
  if (!isIso(raw.created_at)) return {ok: false, error: 'bad_created_at'};

  if (!raw.requested || typeof raw.requested !== 'object') {
    return {ok: false, error: 'bad_requested'};
  }
  const amount = Number(raw.requested.amount_usd);
  if (!(amount >= 0) || !Number.isFinite(amount)) {
    return {ok: false, error: 'bad_amount_usd'};
  }

  if (!Array.isArray(raw.evidence) || !raw.evidence.length) {
    return {ok: false, error: 'evidence_required'};
  }
  for (const e of raw.evidence) {
    if (!e || typeof e !== 'object') return {ok: false, error: 'bad_evidence_item'};
    if (typeof e.receipt_id !== 'string' || !e.receipt_id) {
      return {ok: false, error: 'evidence_receipt_id_required'};
    }
    if (e.hash != null && !isSha256(e.hash)) return {ok: false, error: 'evidence_hash_not_sha256'};
    if (e.run_id != null && typeof e.run_id !== 'string') {
      return {ok: false, error: 'evidence_run_id_must_be_string'};
    }
  }

  if (raw.notes_hash != null && !isSha256(raw.notes_hash)) {
    return {ok: false, error: 'notes_hash_not_sha256'};
  }

  return {
    ok: true,
    proposal: {
      id: raw.id,
      kind: raw.kind,
      proposer_seat: raw.proposer_seat,
      proposer_provider: String(raw.proposer_provider).toLowerCase(),
      requested: {amount_usd: amount, ...raw.requested},
      evidence: raw.evidence.map((e) => ({
        receipt_id: e.receipt_id,
        hash: e.hash || null,
        run_id: e.run_id || null,
        path: e.path || null
      })),
      created_at: raw.created_at,
      notes_hash: raw.notes_hash || null
    }
  };
}

/**
 * Review vote: structured only. vote = pass|reject
 */
export function validateVote(raw, proposal) {
  if (!raw || typeof raw !== 'object') return {ok: false, error: 'vote_must_be_object'};
  const provider = String(raw.provider || '').toLowerCase();
  if (!PROVIDERS.has(provider)) return {ok: false, error: 'bad_vote_provider'};
  if (proposal && provider === proposal.proposer_provider) {
    return {ok: false, error: 'same_provider_as_proposer'};
  }
  if (raw.vote !== 'pass' && raw.vote !== 'reject') return {ok: false, error: 'vote_must_be_pass_or_reject'};
  if (typeof raw.reason_code !== 'string' || raw.reason_code.length > 64) {
    return {ok: false, error: 'bad_reason_code'};
  }
  // Discard free-text body if present
  return {
    ok: true,
    vote: {
      provider,
      seat: raw.seat || provider,
      vote: raw.vote,
      reason_code: raw.reason_code,
      at: isIso(raw.at) ? raw.at : new Date().toISOString()
    }
  };
}
