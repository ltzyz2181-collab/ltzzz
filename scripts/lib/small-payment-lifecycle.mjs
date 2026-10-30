// Deterministic lifecycle, no keys, network, approvals by identity or transfer code.
import {canonical,sha256} from './patchgate.mjs';
import {paymentPolicyDigest, paymentActivationSubject, PAYMENT_COOLDOWN_MS, PAYMENT_PROMOTION_COUNT,controllerPaymentMode} from './small-payment-authorization.mjs';
const H = /^[a-f0-9]{64}$/, SHA = /^[a-f0-9]{40}$/;
export const PAYMENT_REPOSITORY = 'ltzyz2181-collab/ltzzz';
export const activationPath = digest => 'knowledge/results/payments/activation/' + digest + '.json';
export const publicActivationBytes = record => canonical(record) + '\n';

export function freezePaymentState(state, reason, now) {
  state.switch_enabled = false;
  state.frozen = true;
  state.freeze_reason = reason;
  state.freeze_release_sha256 = state.activation?.release_sha256 ?? state.pending_activation?.record.subject.release_sha256 ?? null;
  state.freeze_sequence++;
  state.events.push({kind: 'automatic_freeze', reason, freeze_sequence: state.freeze_sequence, at_utc: new Date(now).toISOString()});
}

export function paymentQualification(state) {
  const rows = Object.values(state.operations).sort((a, b) => a.ordinal - b.ordinal);
  const current = rows.filter(o => o.activation_sha256 === state.activation?.sha256);
  let consecutive = 0;
  for (const o of current) {
    if (o.status === 'paid_audited' && o.receipt?.paid === true && o.audit?.verdict === 'approve'
        && o.audit?.verified === true && o.audit_was_anomalous !== true
        && Date.parse(o.receipt_verified_at) <= Date.parse(o.receipt_due_at)
        && Date.parse(o.audit_verified_at) <= Date.parse(o.audit_due_at)) consecutive++;
    else consecutive = 0;
  }
  const unresolved = rows.some(o => o.status !== 'paid_audited' || !o.receipt || o.audit?.verdict !== 'approve');
  return {consecutive, unresolved, sha256: paymentPolicyDigest(rows.map(o => ({payment_id: o.request.payment_id,
    activation_sha256: o.activation_sha256, ordinal: o.ordinal, status: o.status,
    receipt_sha256: paymentPolicyDigest(o.receipt), audit_sha256: paymentPolicyDigest(o.audit),
    receipt_verified_at: o.receipt_verified_at ?? null, audit_verified_at: o.audit_verified_at ?? null,
    audit_was_anomalous: o.audit_was_anomalous === true})))};
}

export function paymentLifecycleCommand(state, {kind, target_stage}, {policy, release_sha256, authority, now}) {
  if (!['activate', 'promote', 'unfreeze'].includes(kind) || !Number.isSafeInteger(target_stage) || target_stage < 0 || target_stage > 3) throw Error('invalid_payment_lifecycle_command');
  const q = paymentQualification(state), old = state.activation;
  if (q.unresolved) throw Error('unresolved_payment_reconciliation_required');
  if (kind === 'activate' && (old || state.frozen || target_stage !== 0)) throw Error('initial_activation_starts_at_ten_percent');
  if (kind === 'promote' && (!old || state.frozen || state.switch_enabled !== true || now < old.ready_at
      || old.release_sha256 !== release_sha256 || old.policy_sha256 !== paymentPolicyDigest(policy)
      || old.authority_sha256 !== paymentPolicyDigest(authority) || target_stage !== old.command.target_stage + 1
      || q.consecutive < PAYMENT_PROMOTION_COUNT)) throw Error('ten_consecutive_audited_payments_before_one_step_promotion');
  if (kind === 'unfreeze' && (state.release_history.includes(release_sha256) || !state.frozen || target_stage !== 0 || (state.freeze_release_sha256 ?? old?.release_sha256 ?? state.pending_activation?.record.subject.release_sha256) === release_sha256)) throw Error('unfreeze_requires_new_release_and_ten_percent_restart');
  return {schema: 'ltzzz.small-payment.lifecycle-command.v1', kind, target_stage,
    previous_activation_sha256: old?.sha256 ?? null, freeze_sequence: state.freeze_sequence, qualification_sha256: q.sha256};
}

export function activationRecord({policy, release_sha256, authority, command, evidence, now}) {
  return {schema: 'ltzzz.small-payment.public-activation.v1',
    subject: paymentActivationSubject({policy, release_sha256, authority, command}), command,
    authorized_at_utc: new Date(now).toISOString(), minimum_cooldown_ms: PAYMENT_COOLDOWN_MS,
    evidence: controllerPaymentMode(authority)?{controller_decision:structuredClone(evidence.controller_decision)}:{reviews: structuredClone(evidence.reviews)}};
}

export function publicActivationReadback(publication, readback, expectedBytes) {
  const digest = paymentPolicyDigest(JSON.parse(expectedBytes));
  if (publication?.repository !== PAYMENT_REPOSITORY || publication.path !== activationPath(digest)
      || !SHA.test(publication.source_commit || '') || readback?.repository !== publication.repository
      || readback?.path !== publication.path || readback?.source_commit !== publication.source_commit
      || readback?.content !== expectedBytes || readback?.http_status !== 200) throw Error('immutable_public_activation_readback_required');
  return {repository: publication.repository, path: publication.path, source_commit: publication.source_commit,
    content_sha256:sha256(expectedBytes),record_sha256:digest};
}

export function lifecycleAllowsPayment(state, {policy, release_sha256, authority, now}) {
  const a = state.activation;
  return state.switch_enabled === true && state.frozen === false && state.pending_activation === null
    && a && H.test(a.sha256 || '') && paymentPolicyDigest(a.record) === a.sha256
    && a.publication?.repository === PAYMENT_REPOSITORY && a.publication.path === activationPath(a.sha256)
    && SHA.test(a.publication.source_commit || '') && a.publication.record_sha256 === a.sha256 && a.publication.content_sha256 === sha256(publicActivationBytes(a.record))
    && Number.isSafeInteger(a.public_confirmed_at) && Number.isSafeInteger(a.ready_at)
    && a.ready_at >= a.public_confirmed_at + PAYMENT_COOLDOWN_MS && now >= a.ready_at
    && a.release_sha256 === release_sha256 && a.policy_sha256 === paymentPolicyDigest(policy)
    && a.authority_sha256 === paymentPolicyDigest(authority) && a.record.subject.authority_sha256 === a.authority_sha256
    && a.record.subject.release_sha256 === release_sha256 && a.record.subject.policy_sha256 === paymentPolicyDigest(policy)
    && canonical(a.command) === canonical(a.record.command);
}
