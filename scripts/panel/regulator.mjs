import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {PANEL_LIMITS} from './limits.mjs';
import {validateProposal, validateVote} from './schema.mjs';

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Verify evidence files exist and optional hashes match.
 * evidenceStore: Map or object of receipt_id -> {path?, hash?, run_id?} or filesystem under rootDir
 */
export function verifyEvidence(proposal, {rootDir = process.cwd(), evidenceIndex = {}} = {}) {
  const results = [];
  for (const e of proposal.evidence) {
    const indexed = evidenceIndex[e.receipt_id];
    let filePath = e.path || indexed?.path || null;
    if (filePath && !path.isAbsolute(filePath)) filePath = path.join(rootDir, filePath);

    const row = {receipt_id: e.receipt_id, exists: false, hash_ok: null, run_id_ok: null};
    if (filePath && fs.existsSync(filePath)) {
      row.exists = true;
      row.path = filePath;
      if (e.hash) {
        const actual = sha256File(filePath);
        row.hash_ok = actual.toLowerCase() === e.hash.toLowerCase();
        row.actual_hash = actual;
      } else if (indexed?.hash) {
        row.hash_ok = true;
      }
    } else if (indexed && indexed.exists === true) {
      row.exists = true;
      if (e.hash && indexed.hash) row.hash_ok = e.hash.toLowerCase() === indexed.hash.toLowerCase();
    }
    if (e.run_id && indexed?.run_id) row.run_id_ok = e.run_id === indexed.run_id;
    results.push(row);
  }
  const allExist = results.every((r) => r.exists);
  const hashFail = results.some((r) => r.hash_ok === false);
  return {ok: allExist && !hashFail, results};
}

export function checkStepAndCeiling(proposal, {currentLimitUsd = 0, recentStepUps = []} = {}) {
  const amount = Number(proposal.requested.amount_usd || 0);
  const failures = [];

  if (proposal.kind === 'rentahuman_pilot') {
    if (amount > PANEL_LIMITS.maxRentAHumanSingleUsd) {
      failures.push({code: 'over_rah_single', max: PANEL_LIMITS.maxRentAHumanSingleUsd, amount});
    }
  }
  if (proposal.kind === 'external_purchase' || proposal.kind === 'rentahuman_pilot') {
    if (amount > PANEL_LIMITS.maxSingleExternalUsd) {
      failures.push({code: 'over_single_external', max: PANEL_LIMITS.maxSingleExternalUsd, amount});
    }
  }
  if (proposal.kind === 'limit_step_up') {
    const maxAllowed = Number((currentLimitUsd * (1 + PANEL_LIMITS.maxStepUpRatio)).toFixed(6));
    if (amount > maxAllowed + 1e-9) {
      failures.push({code: 'step_up_over_20pct', current: currentLimitUsd, maxAllowed, amount});
    }
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = recentStepUps.filter((t) => Date.parse(t) >= weekAgo);
    if (recent.length >= PANEL_LIMITS.maxStepUpsPer7Days) {
      failures.push({code: 'step_up_weekly_cap', recent: recent.length});
    }
  }
  return {ok: failures.length === 0, failures};
}

/**
 * Aggregate votes: need ≥2 pass from ≥2 distinct providers; proposer provider excluded already by schema.
 */
export function tallyVotes(votes, proposal) {
  const validated = [];
  for (const v of votes || []) {
    const r = validateVote(v, proposal);
    if (r.ok) validated.push(r.vote);
  }
  const byProvider = new Map();
  for (const v of validated) byProvider.set(v.provider, v);
  const unique = [...byProvider.values()];
  const passes = unique.filter((v) => v.vote === 'pass');
  const rejects = unique.filter((v) => v.vote === 'reject');
  const providersPass = new Set(passes.map((v) => v.provider));
  const ok = passes.length >= 2 && providersPass.size >= 2;
  return {
    ok,
    pass_count: passes.length,
    reject_count: rejects.length,
    providers_pass: [...providersPass],
    funds_related_split: proposal.kind !== 'circuit_breaker_resume' && passes.length === 1 && rejects.length === 1,
    votes: unique
  };
}

/**
 * Full regulator pass. Does not apply any change — returns decision record only.
 */
export function regulate(rawProposal, votes, ctx = {}) {
  const vp = validateProposal(rawProposal);
  if (!vp.ok) return {ok: false, stage: 'schema', ...vp};

  const evidence = verifyEvidence(vp.proposal, ctx);
  if (!evidence.ok) return {ok: false, stage: 'evidence', error: 'evidence_failed', evidence};

  const step = checkStepAndCeiling(vp.proposal, ctx);
  if (!step.ok) return {ok: false, stage: 'limits', error: 'limit_failed', step};

  const tally = tallyVotes(votes, vp.proposal);
  if (!tally.ok) return {ok: false, stage: 'votes', error: 'vote_failed', tally, evidence, step};

  return {
    ok: true,
    stage: 'regulated',
    mode: ctx.mode || PANEL_LIMITS.modeDefault,
    applies: false, // shadow: never apply here
    proposal: vp.proposal,
    evidence,
    step,
    tally,
    cooldown_hours: PANEL_LIMITS.cooldownHoursAfterPass,
    at: new Date().toISOString()
  };
}
