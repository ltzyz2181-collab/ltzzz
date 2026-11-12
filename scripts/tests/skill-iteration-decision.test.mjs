import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyDecision, proposalHash, DECISION_SCHEMA} from '../lib/skill-iteration-decision.mjs';

const proposal = 'proposal: rephrase rule 5 in SKILL.md\n';
const base = {
  schema: DECISION_SCHEMA,
  decision_id: 'dsi-20261112-relay-01',
  proposal_id: 'dsi-20261112-proposal-01',
  approved: true,
  approver: 'gpt',
  approver_kind: 'gpt_decision_seat',
  proposal_sha256: proposalHash(proposal),
  approved_scope: ['skills/ltzzz-task-execution'],
  decided_at_utc: '2026-11-12T02:30:00Z',
  conditions: []
};

test('approved GPT decision with matching proposal hash passes', () => {
  const r = verifyDecision(base, {proposalText: proposal});
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test('proposal hash mismatch blocks deploy', () => {
  const r = verifyDecision(base, {proposalText: 'different proposal'});
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('proposal_sha256_mismatch'));
});

test('deep cannot approve its own proposal', () => {
  const r = verifyDecision({...base, executor: 'deep'}, {proposalText: proposal});
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('executor_cannot_approve_own_proposal'));
});

test('approval false blocks deploy', () => {
  const r = verifyDecision({...base, approved: false}, {proposalText: proposal});
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('decision_not_approved'));
});

test('scope outside the skill pack is rejected', () => {
  const r = verifyDecision({...base, approved_scope: ['skills/ltzzz-task-execution', 'workers/deep-superagent']}, {proposalText: proposal});
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('approved_scope_outside_skill_pack'));
});

test('missing schema or bad approver blocks deploy', () => {
  const r = verifyDecision({...base, schema: 'other', approver: 'deepseek'}, {proposalText: proposal});
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('decision_schema_invalid'));
  assert.ok(r.errors.includes('approver_must_be_gpt_decision_seat'));
});
