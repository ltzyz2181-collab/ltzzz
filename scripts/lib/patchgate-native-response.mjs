// Public verification only: never import a private key or obtain a signing token.
import {createPublicKey,verify} from 'node:crypto';
import {canonical,sha256} from './patchgate.mjs';
const H=/^[a-f0-9]{64}$/;
export function enrolledEndpoint(endpoint){
 if(!endpoint||!['aliyun_dashscope','volcengine_ark'].includes(endpoint.provider)||endpoint.source_deployment_verified!==true||!Array.isArray(endpoint.allowed_signer_source_sha256)||!endpoint.allowed_signer_source_sha256.length||endpoint.allowed_signer_source_sha256.some(x=>!H.test(x))||typeof endpoint.cloud_account_binding!=='string'||!endpoint.cloud_account_binding||!H.test(endpoint.deployment_evidence_sha256||'')||typeof endpoint.public_key_spki!=='string')throw Error('enrolled_provider_cloud_endpoint_required');
 const u=new URL(endpoint.url);
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||u.pathname!=='/attest'||endpoint.verified_service_origin!==u.origin||u.hostname.endsWith('.workers.dev'))throw Error('verified_provider_service_origin_required');
 return u;
}
export function verifyNativeResponse({result,endpoint,subject,role,sourceCommit,now=Date.now()}){
 enrolledEndpoint(endpoint);const a=result?.attestation,p=a?.payload;
 if(result.schema!=='ltzzz.patchgate.native-model-attestation.v1'||result.executor_id!==endpoint.executor_id||result.upstream_provider!==endpoint.provider||result.source_commit!==sourceCommit||p?.role!==role||canonical(p.subject)!==canonical(subject)||p.provider!==endpoint.provider||p.executor!==endpoint.executor_id||p.metadata_source!=='provider_response'||p.generation_verified!==true||p.finish_reason!=='stop'||typeof p.model!=='string'||!p.model||typeof result.output!=='string'||sha256(result.output)!==p.output_sha256||!endpoint.allowed_signer_source_sha256.includes(p.signer_source_sha256)||p.signer_cloud_account_binding!==endpoint.cloud_account_binding||p.signer_deployment_evidence_sha256!==endpoint.deployment_evidence_sha256||!Number.isFinite(Date.parse(p.at_utc))||Date.parse(p.at_utc)>now||now-Date.parse(p.at_utc)>86400000||(role==='stage_review'&&p.review_scope!=='A2_L0_docs_only'))throw Error('native_response_binding_required');
 const key=createPublicKey({key:Buffer.from(endpoint.public_key_spki,'base64'),type:'spki',format:'der'});
 if(key.asymmetricKeyType!=='ed25519'||!/^[A-Za-z0-9+/]{86}==$/.test(a.signature||'')||!verify(null,Buffer.from(canonical(p)),key,Buffer.from(a.signature,'base64')))throw Error('native_response_public_signature_invalid');return true;
}
