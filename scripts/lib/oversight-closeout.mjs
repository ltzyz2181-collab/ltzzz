import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Repository evidence attestations, not native provider signatures or remote
// claim proofs. A task's original dispatch and rejection are never rewritten.
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const commit = value => /^[a-f0-9]{40}$/.test(value || '');
const provider = value => {
  const p = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ({qianwen:'aliyundashscope',dashscope:'aliyundashscope',alibaba:'aliyundashscope',aliyun:'aliyundashscope',ark:'doubao',volcengine:'doubao',volcengineark:'doubao',bytedance:'doubao',grok:'xai',claude:'anthropic',gpt:'openai',kimi:'moonshot'})[p] || p;
};
const sameRef = (a,b) => a?.path === b?.path && a?.sha256 === b?.sha256;
const time = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
const inOrder = (earlier,later) => time(earlier) && time(later) && Date.parse(earlier) <= Date.parse(later);
const knownProviders = new Set(['aliyundashscope','doubao','deepseek','xai','anthropic','openai','repositoryrules','githubactions','moonshot','google','meta','mistral']);
const metadata = body => typeof body?.actual_provider === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(body.actual_provider) && knownProviders.has(provider(body.actual_provider)) &&
  ['provider_response','authenticated_executor_attestation','repository_executor_code'].includes(body.metadata_source) &&
  ((body.metadata_source === 'repository_executor_code' && ['repositoryrules','githubactions'].includes(provider(body.actual_provider)) && body.model === null && body.model_calls === 0) ||
   (body.metadata_source !== 'repository_executor_code' && !['repositoryrules','githubactions'].includes(provider(body.actual_provider)) && typeof body.model === 'string' && body.model.trim().length > 0 && body.model.length <= 256 && Number.isInteger(body.model_calls) && body.model_calls >= 1));

export function readBoundEvidence(root,ref) {
  if (!ref || !/^(knowledge|results|ops)\/[A-Za-z0-9_./\u4e00-\u9fff-]+\.(json|md)$/.test(ref.path || '') || ref.path.split('/').includes('..') || !/^[a-f0-9]{64}$/.test(ref.sha256 || '')) return null;
  try {
    const full = path.join(root,ref.path), realRoot = fs.realpathSync(root);
    if (fs.lstatSync(full).isSymbolicLink() || !fs.realpathSync(full).startsWith(realRoot+path.sep)) return null;
    const bytes = fs.readFileSync(full);
    if (sha(bytes) !== ref.sha256) return null;
    return {bytes,body:ref.path.endsWith('.json')?JSON.parse(bytes):null};
  } catch { return null; }
}

function nativeQwenReview(root,review,{taskId,sourceCommit,artifact,now,deliveryReceipt,nativeReceiptVerifier}) {
  // Names, JSON hashes and "provider_response" labels alone do not establish
  // provenance. The trusted executor must independently authenticate the actual
  // source run/receipt through an injected verifier; candidate files cannot do so.
  if (provider(review.actual_provider) !== 'aliyundashscope' || typeof nativeReceiptVerifier !== 'function') return false;
  const match = /^knowledge\/results\/qwen-dispatch\/([A-Z0-9][A-Z0-9_-]{6,80})\.json$/.exec(review.native_receipt?.path || '');
  if (!match || review.native_card?.path !== `ops/dispatch/queue/${match[1]}.json`) return false;
  const receiptEvidence=readBoundEvidence(root,review.native_receipt),cardEvidence=readBoundEvidence(root,review.native_card);
  const receipt=receiptEvidence?.body,card=cardEvidence?.body;
  if (!receipt || !card || receipt.task_id !== match[1] || card.id !== match[1] || card.agent !== 'qianwen' || card.original_task_id !== taskId ||
      receipt.card_sha256 !== review.native_card.sha256 || receipt.executor !== 'qianwen' || receipt.queue_dispatcher !== 'qianwen' ||
      receipt.native_qwen_call !== true || receipt.model_source !== 'provider_response' || receipt.status !== 'draft_delivered_pending_independent_review' ||
      receipt.model_calls !== 1 || !/^qwen[a-zA-Z0-9_.-]*$/.test(receipt.model || '') || receipt.generated_by_model !== receipt.model ||
      review.model !== receipt.model || review.model_calls !== receipt.model_calls || review.metadata_source !== 'provider_response' ||
      receipt.finish_reason !== 'stop' || !/^\d{1,32}$/.test(receipt.run_id || '') || !/^[A-Za-z0-9_-]{1,256}$/.test(receipt.request_id || '') ||
      typeof receipt.output !== 'string' || !receipt.output.trim() || sha(receipt.output) !== receipt.output_sha256 || receipt.error !== null ||
      receipt.financial_execution !== false || receipt.paid !== false || receipt.tx_hash !== null || receipt.accepted !== false || receipt.deployed !== false ||
      !inOrder(receipt.at,receipt.finished_at) || !inOrder(receipt.finished_at,now) || review.at_utc !== receipt.finished_at || card.real_money === true) return false;
  const subject={task_id:taskId,source_commit:sourceCommit,artifact,...(deliveryReceipt?{delivery_receipt:deliveryReceipt}:{})};
  if (JSON.stringify(card.review_subject) !== JSON.stringify(subject) || typeof card.prompt !== 'string' || !card.prompt.includes(JSON.stringify(subject))) return false;
  let verdict;
  try { verdict=JSON.parse(receipt.output.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')); } catch { return false; }
  if (verdict?.schema !== 'ltzzz.task-artifact-review.v1' || verdict.task_id !== taskId || verdict.source_commit !== sourceCommit ||
      !sameRef(verdict.artifact,artifact) || verdict.accepted !== review.accepted || typeof verdict.accepted !== 'boolean' ||
      !Array.isArray(verdict.reasons) || !verdict.reasons.length || verdict.reasons.some(r=>typeof r!=='string'||!r.trim()) ||
      (deliveryReceipt && !sameRef(verdict.delivery_receipt,deliveryReceipt))) return false;
  try {
    const verified=nativeReceiptVerifier(Object.freeze({actual_provider:'aliyun_dashscope',task_id:taskId,source_commit:sourceCommit,
      native_receipt:{...review.native_receipt},native_card:{...review.native_card},run_id:receipt.run_id,request_id:receipt.request_id,
      output_sha256:receipt.output_sha256,card_sha256:receipt.card_sha256,model:receipt.model}));
    if (verified && typeof verified.then === 'function') { Promise.resolve(verified).catch(()=>{}); return false; }
    return verified === true;
  } catch { return false; }
}

function reviewArtifact(root,ref,{taskId,sourceCommit,artifact,authorProvider,submittedAt,now,deliveryReceipt,nativeReceiptVerifier}) {
  const r = readBoundEvidence(root,ref)?.body;
  if (r?.schema !== 'ltzzz.task-artifact-review.v1' || r.task_id !== taskId || r.source_commit !== sourceCommit || !sameRef(r.artifact,artifact) ||
      typeof r.accepted !== 'boolean' || !metadata(r) || r.metadata_source === 'repository_executor_code' ||
      !provider(authorProvider) || provider(r.actual_provider) === provider(authorProvider) ||
      !inOrder(submittedAt,r.at_utc) || !inOrder(r.at_utc,now) ||
      (deliveryReceipt && !sameRef(r.delivery_receipt,deliveryReceipt))) return null;
  return {...r,native_proof_verified:nativeQwenReview(root,r,{taskId,sourceCommit,artifact,now,deliveryReceipt,nativeReceiptVerifier})};
}

export function externalReturnEvidence({root,dispatch,now,nativeReceiptVerifier}) {
  const base = {phase:'external_return_claim_missing',acceptance_reference_verified:false,submission_verified:false,independent_review_verified:false,accepted:false,
    evidence:[],actual_provider:null,model:null,claim_verified:false,claim_status:'authenticated_claim_unverified',missing_stages:['authenticated_claim'],delivery_status:'not_verified',native_generation_verified:false,scope:'repository_evidence_attestation_not_native_claim_or_production_deployment'};
  const ack = readBoundEvidence(root,dispatch.acceptance_receipt)?.body;
  if (ack?.task_id !== dispatch.task_id || ack.claimed_by !== 'qianwen' || !inOrder(dispatch.issued_at,ack.accepted_at) || !inOrder(ack.accepted_at,now)) return base;
  Object.assign(base,{phase:'external_return_delivery_missing',acceptance_reference_verified:true,evidence:[dispatch.acceptance_receipt.path]});
  if (!dispatch.delivery_receipt) return base;
  const d = readBoundEvidence(root,dispatch.delivery_receipt)?.body;
  if (d?.schema !== 'ltzzz.external-return-delivery.v1' || d.task_id !== dispatch.task_id || d.date !== dispatch.date || d.logical_seat !== 'qianwen' ||
      !sameRef(d.acceptance_receipt,dispatch.acceptance_receipt) || !commit(d.source_commit) || !/^\d+$/.test(d.run_id || '') ||
      !metadata(d) || d.delivery_kind !== 'readonly_inspection' || d.paid !== false || d.tx_hash !== null ||
      !inOrder(ack.accepted_at,d.at_utc) || !inOrder(d.at_utc,now) || !readBoundEvidence(root,d.artifact)) {
    base.phase = 'external_return_delivery_evidence_invalid'; return base;
  }
  Object.assign(base,{phase:'external_return_review_missing',submission_verified:true,submission_scope:'repository_bound_delivery_only',delivery_status:'partial_delivery_pending_review',actual_provider:d.actual_provider,model:d.model,
    source_commit:d.source_commit,run_id:d.run_id,evidence:[...base.evidence,dispatch.delivery_receipt.path,d.artifact.path]});
  if (!dispatch.review_receipt) return base;
  const r = reviewArtifact(root,dispatch.review_receipt,{taskId:dispatch.task_id,sourceCommit:d.source_commit,artifact:d.artifact,authorProvider:d.actual_provider,submittedAt:d.at_utc,now,deliveryReceipt:dispatch.delivery_receipt,nativeReceiptVerifier});
  if (!r || r.paid !== false || r.tx_hash !== null) { base.phase = 'external_return_review_evidence_invalid'; return base; }
  if (!r.native_proof_verified) {
    base.phase='external_return_native_review_unverified';base.delivery_status='partial_delivery_native_review_unverified';
    base.missing_stages.push('authenticated_native_review');return base;
  }
  // The existing acknowledgement contract carries no independently verified
  // claim proof. Reviewing an artifact cannot silently close that missing stage.
  Object.assign(base,{phase:r.accepted?'external_return_reviewed_delivery_claim_unverified':'external_return_revision_required',delivery_status:r.accepted?'partial_reviewed_delivery':'revision_required',independent_review_verified:true,accepted:r.accepted,
    reviewer_actual_provider:r.actual_provider,evidence:[...base.evidence,dispatch.review_receipt.path]});
  return base;
}

// A rejected proposal's review cannot approve a subsequent implementation.
// Require a new distinct-provider review of the closeout artifact, and bind the
// closeout to the exact original proposal in addition to its existing test/PR proof.
export function ansCloseoutReview({root,closeout,taskId,originalArtifact,now,nativeReceiptVerifier}) {
  if (!closeout || closeout.task_id !== taskId || !sameRef(closeout.original_artifact,originalArtifact) || !readBoundEvidence(root,originalArtifact) ||
      !metadata(closeout) || closeout.paid !== false || closeout.tx_hash !== null || !time(closeout.at_utc) || !inOrder(closeout.at_utc,now)) return null;
  const r = reviewArtifact(root,closeout.review,{taskId,sourceCommit:closeout.source_commit,artifact:closeout.artifact,authorProvider:closeout.actual_provider,submittedAt:closeout.at_utc,now,nativeReceiptVerifier});
  if (r?.accepted !== true || r.native_proof_verified !== true || r.paid !== false || r.tx_hash !== null) return null;
  return {review:closeout.review,native_receipt:r.native_receipt,native_card:r.native_card,actual_provider:closeout.actual_provider,reviewer_actual_provider:r.actual_provider,scope:'native_review_bound_repository_execution_not_production_deployment'};
}
