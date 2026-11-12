import fs from 'node:fs';
import {createHash} from 'node:crypto';

export const DECISION_SCHEMA = 'ltzzz.skill-iteration.decision.v1';
export const ALLOWED_SKILL_PREFIXES = [
  'skills/ltzzz-task-execution',
  '.github/skills/ltzzz-task-execution',
  '.claude/skills/ltzzz-task-execution',
  '.agents/skills/ltzzz-task-execution'
];

const sha256 = value => createHash('sha256').update(value).digest('hex');
const HEX64 = /^[a-f0-9]{64}$/;

export function proposalHash(proposalText) {
  return sha256(proposalText.replace(/\r\n/g, '\n'));
}

// Decision receipts are written by the GPT decision seat, never by the executor.
// Fail closed on anything that would let a proposal approve itself.
export function verifyDecision(decision, {proposalText} = {}) {
  const errors = [];
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
    return {ok: false, errors: ['decision_not_an_object']};
  }
  if (decision.schema !== DECISION_SCHEMA) errors.push('decision_schema_invalid');
  if (!/^dsi-[a-z0-9-]{6,60}$/.test(decision.decision_id || '')) errors.push('decision_id_invalid');
  if (!/^dsi-[a-z0-9-]{6,60}$/.test(decision.proposal_id || '')) errors.push('proposal_id_invalid');
  if (decision.approved !== true) errors.push('decision_not_approved');
  if (decision.approver !== 'gpt') errors.push('approver_must_be_gpt_decision_seat');
  if (decision.approver_kind !== 'gpt_decision_seat') errors.push('approver_kind_invalid');
  if (decision.executor === 'deep' || decision.executed_by === 'deep') errors.push('executor_cannot_approve_own_proposal');
  if (!HEX64.test(decision.proposal_sha256 || '')) errors.push('proposal_sha256_invalid');
  if (Number.isNaN(Date.parse(decision.decided_at_utc || ''))) errors.push('decided_at_invalid');
  const scope = decision.approved_scope;
  if (!Array.isArray(scope) || scope.length === 0) errors.push('approved_scope_empty');
  else if (scope.some(p => !ALLOWED_SKILL_PREFIXES.includes(p))) errors.push('approved_scope_outside_skill_pack');

  if (typeof proposalText === 'string' && decision.proposal_sha256 !== proposalHash(proposalText)) {
    errors.push('proposal_sha256_mismatch');
  }

  return {
    ok: errors.length === 0,
    errors,
    decision_id: decision.decision_id ?? null,
    proposal_id: decision.proposal_id ?? null
  };
}

export function readDecisionFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
