// Isolated key-persistence service. It CANNOT sign A2 author/review/check payloads.
import {verifyActionsOidc,challengeAudience} from './patchgate-oidc.mjs';
const schema='ltzzz.executor.key-challenge.v1';
export function canonicalChallenge(x){
  if(x===null||typeof x!=='object')return JSON.stringify(x);
  if(Array.isArray(x))return '['+x.map(canonicalChallenge).join(',')+']';
  return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonicalChallenge(x[k])).join(',')+'}';
}
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export function createChallengeWorker({fetchImpl=fetch}={}){return {async fetch(req,env){
  const path=new URL(req.url).pathname;
  const binding=env.PROVIDER_BINDING,id=env.EXECUTOR_ID;
  if(!['aliyun_dashscope','volcengine_ark'].includes(binding)||!/^a2-(qwen|doubao)-challenge-executor$/.test(id||''))return json({error:'invalid_fixed_executor_config'},503);
  if((binding==='aliyun_dashscope')!==(id==='a2-qwen-challenge-executor'))return json({error:'provider_executor_mismatch'},503);
  const identity={schema,executor_id:id,execution_provider:'cloudflare_workers',provider_binding:binding,public_key_spki:env.PUBLIC_KEY_SPKI||null,source_sha256:env.SOURCE_SHA256||null,purpose:'key_persistence_challenge_only',A2_admission:false,model_calls:0,financial_execution:false};
  if(!/^[a-f0-9]{64}$/.test(env.DEPLOYMENT_MARKER||''))return json({error:'deployment_marker_required'},503);
  if(path==='/identity'&&req.method==='GET')return json({...identity,key_configured:!!env.SIGNING_PKCS8,authentication:'github_actions_oidc',deployment_marker:env.DEPLOYMENT_MARKER});
  if(path!=='/challenge'||req.method!=='POST')return json({error:'challenge_only_no_attestation_routes'},404);
  let principal;try{principal=await verifyActionsOidc((req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,''),{audience:challengeAudience(id),fetchImpl});}catch{return json({error:'unauthorized'},401);}
  let body;try{body=await req.json();}catch{return json({error:'invalid_challenge'},400);}
  if(!body||Object.keys(body).sort().join(',')!=='nonce'||!/^[a-f0-9]{64}$/.test(body.nonce||''))return json({error:'nonce_only_no_subject_or_role'},400);
  if(!env.SIGNING_PKCS8||!env.PUBLIC_KEY_SPKI)return json({error:'key_not_provisioned'},503);
  try{
    const key=await crypto.subtle.importKey('pkcs8',decode(env.SIGNING_PKCS8),{name:'Ed25519'},false,['sign']);
    const payload={schema,purpose:'key_persistence_challenge_only',task_id:'PLAN-PATCHGATE-ESCROW-20261023',executor_id:id,execution_provider:'cloudflare_workers',provider_binding:binding,nonce:body.nonce,deployment_marker:env.DEPLOYMENT_MARKER,requester:principal,at_utc:new Date().toISOString()};
    const signature=await crypto.subtle.sign('Ed25519',key,new TextEncoder().encode(canonicalChallenge(payload)));
    return json({...identity,payload,signature:b64(signature)});
  }catch{return json({error:'challenge_signing_unavailable'},503);}
}};}
export default createChallengeWorker();
