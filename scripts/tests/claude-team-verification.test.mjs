import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hash, verifyAnsEvidence, verifyOriginalHire} from '../lib/claude-team-verification.mjs';

function fixture() {
  const files = {'knowledge/results/example.json': '{"result":"draft"}\n'};
  const artifact = {path: 'knowledge/results/example.json', sha256: hash(files['knowledge/results/example.json']), role: 'worker', executed_by: 'DeepSeek'};
  return {read: path => {if (!(path in files)) throw Error('missing'); return files[path];},
    daily: {date: '2026-10-19', run_key: '12:1', seats: {deepseek: {status: 'rejected_draft_review', claim_verified: true, submission_verified: true,
      assignment: {id: 'DAILY-2026-10-19-deepseek'}, claim_receipt: {task_id: 'DAILY-2026-10-19-deepseek', claimed_by: 'deepseek', run_key: '12:1'},
      submission_receipt: {task_id: 'DAILY-2026-10-19-deepseek', evidence_path: artifact.path, evidence_sha256: artifact.sha256}, artifact}}},
    ans: {date: '2026-10-19', status: 'draft_rejected', artifacts: [artifact], audit: {artifact_sha256: artifact.sha256, executed_by: 'Doubao'}}};
}
test('verified claim and submission do not promote a rejected draft to deployment or payment', () => {
  const r = verifyAnsEvidence(fixture());
  assert.equal(r.status, 'claim_submission_evidence_verified'); assert.equal(r.independent_draft_review, true);
  assert.equal(r.draft_status, 'draft_rejected'); assert.equal(r.production_deployment_verified, false);
  assert.equal(r.paid, false); assert.equal(r.tx_hash, null); assert.equal(r.new_model_calls, 0);
});
test('mismatched task, executor or run cannot count as bound recognition', () => {
  for (const [key, value] of [['task_id', 'OTHER'], ['claimed_by', 'doubao'], ['run_key', 'old:1']]) {
    const f = fixture(); f.daily.seats.deepseek.claim_receipt[key] = value;
    assert.equal(verifyAnsEvidence(f).status, 'blocked_evidence_incomplete');
  }
});
test('mismatched submission task, artifact path or digest stays blocked', () => {
  for (const key of ['task_id', 'evidence_path', 'evidence_sha256']) {
    const f = fixture(); f.daily.seats.deepseek.submission_receipt[key] = 'wrong';
    assert.equal(verifyAnsEvidence(f).status, 'blocked_evidence_incomplete');
  }
});
test('modified or missing artifact is rejected even when receipt flags claim success', () => {
  for (const read of [() => 'tampered', () => {throw Error('missing');}]) {
    const f = fixture(); f.read = read; const r = verifyAnsEvidence(f);
    assert.equal(r.status, 'blocked_evidence_incomplete'); assert.ok(r.failures.length);
  }
});
test('artifact traversal and non-result paths are rejected before reading', () => {
  for (const path of ['knowledge/results/../../.env.json', '/etc/config.json', '.secrets-local/key.json']) {
    const f = fixture(); f.ans.artifacts[0].path = path; f.read = () => {throw Error('should_not_read');};
    assert.ok(verifyAnsEvidence(f).failures.includes('invalid_artifact_path'));
  }
});
test('same provider with changed capitalisation and wrong review hash are not independent reviews', () => {
  for (const mutate of [f => f.ans.audit.executed_by = 'deepseek', f => f.ans.audit.artifact_sha256 = 'bad']) {
    const f = fixture(); mutate(f); const r = verifyAnsEvidence(f);
    assert.ok(r.failures.includes('independent_review_not_bound')); assert.equal(r.independent_draft_review, false);
  }
});
test('empty task records cannot be announced as a completed claim chain', () => {
  const f = fixture(); f.daily.seats = {}; assert.equal(verifyAnsEvidence(f).status, 'blocked_evidence_incomplete');
});
const original = () => {
  const deliverable = JSON.stringify({issues: [{id: 1}], tests: [{id: 'positive', request: {body: {action: 'deposit', amount_usdc: 1000}}}]});
  return {id: 'EXT-AI-20261017-001', status: 'paid_delivery_rejected', paid: true, delivery_accepted: false,
    tx_hash: '0x' + 'a'.repeat(64), amount_raw: '3000', deliverable, deliverable_sha256: hash(deliverable)};
};
test('original paid order remains rejected and unrefunded; contract ambiguity is recorded', () => {
  const r = verifyOriginalHire(original());
  assert.equal(r.original_payment.paid, true); assert.equal(r.original_payment.amount_raw, '3000');
  assert.equal(r.rejection_analysis.issue_id_type_mismatch, true); assert.equal(r.refund_status, 'not_verified');
  assert.equal(r.new_payments, 0); assert.equal(r.new_orders, 0); assert.equal(r.delivery_accepted, false);
  assert.equal(r.paid, false); assert.equal(r.tx_hash, null);
});
test('a different, modified, unpaid or accepted order cannot silently replace the original closeout', () => {
  for (const change of [{id: 'another'}, {status: 'accepted'}, {paid: false}, {delivery_accepted: true}, {deliverable: 'tampered'}, {tx_hash: null}]) {
    assert.throws(() => verifyOriginalHire({...original(), ...change}));
  }
});
test('fixed workflow has no cron, model/wallet credentials or main-write permission', () => {
  const source = fs.readFileSync('.github/workflows/claude-team-verify.yml', 'utf8');
  assert.match(source, /permissions: \{contents: read\}/); assert.match(source, /persist-credentials: false/);
  assert.doesNotMatch(source, /schedule:|secrets\.|contents: write|pull_request_target|ANTHROPIC_API_KEY|git push/);
});
