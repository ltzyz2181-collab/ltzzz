// Public verification only. No private keys, provider calls, key enrollment or switch writes.
import {createPublicKey,verify} from 'node:crypto';
import {authenticate,canonical,sha256} from './patchgate.mjs';
import {validateExecutorRegistry} from './patchgate-a2.mjs';
export const PAYMENT_REVIEW_PROVIDERS=Object.freeze(['aliyun_dashscope','volcengine_ark']);
const H=/^[a-f0-9]{64}$/,B64=/^[A-Za-z0-9+/]{86}==$/;
const proofs=new WeakMap();
export const paymentPolicyDigest=value=>sha256(canonical(value));
export function paymentActivationSubject({policy,release_sha256,authority}){
 if(!H.test(release_sha256||''))throw Error('payment_release_digest_required');
 return {task_id:'PLAN-PATCHGATE-ESCROW-20261023',scope:'base_usdc_small_payment_activation',policy_sha256:paymentPolicyDigest(policy),release_sha256,authority_sha256:paymentPolicyDigest(authority)};
}
export function verifySmallPaymentActivation({policy,release_sha256,authority,evidence,now=Date.now()}={}){
 if(!Number.isSafeInteger(now)||authority?.schema!=='ltzzz.small-payment.activation-authority.v1'||authority.enabled!==true||authority.trust?.source_binding_required!==true||!validateExecutorRegistry({registry:authority.registry,trust:authority.trust}))throw Error('registered_native_payment_review_authority_required');
 if(!Array.isArray(evidence?.reviews)||evidence.reviews.length!==2)throw Error('two_native_payment_reviews_required');
 const subject=paymentActivationSubject({policy,release_sha256,authority}),seen=new Set(),executors=new Set();let expires=now+86400000;
 for(const result of evidence.reviews){
  const p=authenticate(result?.attestation,{trust:authority.trust,subject,role:'payment_policy_review',now,maxAge:86400});
  if(!p||!PAYMENT_REVIEW_PROVIDERS.includes(p.provider)||seen.has(p.provider)||executors.has(p.executor))throw Error('distinct_registered_qwen_doubao_signatures_required');
  const v=p.payload;
  if(v.schema!=='ltzzz.small-payment.native-review.v1'||v.provider!==p.provider||v.executor!==p.executor||v.metadata_source!=='provider_response'||v.generation_verified!==true||v.finish_reason!=='stop'||typeof v.model!=='string'||!v.model||typeof v.request_id!=='string'||!v.request_id||v.verdict!=='approve'||typeof result.output!=='string'||sha256(result.output)!==v.output_sha256)throw Error('complete_native_response_signature_binding_required');
  let output;try{output=JSON.parse(result.output);}catch{throw Error('structured_native_verdict_required');}
  if(output?.verdict!=='approve')throw Error('signed_native_output_not_approved');
  seen.add(p.provider);executors.add(p.executor);expires=Math.min(expires,Date.parse(v.at_utc)+86400000,Date.parse(authority.trust.keys.find(k=>k.id===p.key_id).not_after));
 }
 if(!PAYMENT_REVIEW_PROVIDERS.every(p=>seen.has(p)))throw Error('both_required_native_providers_missing');
 const owner=authority.owner,record=evidence.owner_confirmation,v=record?.payload;
 if(owner?.enabled!==true||owner.independent_control_registered!==true||!H.test(owner.registration_evidence_sha256||'')||typeof owner.public_key_pem!=='string'||record?.key_id!==owner.key_id)throw Error('owner_activation_authority_not_registered');
 const key=createPublicKey(owner.public_key_pem),ownerDer=key.export({type:'spki',format:'der'}).toString('hex');
 if(key.asymmetricKeyType!=='ed25519'||authority.trust.keys.some(k=>createPublicKey(k.public_key_pem).export({type:'spki',format:'der'}).toString('hex')===ownerDer))throw Error('owner_key_must_be_separate_from_model_executors');
 const start=Date.parse(owner.not_before),end=Date.parse(owner.not_after),issued=Date.parse(v?.at_utc),until=Date.parse(v?.expires_at);
 if(v?.schema!=='ltzzz.small-payment.owner-confirmation.v1'||v.role!=='owner_payment_activation'||v.enabled!==true||canonical(v.subject)!==canonical(subject)||![start,end,issued,until].every(Number.isFinite)||start>issued||issued>now||until<=now||end<=now||until>end||!B64.test(record.signature||'')||!verify(null,Buffer.from(canonical(v)),key,Buffer.from(record.signature,'base64')))throw Error('exact_owner_signed_activation_confirmation_required');
 expires=Math.min(expires,until,end);if(expires<=now)throw Error('payment_activation_evidence_expired');
 const token=Object.freeze({});proofs.set(token,{policy_sha256:subject.policy_sha256,release_sha256,expires,issued:now});return token;
}
export function paymentActivationMatches(token,{policy,release_sha256,now}={}){
 const p=token&&proofs.get(token);
 return !!p&&Number.isSafeInteger(now)&&now>=p.issued&&now<p.expires&&p.policy_sha256===paymentPolicyDigest(policy)&&p.release_sha256===release_sha256;
}
