// Ephemeral OFFLINE test signers only. No production keys or upstream model calls.
import {generateKeyPairSync, sign, createHash} from 'node:crypto';
import {canonical} from '../lib/patchgate.mjs';
import {paymentActivationSubject, paymentAnomalySubject, verifySmallPaymentActivation} from '../lib/small-payment-authorization.mjs';
const pairs = ['aliyun_dashscope', 'volcengine_ark', 'deepseek'].map(id => ({id, ...generateKeyPairSync('ed25519')}));
const H = 'd'.repeat(64);
export function signatureFixture({policy, release_sha256, command = null, now = Date.parse('2026-10-27T03:00:00Z')}) {
  policy = structuredClone(policy);
  const start = new Date(now - 86400000).toISOString(), end = new Date(now + 30 * 86400000).toISOString();
  const rows = pairs.map((p, i) => ({id: 'offline-' + p.id, provider: p.id, executor: 'offline-executor-' + p.id,
    enabled: true, roles: i < 2 ? ['payment_policy_review', 'payment_anomaly'] : ['payment_anomaly'],
    public_key_pem: p.publicKey.export({type: 'spki', format: 'pem'}), not_before: start, not_after: end,
    allowed_signer_source_sha256: [H], source_deployment_verified: true,
    cloud_account_binding: 'offline-fixture-' + p.id, deployment_evidence_sha256: H}));
  const authority = {schema: 'ltzzz.small-payment.activation-authority.v1', enabled: true,
    trust: {schema_version: 1, enabled: true, source_binding_required: true, keys: rows},
    registry: {schema_version: 1, repository: 'ltzyz2181-collab/ltzzz', executors: rows.map(k => ({id: k.executor,
      provider: k.provider, roles: k.roles, signing_enabled: true, signing_key_ids: [k.id],
      source_deployment_verified: true, allowed_signer_source_sha256: [H], cloud_account_binding: k.cloud_account_binding,
      deployment_evidence_sha256: H}))}};
  const subject = paymentActivationSubject({policy, release_sha256, authority, command});
  const signPayload = (index, payload) => ({key_id: rows[index].id, payload,
    signature: sign(null, Buffer.from(canonical(payload)), pairs[index].privateKey).toString('base64')});
  const nativePayload = (index, subject, at, verdict) => {
    const k = rows[index], output = JSON.stringify({verdict, scope: 'offline synthetic fixture only'});
    const payload = {schema: verdict === 'approve' ? 'ltzzz.small-payment.native-review.v1' : 'ltzzz.small-payment.native-anomaly.v1',
      role: verdict === 'approve' ? 'payment_policy_review' : 'payment_anomaly', subject, at_utc: new Date(at).toISOString(),
      provider: k.provider, executor: k.executor, metadata_source: 'provider_response', generation_verified: true,
      finish_reason: 'stop', model: 'offline-' + k.provider, request_id: 'offline-request-' + index, verdict,
      output_sha256: createHash('sha256').update(output).digest('hex'), signer_source_sha256: H,
      signer_cloud_account_binding: k.cloud_account_binding, signer_deployment_evidence_sha256: H};
    return {output, payload, index};
  };
  const reviews = [0, 1].map(i => nativePayload(i, subject, now, 'approve'));
  return {authority, subject, signPayload, reviews, makeEvidence: (at = now, nextCommand = command) => ({reviews: [0, 1].map(i => {
    const r = nativePayload(i, paymentActivationSubject({policy, release_sha256, authority, command: nextCommand}), at, 'approve');
    return {output: r.output, attestation: signPayload(i, r.payload)};
  })}), makeAnomaly: ({activation_sha256, freeze_sequence, at = now, index = 2}) => {
    const r = nativePayload(index, paymentAnomalySubject({policy, release_sha256, authority, activation_sha256, freeze_sequence}), at, 'anomaly');
    return {output: r.output, attestation: signPayload(index, r.payload)};
  }};
}
export async function offlineActivation({policy, release_sha256, now}) {
  const f = signatureFixture({policy, release_sha256, now});
  return verifySmallPaymentActivation({policy, release_sha256, authority: f.authority, evidence: f.makeEvidence(), now});
}
