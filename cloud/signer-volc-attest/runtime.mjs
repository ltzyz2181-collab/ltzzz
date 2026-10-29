// The provider wrapper reuses the audited OIDC/evidence/model core. Only storage
// and opaque key custody are adapted; it never signs caller-provided assertions.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import cloudStorage from './storage.cjs';
import {modelWorker,NativeModelAttestationService,MODEL_WORKFLOW} from '../../patchgate-model-attestation-worker.js';
import {verifyActionsOidc,challengeAudience,REPO} from '../../patchgate-oidc.mjs';
import {canonical} from '../../patchgate-attestation-evidence.mjs';
import {SIGNER_SOURCE_FILES} from '../../patchgate-signer-source.mjs';
const EXECUTOR='a2-doubao-model-review-executor',KEY_ID='a2-doubao-model-review-key-v1';
const DEPLOY_WORKFLOW=REPO+'/.github/workflows/deploy-signer-volc.yml@refs/heads/main';
const hash=b=>createHash('sha256').update(b).digest('hex');
const moduleRoot=fileURLToPath(new URL('../../',import.meta.url));
export function deploymentBinding(env,root=moduleRoot){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'volc-release.json'),'utf8'));
 if(manifest.schema!=='ltzzz.volc-signer.source.v1'||! /^[a-f0-9]{40}$/.test(manifest.source_commit||'')||manifest.source_commit!==env.SIGNER_SOURCE_COMMIT||!Array.isArray(manifest.files)||manifest.files.length<10||manifest.files.length>80)throw Error('release_manifest_required');
 const seen=new Set();
 for(const row of manifest.files){if(typeof row.path!=='string'||!/^[a-zA-Z0-9_./-]+$/.test(row.path)||row.path.split('/').some(x=>!x||x==='..'||x==='.')||seen.has(row.path))throw Error('release_file_path');seen.add(row.path);const p=path.join(root,row.path);if(!fs.lstatSync(p).isFile()||fs.realpathSync(p)!==p)throw Error('release_file_regular_required');const b=fs.readFileSync(p);if(b.length!==row.bytes||hash(b)!==row.sha256)throw Error('release_bytes_changed');}
 for(const required of [...SIGNER_SOURCE_FILES,'cloud/signer-volc-attest/runtime.mjs','cloud/signer-volc-attest/storage.cjs','cloud/signer-volc-attest/index.js','cloud/signer-volc-attest/package.json','bootstrap/index.js','bootstrap/package.json','package.json'])if(!seen.has(required))throw Error('release_closure_missing');
 for(const name of ['index.js','package.json'])if(!fs.readFileSync(path.join(root,'bootstrap',name)).equals(fs.readFileSync(path.resolve(root,'..',name))))throw Error('bootstrap_bytes_changed');
 const source=hash(canonical(manifest.files));
 if(source!==env.SIGNER_SOURCE_SHA256||!/^volcengine:[a-zA-Z0-9_-]{1,120}$/.test(env.CLOUD_ACCOUNT_BINDING||'')||!/^[a-f0-9]{64}$/.test(env.DEPLOYMENT_EVIDENCE_SHA256||''))throw Error('source_deployment_binding_required');
 return {source_sha256:source,cloud_account_binding:env.CLOUD_ACCOUNT_BINDING,deployment_evidence_sha256:env.DEPLOYMENT_EVIDENCE_SHA256};
}
export function createVolcRuntime({env=process.env,fetchImpl=fetch,bind=deploymentBinding,createStore=cloudStorage.createCloudStorage}={}){
 let native;
 function initialized(){
  if(native)return native;
  const binding=bind(env),store=createStore(env.SIGNER_STORE_DIR),signer=store.signer(binding);
  const fixedEnv={...env,PROVIDER_BINDING:'volcengine_ark',EXECUTOR_ID:EXECUTOR,KEY_ID,MODEL:env.SIGNER_DEFAULT_MODEL,DOUBAO_API_KEY:env.ARK_API_KEY,PUBLIC_KEY_SPKI:signer.public_key_spki,CLOUD_SIGNER:signer};
  const service=new NativeModelAttestationService({storage:store.storage},fixedEnv);service.fetchImpl=fetchImpl;
  native={env:fixedEnv,service,signer,binding};return native;
 }
 const lazyService={fetch:req=>initialized().service.fetch(req)};
 const worker=modelWorker({fetchImpl,service:lazyService});
 const json=(statusCode,obj)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(obj)});
 return async event=>{
  try{
   const method=event?.method||event?.httpMethod||'GET',pathname=event?.path||'/',headers=new Headers(event?.headers||{});
   if(method==='GET'&&['/','/health'].includes(pathname))return json(200,{service:'ltzzz-signer-volc-attest',ready:false,signing_enabled:env.NATIVE_ATTESTATION_ENABLED==='true',model_calls:0,status:'readiness_requires_authenticated_challenge_and_independent_cloud_evidence'});
   if(method==='GET'&&pathname==='/challenge'){
    const principal=await verifyActionsOidc((headers.get('Authorization')||'').replace(/^Bearer\s+/i,''),{audience:challengeAudience(EXECUTOR),workflowRef:DEPLOY_WORKFLOW,fetchImpl});
    const nonce=headers.get('X-LTZZZ-Challenge');if(!/^[a-f0-9]{64}$/.test(nonce||''))return json(400,{error:'fresh_32_byte_nonce_required',signature_issued:false});
    const n=initialized(),payload={schema:'ltzzz.volc-signer.challenge.v1',nonce,at_utc:new Date().toISOString(),instance_boot_id:BOOT_ID,key_id:KEY_ID,public_key_spki:n.signer.public_key_spki,source_sha256:n.binding.source_sha256,cloud_account_binding:n.binding.cloud_account_binding,requester:principal};
    return json(200,{payload,signature:await n.signer.sign({key_id:KEY_ID,canonical_bytes:new TextEncoder().encode(canonical(payload))}),model_calls:0,restart_verified:false});
   }
   if(method!=='POST'||pathname!=='/attest')return json(404,{error:'not_found'});
   if(env.NATIVE_ATTESTATION_ENABLED!=='true')return json(503,{error:'native_attestation_disabled',signature_issued:false,model_calls:0});
   const body=typeof event.body==='string'?(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body):JSON.stringify(event.body||{});
   if(Buffer.byteLength(body)>550000)return json(413,{error:'request_size',signature_issued:false,model_calls:0});
   const wenv={...env,PROVIDER_BINDING:'volcengine_ark',EXECUTOR_ID:EXECUTOR,KEY_ID,MODEL:env.SIGNER_DEFAULT_MODEL};
   const response=await worker.fetch(new Request('https://signer.invalid/attest',{method:'POST',headers,body}),wenv);
   return {statusCode:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:await response.text()};
  }catch{return json(403,{error:'cloud_signer_unauthorized_or_unconfigured',signature_issued:false,model_calls:0});}
 };
}
const BOOT_ID=randomUUID();
