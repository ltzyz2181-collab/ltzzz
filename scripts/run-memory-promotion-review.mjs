// LTZZZ · 记忆晋升评审执行器
// 目的：补上 #memory_promotion 缺失的"双 provider 真实调用 → 可校验回执"执行器。
// 约束：
//   1. worker 与 reviewer 必须是不同实际 provider（review-approval 强制）。
//   2. subject_sha256 由本脚本计算后写入 prompt，并校验 provider 回填值与计算值一致
//      （LLM 会抄错常量，不能信任它自由生成）。
//   3. 回执写入 knowledge/results/memory-promotion/，随后由 reviewApproval 复验；
//      复验不通过则不写 review_reference，绝不伪造通过。
//   4. 不签不发交易，不涉及资金。
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {reviewApproval, reviewSubjectHash, sha256} from '../scripts/lib/review-approval.mjs';
import {substantiveClaim} from '../tools/memory-candidate-quality.mjs';
import {memorySubject, applyReviewedMemory} from '../tools/reviewed-memory.mjs';

const OPERATION = 'memory_promotion';

function parseJsonBlock(text) {
  if (typeof text !== 'string') throw Error('provider_text_missing');
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw Error('provider_json_missing');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// worker：把候选原文交给 provider，要求原样回填常量
function workerPrompt(item, subject, subjectSha) {
  return [
    '你是记忆晋升评审的「提交方」。任务是把一条候选记忆整理成提交给评审方的输入包。',
    '必须输出一个 JSON 对象，且只能包含这三个字段：operation、subject_sha256、subject。',
    `operation 必须是字符串 "${OPERATION}"。`,
    `subject_sha256 必须是字符串 "${subjectSha}"，逐字符照抄，不得改动任何一位。`,
    'subject 必须原样照抄下面给定的对象，不得增删改任何字段或内容：',
    JSON.stringify(subject),
    '只输出 JSON，不要解释，不要 Markdown 代码围栏。'
  ].join('\n');
}

// reviewer：必须独立判断，不能默认接受
function reviewerPrompt(item, workerText, subjectSha, workerSha) {
  return [
    '你是记忆晋升评审的「独立评审方」，与提交方是不同厂商。',
    '请判断这条候选记忆是否应当晋升进长期记忆。判断依据：',
    '1. 它是否是可持续复用的实质事实，而不是某次操作的过程元数据；',
    '2. 它是否与已载事实冲突，或只是对已载内容的同义重述；',
    '3. 它的措辞是否把"未验证的推断"写成了"已证实的事实"。',
    '若只是重复已有的日常观察（例如每天相同的 Pulse 存活记录、相同的"待补"清单），应判定不通过并说明理由。',
    '',
    '待评审的提交包（提交方原文，逐字符保留）：',
    workerText,
    '',
    '必须输出一个 JSON 对象，字段为：operation、subject_sha256、artifact_sha256、accepted、reasons、unverified。',
    `operation 必须是 "${OPERATION}"。`,
    `subject_sha256 必须是 "${subjectSha}"，逐字符照抄。`,
    `artifact_sha256 必须是 "${workerSha}"，逐字符照抄（这是提交包的哈希）。`,
    'accepted 必须是布尔值 true 或 false，按你的真实判断，不要为了省事填 true。',
    'reasons 必须是非空字符串数组，说明你的判定理由。',
    'unverified 是字符串数组，列出你无法核实而只能采信的部分（可为空数组）。',
    '只输出 JSON，不要解释，不要 Markdown 代码围栏。'
  ].join('\n');
}

// 返回 artifact 或抛出明确错误
// 注意：官方校验器读的字段名是 executed_by，不是 provider
function artifactOf({role, provider, model, text}) {
  return {role, executed_by: String(provider), model: String(model), text: String(text), sha256: sha256(String(text))};
}

async function callProvider(callAgent, apiKey, prompt) {
  const r = await callAgent({apiKey, prompt, maxTokens: 4000, thinking: 'disabled'});
  if (!r || r.ok !== true || typeof r.output !== 'string' || !r.output.trim()) {
    throw Error('provider_call_failed:' + String((r && (r.status || r.error)) || 'unknown'));
  }
  if (!['stop', 'end_turn'].includes(String(r.finish_reason))) {
    throw Error('provider_finish_reason_not_complete:' + String(r.finish_reason));
  }
  return r;
}

/**
 * 对单条候选做一次真实双 provider 评审，产出回执并校验。
 * @returns {{id, accepted, receipt_path?, receipt_sha256?, reason?}}
 */
export async function reviewOneCandidate(item, {
  rootDir = process.cwd(),
  runId,
  sourceCommit,
  worker,        // {provider, model, apiKey, callAgent}
  reviewer,      // {provider, model, apiKey, callAgent}
  dryRun = false
} = {}) {
  const id = item.id;

  // 前置质量门：沿用既有口径，不放松
  if (item.status !== 'candidate') return {id, accepted: false, reason: 'not_a_candidate'};
  if (item.eligible_for_promotion === false || item.content_quality === 'operational_metadata') {
    return {id, accepted: false, reason: 'candidate_quality_unresolved'};
  }
  if (!substantiveClaim(item.claim || '')) return {id, accepted: false, reason: 'not_substantive_claim'};
  if (!Array.isArray(item.conflicts) || item.conflicts.length) {
    return {id, accepted: false, reason: 'candidate_quality_or_conflict_unresolved'};
  }
  if (!/^memory\/daily\/[A-Za-z0-9_.-]+\.md$/.test(item.source || '')) {
    return {id, accepted: false, reason: 'candidate_source_invalid'};
  }
  // 源文件必须存在且哈希未变
  const root = fs.realpathSync(rootDir);
  const sourcePath = path.resolve(root, item.source);
  if (!fs.existsSync(sourcePath)) return {id, accepted: false, reason: 'candidate_source_unavailable'};
  if (sha256(fs.readFileSync(sourcePath)) !== item.source_sha256) {
    return {id, accepted: false, reason: 'candidate_source_changed'};
  }

  const subject = memorySubject(item);
  const subjectSha = reviewSubjectHash(OPERATION, subject);

  // ---- worker（提交方）----
  const workerRes = await callProvider(worker.callAgent, worker.apiKey, workerPrompt(item, subject, subjectSha));
  const workerArtifact = artifactOf({
    role: 'worker', provider: worker.provider, model: workerRes.model || worker.model, text: workerRes.output
  });

  // 常量回填必须逐字符一致
  const workerJson = parseJsonBlock(workerArtifact.text);
  if (workerJson.operation !== OPERATION) return {id, accepted: false, reason: 'worker_operation_mismatch'};
  if (workerJson.subject_sha256 !== subjectSha) return {id, accepted: false, reason: 'worker_subject_sha_mismatch'};
  if (reviewSubjectHash(OPERATION, workerJson.subject) !== subjectSha) return {id, accepted: false, reason: 'worker_subject_content_mismatch'};

  // ---- reviewer（评审方，不同 provider）----
  const reviewerRes = await callProvider(
    reviewer.callAgent, reviewer.apiKey,
    reviewerPrompt(item, workerArtifact.text, subjectSha, workerArtifact.sha256)
  );
  const reviewerArtifact = artifactOf({
    role: 'reviewer', provider: reviewer.provider, model: reviewerRes.model || reviewer.model, text: reviewerRes.output
  });

  const verdict = parseJsonBlock(reviewerArtifact.text);
  if (verdict.operation !== OPERATION) return {id, accepted: false, reason: 'verdict_operation_mismatch'};
  if (verdict.subject_sha256 !== subjectSha) return {id, accepted: false, reason: 'verdict_subject_sha_mismatch'};
  if (verdict.artifact_sha256 !== workerArtifact.sha256) return {id, accepted: false, reason: 'verdict_artifact_sha_mismatch'};
  if (typeof verdict.accepted !== 'boolean') return {id, accepted: false, reason: 'verdict_accepted_not_boolean'};
  if (!Array.isArray(verdict.reasons) || !verdict.reasons.length
    || verdict.reasons.some(r => typeof r !== 'string' || !r.trim())) {
    return {id, accepted: false, reason: 'verdict_reasons_invalid'};
  }

  const calls = [
    {status: 'success', finish_reason: String(workerRes.finish_reason), executed_by: worker.provider, model: workerArtifact.model},
    {status: 'success', finish_reason: String(reviewerRes.finish_reason), executed_by: reviewer.provider, model: reviewerArtifact.model}
  ];

  const receipt = {
    schema_version: 1,
    run_id: String(runId),
    source_commit: String(sourceCommit),
    operation: OPERATION,
    candidate_id: id,
    created_at: new Date().toISOString(),
    read_only: false,
    paid: false,
    tx_hash: null,
    artifacts: [workerArtifact, reviewerArtifact],
    calls,
    usage: {
      worker_tokens: workerRes.tokens_used || 0,
      reviewer_tokens: reviewerRes.tokens_used || 0,
      model_calls: 2
    }
  };

  if (dryRun) {
    return {id, accepted: verdict.accepted, reason: 'dry_run_no_receipt_written', worker_sha256: workerArtifact.sha256};
  }

  const relPath = `knowledge/results/memory-promotion/review-${runId}-${id}.json`;
  const absPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(absPath), {recursive: true});
  fs.writeFileSync(absPath, JSON.stringify(receipt, null, 2) + '\n');
  const receiptSha = sha256(fs.readFileSync(absPath));

  // 用官方校验器复验：不复验通过就绝不写 review_reference
  const approval = reviewApproval({
    rootDir,
    operation: OPERATION,
    subject,
    reference: {path: relPath, sha256: receiptSha}
  });

  if (!approval.proof) {
    return {id, accepted: false, reason: 'receipt_rejected_by_official_validator:' + String(approval.reason || 'unknown')};
  }
  if (!approval.ok) {
    // 评审真实地拒绝了这条候选，回执依然保留为证据
    return {id, accepted: false, reason: 'reviewer_declined', receipt_path: relPath, receipt_sha256: receiptSha, reviewer_reasons: verdict.reasons};
  }

  return {
    id,
    accepted: true,
    receipt_path: relPath,
    receipt_sha256: receiptSha,
    reviewer_reasons: verdict.reasons,
    worker_provider: worker.provider,
    reviewer_provider: reviewer.provider,
    model_calls: 2
  };
}

/** 写回 queue.json 的 review_reference，并调用官方 applyReviewedMemory 落章 */
export function applyResults(rootDir, {applied, dryRun = false} = {}) {
  const queuePath = path.join(rootDir, 'memory/promote/queue.json');
  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  for (const r of applied) {
    if (!r.accepted || !r.receipt_path) continue;
    const item = (queue.items || []).find(i => i.id === r.id);
    if (!item) continue;
    item.review_reference = {path: r.receipt_path, sha256: r.receipt_sha256};
  }
  if (dryRun) return {applied: [], queue};
  const result = applyReviewedMemory(queue, {rootDir});
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n');
  return result;
}
