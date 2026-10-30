// An opaque decision capability from an existing authenticated executor.
// This is controller authority, not a model signature or wallet signature.
import {canonical,sha256} from './patchgate.mjs';
export const CONTROLLER_MODE='authenticated_controller';
const grants=new WeakMap(),ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/,HASH=/^[a-f0-9]{64}$/;
export function createControllerDecisionAuthority({controllerIds,authenticate}={}){
  if(!Array.isArray(controllerIds)||!controllerIds.length||controllerIds.some(x=>!ID.test(x)||['__proto__','prototype','constructor'].includes(x))
    ||new Set(controllerIds).size!==controllerIds.length||typeof authenticate!=='function')throw Error('registered_controller_authentication_adapter_required');
  const allowed=new Set(controllerIds);
  return async({context,subject,now=Date.now()}={})=>{
    if(!Number.isSafeInteger(now)||now<0||!subject||typeof subject!=='object'||Array.isArray(subject)||Buffer.byteLength(canonical(subject))>16000)throw Error('bound_controller_decision_subject_required');
    // Capture intent before awaiting the deployment-owned authentication adapter.
    const subjectHash=sha256(canonical(subject)),principal=await authenticate(context);
    if(principal?.verified!==true||!allowed.has(principal.controller_id)||!HASH.test(principal.identity_evidence_sha256||''))throw Error('authenticated_registered_controller_required');
    const expires=Math.min(now+300000,principal.valid_until_ms??now+300000);
    if(!Number.isSafeInteger(expires)||expires<=now)throw Error('current_controller_identity_required');
    const evidence=Object.freeze({mode:CONTROLLER_MODE,controller_id:principal.controller_id,identity_evidence_sha256:principal.identity_evidence_sha256,
      subject_sha256:subjectHash,at_utc:new Date(now).toISOString(),independent_model_quorum_verified:false});
    const token=Object.freeze({});grants.set(token,{subjectHash,issued:now,expires,evidence});return token;
  };
}
export function controllerDecisionMatches(token,{subject,now=Date.now()}={}){
  const p=token&&grants.get(token);
  if(!p||!Number.isSafeInteger(now)||now<p.issued||now>=p.expires||!subject||typeof subject!=='object'||Array.isArray(subject))return false;
  try{return p.subjectHash===sha256(canonical(subject));}catch{return false;}
}
export function controllerDecisionEvidence(token){
  const p=token&&grants.get(token);if(!p)throw Error('authenticated_controller_capability_required');return structuredClone(p.evidence);
}
export function controllerDecisionValidUntil(token){
  const p=token&&grants.get(token);if(!p)throw Error('authenticated_controller_capability_required');return p.expires;
}
