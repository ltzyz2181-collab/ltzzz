// Ephemeral OFFLINE test signers, never production identities or enrollment evidence.
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {canonical} from '../lib/patchgate.mjs';
import {paymentActivationSubject,verifySmallPaymentActivation} from '../lib/small-payment-authorization.mjs';
const pairs=['aliyun_dashscope','volcengine_ark','owner'].map(id=>({id,...generateKeyPairSync('ed25519')}));
const H='d'.repeat(64);
export function signatureFixture({policy,release_sha256,now=Date.parse('2026-10-27T03:00:00Z')}){
 const start=new Date(now-86400000).toISOString(),end=new Date(now+10*86400000).toISOString();
 const rows=pairs.slice(0,2).map(p=>({id:'offline-'+p.id,provider:p.id,executor:'offline-executor-'+p.id,enabled:true,roles:['payment_policy_review'],public_key_pem:p.publicKey.export({type:'spki',format:'pem'}),not_before:start,not_after:end,allowed_signer_source_sha256:[H],source_deployment_verified:true,cloud_account_binding:'offline-fixture-'+p.id,deployment_evidence_sha256:H}));
 const authority={schema:'ltzzz.small-payment.activation-authority.v1',enabled:true,trust:{schema_version:1,enabled:true,source_binding_required:true,keys:rows},registry:{schema_version:1,repository:'ltzyz2181-collab/ltzzz',executors:rows.map(k=>({id:k.executor,provider:k.provider,roles:k.roles,signing_enabled:true,signing_key_ids:[k.id],source_deployment_verified:true,allowed_signer_source_sha256:[H],cloud_account_binding:k.cloud_account_binding,deployment_evidence_sha256:H}))},owner:{enabled:true,key_id:'offline-owner',public_key_pem:pairs[2].publicKey.export({type:'spki',format:'pem'}),independent_control_registered:true,registration_evidence_sha256:H,not_before:start,not_after:end}};
 const subject=paymentActivationSubject({policy,release_sha256,authority});
 const signPayload=(index,payload)=>({key_id:index===2?'offline-owner':rows[index].id,payload,signature:sign(null,Buffer.from(canonical(payload)),pairs[index].privateKey).toString('base64')});
 const reviews=rows.map((k,i)=>{const output=JSON.stringify({verdict:'approve',scope:'offline synthetic fixture only'});const payload={schema:'ltzzz.small-payment.native-review.v1',role:'payment_policy_review',subject,at_utc:new Date(now).toISOString(),provider:k.provider,executor:k.executor,metadata_source:'provider_response',generation_verified:true,finish_reason:'stop',model:'offline-'+k.provider,request_id:'offline-request-'+i,verdict:'approve',output_sha256:undefined,signer_source_sha256:H,signer_cloud_account_binding:k.cloud_account_binding,signer_deployment_evidence_sha256:H};return {payload,output,index:i};});
 return {authority,subject,signPayload,reviews,makeEvidence:(at=now)=>{
  return {reviews:reviews.map(r=>({output:r.output,attestation:signPayload(r.index,{...r.payload,at_utc:new Date(at).toISOString(),output_sha256:createHash('sha256').update(r.output).digest('hex')})})),owner_confirmation:signPayload(2,{schema:'ltzzz.small-payment.owner-confirmation.v1',role:'owner_payment_activation',subject,enabled:true,at_utc:new Date(at).toISOString(),expires_at:new Date(at+86400000).toISOString()})};
 }};
}
export async function offlineActivation({policy,release_sha256,now}){const f=signatureFixture({policy,release_sha256,now});return verifySmallPaymentActivation({policy,release_sha256,authority:f.authority,evidence:await f.makeEvidence(),now});}
