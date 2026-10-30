// Public verification only: no owner key, private key, provider call or key enrollment.
import {authenticate, canonical, sha256} from './patchgate.mjs';
import {validateExecutorRegistry} from './patchgate-a2.mjs';
import {CONTROLLER_MODE,controllerDecisionMatches,controllerDecisionEvidence,controllerDecisionValidUntil} from './controller-decision.mjs';

export const PAYMENT_REVIEW_PROVIDERS = Object.freeze(['aliyun_dashscope', 'volcengine_ark']);
export const PAYMENT_COOLDOWN_MS = 86_400_000;
export const PAYMENT_STAGE_PERCENT = Object.freeze([10, 25, 50, 100]);
export const PAYMENT_PROMOTION_COUNT = 10;
const MODEL_PROVIDERS = new Set(['anthropic', 'aliyun_dashscope', 'volcengine_ark', 'deepseek', 'xai', 'openai', 'moonshot']);
const H = /^[a-f0-9]{64}$/;
const proofs = new WeakMap();
export const paymentPolicyDigest = value => sha256(canonical(value));
export const controllerPaymentMode=authority=>authority?.authorization_mode===CONTROLLER_MODE;

function registeredAuthority(authority, now,policy) {
  if(policy?.independent_reviews?.mode!==undefined&&!['independent_signers',CONTROLLER_MODE].includes(policy.independent_reviews.mode))throw Error('invalid_payment_policy_authorization_mode');
  if(controllerPaymentMode(authority)){
    if(!Number.isSafeInteger(now)||authority.schema!=='ltzzz.small-payment.activation-authority.v1'||authority.enabled!==true
      ||authority.required_role!=='payment_policy_decision'||!Array.isArray(authority.controller_ids)||!authority.controller_ids.length
      ||new Set(authority.controller_ids).size!==authority.controller_ids.length||authority.trust!==null||authority.registry!==null
      ||canonical(authority.required_providers)!=='[]'||policy?.independent_reviews?.mode!==CONTROLLER_MODE
      ||canonical(policy.independent_reviews.required_providers)!=='[]'
      ||authority.controller_ids.some(id=>!policy.controllers?.some(c=>c.id===id&&c.verified===true&&c.control_verified===true)))throw Error('registered_authenticated_payment_controller_required');
    return;
  }
  if(authority?.authorization_mode!==undefined&&authority.authorization_mode!=='independent_signers')throw Error('invalid_payment_authorization_mode');
  if (!Number.isSafeInteger(now) || authority?.schema !== 'ltzzz.small-payment.activation-authority.v1'
      || authority.enabled !== true || authority.trust?.source_binding_required !== true
      || !validateExecutorRegistry({registry: authority.registry, trust: authority.trust})) {
    throw Error('registered_native_payment_review_authority_required');
  }
}

export function paymentActivationSubject({policy, release_sha256, authority, command = null}) {
  if (!H.test(release_sha256 || '')) throw Error('payment_release_digest_required');
  return {task_id: 'PLAN-PATCHGATE-ESCROW-20261023', scope: 'base_usdc_small_payment_activation',
    policy_sha256: paymentPolicyDigest(policy), release_sha256, authority_sha256: paymentPolicyDigest(authority),
    lifecycle_command_sha256: paymentPolicyDigest(command)};
}

function nativeResult(result, proof, verdict) {
  const v = proof.payload;
  if (v.provider !== proof.provider || v.executor !== proof.executor || v.metadata_source !== 'provider_response'
      || v.generation_verified !== true || v.finish_reason !== 'stop' || typeof v.model !== 'string' || !v.model
      || typeof v.request_id !== 'string' || !v.request_id || v.verdict !== verdict
      || typeof result.output !== 'string' || sha256(result.output) !== v.output_sha256) {
    throw Error('complete_native_response_signature_binding_required');
  }
  let output;
  try { output = JSON.parse(result.output); } catch { throw Error('structured_native_verdict_required'); }
  if (output?.verdict !== verdict) throw Error('signed_native_output_verdict_mismatch');
}

export function verifySmallPaymentActivation({policy, release_sha256, authority, evidence, command = null, controllerDecision,now = Date.now()} = {}) {
  registeredAuthority(authority, now,policy);
  const subject = paymentActivationSubject({policy, release_sha256, authority, command});
  if(controllerPaymentMode(authority)){
    if(!command||!['activate','promote','unfreeze'].includes(command.kind)||!Number.isSafeInteger(command.target_stage)||command.target_stage<0||command.target_stage>3
      ||!controllerDecisionMatches(controllerDecision,{subject,now}))throw Error('authenticated_bound_payment_controller_decision_required');
    const decision=controllerDecisionEvidence(controllerDecision);
    if(!authority.controller_ids.includes(decision.controller_id)||canonical(evidence?.controller_decision)!==canonical(decision))throw Error('payment_controller_evidence_mismatch');
    const token=Object.freeze({});proofs.set(token,{policy_sha256:subject.policy_sha256,release_sha256,expires:controllerDecisionValidUntil(controllerDecision),issued:now,
      command_sha256:paymentPolicyDigest(command),stage:command.target_stage});return token;
  }
  if(policy?.independent_reviews?.mode===CONTROLLER_MODE)throw Error('payment_authority_mode_mismatch');
  if (!Array.isArray(evidence?.reviews) || evidence.reviews.length !== 2) throw Error('two_native_payment_reviews_required');
  const seen = new Set(), executors = new Set();
  let expires = now + PAYMENT_COOLDOWN_MS;
  for (const result of evidence.reviews) {
    const p = authenticate(result?.attestation, {trust: authority.trust, subject, role: 'payment_policy_review', now, maxAge: 86400});
    if (!p || !PAYMENT_REVIEW_PROVIDERS.includes(p.provider) || seen.has(p.provider) || executors.has(p.executor)) {
      throw Error('distinct_registered_qwen_doubao_signatures_required');
    }
    if (p.payload.schema !== 'ltzzz.small-payment.native-review.v1') throw Error('native_payment_review_schema_required');
    nativeResult(result, p, 'approve');
    seen.add(p.provider); executors.add(p.executor);
    expires = Math.min(expires, Date.parse(p.payload.at_utc) + PAYMENT_COOLDOWN_MS,
      Date.parse(authority.trust.keys.find(k => k.id === p.key_id).not_after));
  }
  if (!PAYMENT_REVIEW_PROVIDERS.every(p => seen.has(p)) || expires <= now) throw Error('payment_activation_evidence_expired');
  const token = Object.freeze({});
  proofs.set(token, {policy_sha256: subject.policy_sha256, release_sha256, expires, issued: now,
    command_sha256: paymentPolicyDigest(command), stage: command?.target_stage ?? 3});
  return token;
}

export function paymentActivationMatches(token, {policy, release_sha256, command = null, now} = {}) {
  const p = token && proofs.get(token);
  return !!p && Number.isSafeInteger(now) && now >= p.issued && now < p.expires
    && p.policy_sha256 === paymentPolicyDigest(policy) && p.release_sha256 === release_sha256
    && p.command_sha256 === paymentPolicyDigest(command);
}

export function paymentStagePercent(token) {
  const p = token && proofs.get(token);
  if (!p || !Number.isSafeInteger(p.stage) || !Object.hasOwn(PAYMENT_STAGE_PERCENT, p.stage)) throw Error('verified_payment_stage_required');
  return PAYMENT_STAGE_PERCENT[p.stage];
}

export function paymentAnomalySubject({policy, release_sha256, authority, activation_sha256, freeze_sequence}) {
  if (!H.test(release_sha256 || '') || !H.test(activation_sha256 || '') || !Number.isSafeInteger(freeze_sequence) || freeze_sequence < 0) throw Error('bound_anomaly_subject_required');
  return {task_id: 'PLAN-PATCHGATE-ESCROW-20261023', scope: 'base_usdc_small_payment_anomaly',
    policy_sha256: paymentPolicyDigest(policy), release_sha256, authority_sha256: paymentPolicyDigest(authority),
    activation_sha256, freeze_sequence};
}

export function verifySmallPaymentAnomaly({policy, release_sha256, authority, activation_sha256, freeze_sequence, report, now = Date.now()}) {
  registeredAuthority(authority, now,policy);
  if(controllerPaymentMode(authority))throw Error('authenticated_controller_anomaly_channel_required');
  const subject = paymentAnomalySubject({policy, release_sha256, authority, activation_sha256, freeze_sequence});
  const p = authenticate(report?.attestation, {trust: authority.trust, subject, role: 'payment_anomaly', now, maxAge: 86400});
  if (!p || !MODEL_PROVIDERS.has(p.provider) || p.payload.schema !== 'ltzzz.small-payment.native-anomaly.v1') throw Error('registered_signed_model_anomaly_required');
  nativeResult(report, p, 'anomaly');
  return {provider: p.provider, executor: p.executor, evidence_sha256: paymentPolicyDigest(report)};
}
export function verifyControllerPaymentAnomaly({policy,release_sha256,authority,activation_sha256,freeze_sequence,report,controllerDecision,now=Date.now()}){
  registeredAuthority(authority,now,policy);
  const subject=paymentAnomalySubject({policy,release_sha256,authority,activation_sha256,freeze_sequence});
  if(!controllerPaymentMode(authority)||!controllerDecisionMatches(controllerDecision,{subject,now})
    ||!authority.controller_ids.includes(controllerDecisionEvidence(controllerDecision).controller_id)
    ||canonical(Object.keys(report||{}).sort())!==canonical(['evidence_sha256','reason','verdict'])||report.verdict!=='anomaly'
    ||!H.test(report.evidence_sha256||'')||! /^[A-Za-z0-9_]{1,100}$/.test(report.reason||''))throw Error('authenticated_bound_controller_anomaly_required');
  return {authorization_mode:CONTROLLER_MODE,executor:controllerDecisionEvidence(controllerDecision).controller_id,evidence_sha256:paymentPolicyDigest(report)};
}
