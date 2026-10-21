// Reviews approve one exact subject. Reviewers do not administer permissions.
// This proof is not a wallet signature, reservation or production deployment.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const provider = value => ({deepseek:'deepseek',doubao:'doubao',ark:'doubao',volcengine:'doubao',gpt:'openai',openai:'openai',claude:'anthropic',anthropic:'anthropic',grok:'xai',xai:'xai',kimi:'moonshot',moonshot:'moonshot',qianwen:'dashscope',qwen:'dashscope',dashscope:'dashscope'})[String(value || '').trim().toLowerCase()] || null;
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
export const reviewSubjectHash = (operation, subject) => sha256(JSON.stringify(stable({operation, subject})));

export function readReceipt(rootDir, reference) {
  if (!reference || typeof reference.path !== 'string' || !hash(reference.sha256)) throw Error('review_reference_required');
  const relative = reference.path;
  if (!/^(knowledge\/results|results)\//.test(relative) || relative.includes('\\') || relative.split('/').includes('..')) throw Error('review_receipt_path_invalid');
  const root = fs.realpathSync(rootDir), file = fs.realpathSync(path.resolve(root, relative));
  if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) throw Error('review_receipt_outside_repository');
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== reference.sha256) throw Error('review_receipt_hash_mismatch');
  return JSON.parse(bytes);
}

export function reviewApproval({rootDir = process.cwd(), operation, subject, reference}) {
  const base = {human_confirmation_required: false, permissions_changed: false, spending_authorized: false,
    paid: false, tx_hash: null, approval_source: 'independent_executor_review',
    subject_sha256: reviewSubjectHash(operation, subject)};
  try {
    if (!['video_publication', 'memory_promotion'].includes(operation)) throw Error('operation_not_connected_to_review_executor');
    const r = readReceipt(rootDir, reference);
    if (!/^\d{6,}$/.test(String(r.run_id || '')) || !/^[a-f0-9]{40}$/.test(r.source_commit || '')) throw Error('review_execution_provenance_missing');
    const artifacts = Array.isArray(r.artifacts) ? r.artifacts : [];
    const workers = artifacts.filter(a => a.role === 'worker'), reviewers = artifacts.filter(a => a.role === 'reviewer');
    if (workers.length !== 1 || reviewers.length !== 1) throw Error('one_worker_and_reviewer_required');
    const [worker] = workers, [reviewer] = reviewers;
    for (const a of [worker, reviewer]) {
      if (!provider(a.executed_by)) throw Error('unrecognized_actual_provider');
      if (typeof a.text !== 'string' || !hash(a.sha256) || sha256(a.text) !== a.sha256 || !a.model || !a.executed_by) throw Error('review_artifact_integrity_failed');
      if (!Array.isArray(r.calls) || !r.calls.some(c => c.status === 'success' && ['stop', 'end_turn'].includes(c.finish_reason)
        && provider(c.executed_by) === provider(a.executed_by) && c.model === a.model)) throw Error('complete_provider_call_evidence_required');
    }
    if (provider(worker.executed_by) === provider(reviewer.executed_by)) throw Error('same_actual_provider_cannot_self_review');
    const input = JSON.parse(worker.text), verdict = JSON.parse(reviewer.text);
    if (input.operation !== operation || input.subject_sha256 !== base.subject_sha256
      || reviewSubjectHash(operation, input.subject) !== base.subject_sha256) throw Error('review_worker_subject_mismatch');
    if (verdict.operation !== operation || verdict.subject_sha256 !== base.subject_sha256
      || verdict.artifact_sha256 !== worker.sha256 || typeof verdict.accepted !== 'boolean'
      || !Array.isArray(verdict.reasons) || !verdict.reasons.length
      || verdict.reasons.some(reason => typeof reason !== 'string' || !reason.trim())) throw Error('bound_review_verdict_required');
    const proof = {path: reference.path, sha256: reference.sha256, run_id: String(r.run_id), source_commit: r.source_commit,
      prescreen_provider: worker.executed_by, reviewer_provider: reviewer.executed_by, reviewer_model: reviewer.model,
      worker_artifact_sha256: worker.sha256, reviewer_artifact_sha256: reviewer.sha256};
    return {...base, ok: verdict.accepted, status: verdict.accepted ? 'review_approved' : 'revision_required',
      reasons: verdict.reasons, unverified: verdict.unverified || [], proof};
  } catch (error) {
    const code = /^[a-z_]+$/.test(error.message) ? error.message : 'review_receipt_unavailable_or_invalid';
    return {...base, ok: false, status: 'pending_review', reason: code};
  }
}
