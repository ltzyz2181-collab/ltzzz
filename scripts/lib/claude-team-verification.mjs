import {createHash} from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');

// Evidence is inspected as data; model prose is never executed or used as acceptance.
export function verifyAnsEvidence({daily, ans, read}) {
  const failures = [];
  const check = artifact => {
    if (!artifact || !/^knowledge\/results\/[A-Za-z0-9_./-]+\.json$/.test(artifact.path || '') || artifact.path.split('/').includes('..')) { failures.push('invalid_artifact_path'); return; }
    try { if (hash(read(artifact.path)) !== artifact.sha256) failures.push('artifact_hash_mismatch:' + artifact.path); }
    catch { failures.push('artifact_unavailable:' + artifact.path); }
  };
  const seats = Object.entries(daily?.seats || {}).map(([agent, seat]) => {
    if (seat.submission_verified) check(seat.artifact);
    const claimBound = seat.claim_verified === true && seat.claim_receipt?.task_id === seat.assignment?.id && seat.claim_receipt?.claimed_by === agent && seat.claim_receipt?.run_key === daily.run_key;
    const submissionBound = seat.submission_verified === true && seat.submission_receipt?.task_id === seat.assignment?.id && seat.submission_receipt?.evidence_path === seat.artifact?.path && seat.submission_receipt?.evidence_sha256 === seat.artifact?.sha256;
    return {agent, task_id: seat.assignment?.id, status: seat.status, claim_bound: claimBound, submission_bound: submissionBound,
      accepted: seat.accepted === true, deployed: seat.deployed === true, paid: seat.paid === true};
  });
  for (const artifact of ans?.artifacts || []) check(artifact);
  const providers = [ans?.artifacts?.find(a => a.role === 'worker')?.executed_by, ans?.audit?.executed_by];
  const independent = providers.every(Boolean) && providers[0].toLowerCase() !== providers[1].toLowerCase();
  const binding = ans?.audit?.artifact_sha256 === ans?.artifacts?.find(a => a.role === 'worker')?.sha256;
  if (ans?.audit && (!independent || !binding)) failures.push('independent_review_not_bound');
  const chainVerified = seats.length > 0 && seats.every(s => s.claim_bound && s.submission_bound) && failures.length === 0;
  return {task_id: 'CONTROL-CLAIM-REPAIR-20261018', subtask: 'ANS-CLAIM-CLOSEOUT',
    scope: 'checked_in_receipts_and_artifact_bytes_not_live_replay', status: chainVerified ? 'claim_submission_evidence_verified' : 'blocked_evidence_incomplete',
    daily_date: daily?.date, ans_date: ans?.date, seats, failures,
    independent_draft_review: independent && binding && failures.length === 0,
    draft_status: ans?.status, production_deployment_verified: false,
    reason: 'PR136 fixed ID mapping; checked-in claim/submission evidence is separate from draft acceptance, deployment and native external team acceptance.',
    new_model_calls: 0, financial_execution: false, paid: false, tx_hash: null};
}

export function verifyOriginalHire(order, {inspectionPath, inspectionHash} = {}) {
  if (order?.id !== 'EXT-AI-20261017-001' || order.status !== 'paid_delivery_rejected' || order.paid !== true || order.delivery_accepted !== false) throw Error('original_rejected_order_required');
  if (!/^0x[a-f0-9]{64}$/i.test(order.tx_hash || '')) throw Error('original_payment_hash_required');
  if (typeof order.deliverable !== 'string' || hash(order.deliverable) !== order.deliverable_sha256) throw Error('original_deliverable_hash_mismatch');
  const artifact = JSON.parse(order.deliverable.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, ''));
  const idMismatch = artifact.issues?.some(issue => typeof issue.id !== 'string');
  return {task_id: 'AI-HIRE-CLOSEOUT-EXT-AI-20261017-001', order_id: order.id,
    status: 'blocked_provider_remedy_or_refund_evidence_required', inspection_path: inspectionPath, inspection_sha256: inspectionHash,
    original_payment: {paid: true, asset: 'USDC', chain_id: 8453, amount_raw: order.amount_raw, tx_hash: order.tx_hash},
    delivery_accepted: false, deliverable_sha256: order.deliverable_sha256,
    rejection_analysis: {scope: 'local_structural_check_not_new_independent_model_audit',
      issue_id_type_mismatch: idMismatch === true,
      contract_ambiguity: 'Stored validator requires string issue IDs; the purchase prompt did not specify the ID type. Review this mismatch before attributing fault or requesting a refund.',
      unexecuted_test_examples: artifact.tests?.map(t => ({id: t.id, action: t.request?.body?.action, amount_usdc: t.request?.body?.amount_usdc}))},
    independent_review_status: order.independent_review_status,
    refund_status: 'not_verified', remedy_status: 'not_requested_by_this_verifier',
    next_action: 'Use the original payment and delivery hashes to request correction or a documented refund from the same provider. Do not create another purchase.',
    new_orders: 0, new_model_calls: 0, new_payments: 0, financial_execution: false, paid: false, tx_hash: null};
}
