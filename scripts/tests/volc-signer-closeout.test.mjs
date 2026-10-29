import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {volcRequest} from '../lib/volc-openapi.mjs';
const require=createRequire(import.meta.url);
const {handler}=require('../../cloud/signer-volc-attest/index.js');
async function fixture(fn,{ak='AKLTsynthetic_fixture',sk='synthetic-test-only'}={}){
 const oldFetch=globalThis.fetch,oldAK=process.env.VOLC_ACCESS_KEY,oldSK=process.env.VOLC_SECRET_KEY;
 process.env.VOLC_ACCESS_KEY=ak;process.env.VOLC_SECRET_KEY=sk;
 try{await fn();}finally{globalThis.fetch=oldFetch;for(const [k,v] of [['VOLC_ACCESS_KEY',oldAK],['VOLC_SECRET_KEY',oldSK]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}
test('malformed IAM identifier stops before any fetch and never prints credentials',()=>fixture(async()=>{
 let n=0;globalThis.fetch=async()=>{n++;return Response.json({Result:{Items:[],Total:0}})};
 await assert.rejects(volcRequest({action:'ListFunctions',body:{PageNumber:1,PageSize:50}}),/iam_access_key_format_invalid/);assert.equal(n,0);
},{ak:'Key: synthetic-not-a-cloud-access-key'}));
test('HTTP 200 provider error is failure with safe code and request ID only',()=>fixture(async()=>{
 globalThis.fetch=async()=>Response.json({ResponseMetadata:{RequestId:'request-public-01',Error:{Code:'AccessDenied',Message:'synthetic-test-only must never echo'}},Result:{Items:[]}});
 await assert.rejects(volcRequest({action:'ListFunctions',body:{}}),e=>e.code==='AccessDenied'&&e.request_id==='request-public-01'&&!e.message.includes('must never echo'));
}));
test('cloud requests forbid redirects and bind signed Host without changing credentials',()=>fixture(async()=>{
 globalThis.fetch=async(url,options)=>{assert.equal(options.redirect,'error');assert.equal(options.headers.Host,'open.volcengineapi.com');assert(options.signal);return Response.json({ResponseMetadata:{RequestId:'request-public-02'},Result:{Items:[],Total:0}})};
 const r=await volcRequest({action:'ListFunctions',body:{PageNumber:1,PageSize:50}});assert.deepEqual(r.Result.Items,[]);
}));
test('public health never creates a signing key or claims signer readiness',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ltzzz-volc-public-health-')),old=process.env.SIGNER_STORE_DIR;process.env.SIGNER_STORE_DIR=dir;
 try{const r=await handler({method:'GET',path:'/health'});assert.equal(r.statusCode,200);const b=JSON.parse(r.body);assert.equal(b.signing_enabled,false);assert.equal(b.ready,false);assert.deepEqual(fs.readdirSync(dir),[]);}finally{if(old===undefined)delete process.env.SIGNER_STORE_DIR;else process.env.SIGNER_STORE_DIR=old;fs.rmSync(dir,{recursive:true,force:true});}
});
test('anonymous attest cannot read a model key or perform network/file/key side effects',async()=>{
 let touched=0;const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{touched++;throw Error('no_network');};
 try{const r=await handler({method:'POST',path:'/attest',body:{role:'author',subject:'arbitrary',prompt:'untrusted',source_commit:'a'.repeat(40)}});assert.equal(r.statusCode,503);assert.equal(JSON.parse(r.body).signature_issued,false);assert.equal(touched,0);}finally{globalThis.fetch=oldFetch;}
});

import {spawnSync} from 'node:child_process';
import {createPublicKey,verify} from 'node:crypto';
import {inspectVolcSigner} from '../signer-volc-deploy.mjs';
import {createVolcRuntime} from '../../cloud/signer-volc-attest/runtime.mjs';
import {fixtureJwt,fixtureJwksFetch} from './fixtures/patchgate-oidc-fixture.mjs';
import {challengeAudience,REPO} from '../../patchgate-oidc.mjs';
import {modelAudience,MODEL_WORKFLOW} from '../../patchgate-model-attestation-worker.js';
import {canonical} from '../../patchgate-attestation-evidence.mjs';
import {BASE,modelRequest,githubFixture} from './fixtures/patchgate-model-evidence.mjs';
const {createCloudStorage,assertSharedMount}=require('../../cloud/signer-volc-attest/storage.cjs');
const binding={source_sha256:'d'.repeat(64),cloud_account_binding:'volcengine:synthetic-account',deployment_evidence_sha256:'e'.repeat(64)};
const executor='a2-doubao-model-review-executor',keyId='a2-doubao-model-review-key-v1';
function storageFixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ltzzz-synthetic-cloud-store-'));return{dir,store:()=>createCloudStorage(dir,{verifyMount:()=>{}}),close:()=>fs.rmSync(dir,{recursive:true,force:true})};}
test('read-only VeFaaS probe succeeds without IAM user-list permission',async()=>{
 const calls=[];const r=await inspectVolcSigner({request:async x=>{calls.push(x);assert.equal(x.action,'ListFunctions');return{ResponseMetadata:{RequestId:'read-only-01'},Result:{Items:[],Total:0}}}});assert.equal(r.list_permission_verified,true);assert.equal(r.signer_ready,false);assert.equal(r.account_binding_verified,false);assert.equal(calls.length,1);
});
test('function readback uses Id and never echoes env values or source URLs',async()=>{
 const r=await inspectVolcSigner({command:'challenge',functionId:'actual-func-1',request:async x=>{assert.deepEqual(x.body,{Id:'actual-func-1'});return{Result:{Id:'actual-func-1',Name:'ltzzz-signer-volc-attest',Owner:'1234',Envs:[{Value:'synthetic-private-field'}],SourceLocation:'https://signed-source.invalid/token'},ResponseMetadata:{RequestId:'read-02'}}}});
 assert.equal(r.restart_challenge_verified,false);assert.equal(r.cloud_account_id,'1234');assert(!JSON.stringify(r).includes('synthetic-private-field'));assert(!JSON.stringify(r).includes('signed-source'));
});
test('unsupported deployment and malformed list result stop without extra API calls',async()=>{
 let calls=0;await assert.rejects(inspectVolcSigner({command:'deploy',request:async()=>{calls++}}),/runtime_incomplete/);assert.equal(calls,0);
 await assert.rejects(inspectVolcSigner({request:async()=>({Result:{}})}),/function_list_schema/);
});
test('detail read returns revisions, triggers and resource spec without echoing gateway secrets',async()=>{
 const r=await inspectVolcSigner({command:'detail',functionId:'actual-func-1',request:async x=>{
  if(x.action==='GetFunction')return{Result:{Id:'actual-func-1',Name:'ltzzz-signer-volc-attest',Owner:'1234',Runtime:'node20/v1',LastUpdateTime:'2026-10-29 02:48:09 +0000 UTC',ResourceSpec:{CPU:0.25,Mem:512},Timeout:60,Handler:'index.handler',CodeSize:2048},ResponseMetadata:{RequestId:'read-detail-01'}};
  if(x.action==='ListRevisions')return{Result:{Items:[{RevisionNumber:1,Id:'rev-1'}]},ResponseMetadata:{RequestId:'read-detail-02'}};
  if(x.action==='ListTriggers')return{Result:{Items:[{Id:'trg-1',Name:'signer-public',Type:'apig',Enabled:true,CreationTime:'2026-10-29 00:00:00 +0000 UTC',DetailedConfig:'{"GatewayId":"g-secret","UpstreamId":"u-1","Url":"https://signer.example.apigateway.volceapi.com/health"}'}]},ResponseMetadata:{RequestId:'read-detail-03'}};
  throw Error('unexpected '+x.action);
 }});
 assert.equal(r.function_id,'actual-func-1');assert.equal(r.revision_count,1);assert.equal(r.revisions[0].revision_number,1);
 assert.equal(r.trigger_count,1);assert.equal(r.triggers[0].type,'apig');assert.equal(r.triggers[0].url,'https://signer.example.apigateway.volceapi.com/health');
 assert.deepEqual(r.resource_spec,{cpu:0.25,memory_mb:512});
 const s=JSON.stringify(r);assert(!s.includes('g-secret'));assert(!s.includes('u-1'));
});
test('local writable directory cannot stand in for a real shared NAS mount',()=>assert.throws(()=>assertSharedMount('/tmp/synthetic-fixture'),/shared_nas_path_required/));
test('synthetic cloud key reloads PKCS8 correctly across real process restart and exports only SPKI',async()=>{
 const f=storageFixture();try{
  const signer=f.store().signer(binding),signature=await signer.sign({key_id:keyId,canonical_bytes:Buffer.from('synthetic-nonce')});
  const publicKey=createPublicKey({key:Buffer.from(signer.public_key_spki,'base64'),type:'spki',format:'der'});assert(verify(null,Buffer.from('synthetic-nonce'),publicKey,Buffer.from(signature,'base64')));
  const modulePath=path.resolve('cloud/signer-volc-attest/storage.cjs'),script='const {createCloudStorage}=require(process.argv[1]);const s=createCloudStorage(process.argv[2],{verifyMount:()=>{}}).signer({});process.stdout.write(s.public_key_spki)';
  const child=spawnSync(process.execPath,['-e',script,modulePath,f.dir],{encoding:'utf8'});assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,signer.public_key_spki);assert.equal('privateKey' in signer,false);assert.equal('export' in signer,false);
 }finally{f.close();}
});
test('corrupt key never rotates silently, and a crash lock is never stolen',()=>{
 const f=storageFixture();try{f.store().signer(binding);const p=path.join(f.dir,'ed25519.pkcs8');fs.writeFileSync(p,'corrupted synthetic fixture');assert.throws(()=>f.store().signer(binding),/invalid_no_regeneration/);assert.equal(fs.readFileSync(p,'utf8'),'corrupted synthetic fixture');fs.mkdirSync(path.join(f.dir,'.transaction-lock'));assert.throws(()=>f.store().signer(binding),/locked_no_lease_stealing/);}finally{f.close();}
});
test('daily budget and unknown reservation survive store restart, corrupt state cannot reset budget',async()=>{
 const f=storageFixture(),day='budget:2026-10-29',op='operation:'+'a'.repeat(64);try{
  await f.store().storage.transaction(async tx=>{await tx.put(day,2);await tx.put(op,{status:'reserved_no_replay'});});
  await f.store().storage.transaction(async tx=>{assert.equal(await tx.get(day),2);assert.equal((await tx.get(op)).status,'reserved_no_replay');});
  fs.writeFileSync(path.join(f.dir,'ledger.json'),'not-json');await assert.rejects(f.store().storage.transaction(async()=>{}),/corrupt_no_reset/);
 }finally{f.close();}
});
test('invalid OIDC cannot initialize keys/storage even when native model flag is on',async()=>{
 let init=0,net=0;const runtime=createVolcRuntime({env:{NATIVE_ATTESTATION_ENABLED:'true',SIGNER_DEFAULT_MODEL:'synthetic-model'},fetchImpl:async()=>{net++;throw Error('no_network')},bind:()=>{init++;throw Error('must_not_initialize')}});
 const r=await runtime({method:'POST',path:'/attest',body:modelRequest,headers:{Authorization:'Bearer bad'}});assert.equal(r.statusCode,403);assert.equal(init,0);assert.equal(net,0);
});
test('authenticated fresh challenge verifies with persisted public key, no model call or production restart claim',async()=>{
 const f=storageFixture();try{
  const env={SIGNER_STORE_DIR:f.dir,SIGNER_DEFAULT_MODEL:'synthetic-model'};
  const runtime=createVolcRuntime({env,fetchImpl:fixtureJwksFetch,bind:()=>binding,createStore:()=>f.store()});
  const token=fixtureJwt(challengeAudience(executor),{workflow_ref:REPO+'/.github/workflows/deploy-signer-volc.yml@refs/heads/main'}),nonce='f'.repeat(64);
  const r=await runtime({method:'GET',path:'/challenge',headers:{Authorization:'Bearer '+token,'X-LTZZZ-Challenge':nonce}});assert.equal(r.statusCode,200);const data=JSON.parse(r.body);assert.equal(data.payload.nonce,nonce);assert.equal(data.restart_verified,false);assert.equal(data.model_calls,0);
  assert(verify(null,Buffer.from(canonical(data.payload)),createPublicKey({key:Buffer.from(data.payload.public_key_spki,'base64'),type:'spki',format:'der'}),Buffer.from(data.signature,'base64')));
 }finally{f.close();}
});
test('real attestation core plus filesystem adapter binds actual synthetic provider response and deduplicates after runtime restart',async()=>{
 const f=storageFixture(),github=githubFixture();let calls=0;
 const fetchImpl=async(url,options)=>{
  if(url.includes('.well-known/jwks'))return fixtureJwksFetch(url,options);
  if(['api.github.com','raw.githubusercontent.com'].includes(new URL(url).hostname))return github.fetchImpl(url,options);
  assert.equal(url,'https://ark.cn-beijing.volces.com/api/v3/chat/completions');calls++;
  return Response.json({id:'synthetic-provider-response-id',model:'synthetic-doubao-actual-model',choices:[{finish_reason:'stop',message:{content:'{"verdict":"revise","analysis":"Synthetic fixture review, not provider execution."}'}}]});
 };
 const env={SIGNER_STORE_DIR:f.dir,NATIVE_ATTESTATION_ENABLED:'true',SIGNER_DEFAULT_MODEL:'synthetic-config-model',ARK_API_KEY:'synthetic-fixture-only',SIGNER_SOURCE_SHA256:binding.source_sha256,CLOUD_ACCOUNT_BINDING:binding.cloud_account_binding,DEPLOYMENT_EVIDENCE_SHA256:binding.deployment_evidence_sha256};
 const make=()=>createVolcRuntime({env,fetchImpl,bind:()=>binding,createStore:()=>f.store()});
 const token=fixtureJwt(modelAudience(executor),{workflow_ref:MODEL_WORKFLOW}),event={method:'POST',path:'/attest',headers:{Authorization:'Bearer '+token},body:modelRequest};
 try{const r=await make()(event);assert.equal(r.statusCode,200,r.body);const a=JSON.parse(r.body);assert.equal(a.attestation.payload.model,'synthetic-doubao-actual-model');assert.equal(a.attestation.payload.provider_response_id,'synthetic-provider-response-id');assert.equal(a.attestation.payload.verdict,'revise');assert.equal(a.attestation.payload.requester.source_commit,BASE);assert.equal(a.production_admission,false);const cached=JSON.parse((await make()(event)).body);assert.equal(cached.cache_hit,true);assert.equal(calls,1);assert.equal(cached.attestation.signature,a.attestation.signature);
 }finally{f.close();}
});

import {buildVolcSource,writeVolcBundle,VOLC_SOURCE_FILES} from '../build-volc-signer-release.mjs';
import {deploymentBinding} from '../../cloud/signer-volc-attest/runtime.mjs';
test('fixed deploy bundle actually boots its CommonJS entry and independently verifies all source and bootstrap bytes',async()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'ltzzz-volc-bundle-')),directory=path.join(parent,'function');
 try{
  const source=buildVolcSource({sourceCommit:'a'.repeat(40),read:p=>fs.readFileSync(p)});assert(source.manifest.files.length>=VOLC_SOURCE_FILES.length);writeVolcBundle(directory,source);
  const env={SIGNER_SOURCE_COMMIT:'a'.repeat(40),SIGNER_SOURCE_SHA256:source.source_sha256,CLOUD_ACCOUNT_BINDING:'volcengine:synthetic-account',DEPLOYMENT_EVIDENCE_SHA256:'e'.repeat(64)};
  assert.equal(deploymentBinding(env,path.join(directory,'modules')).source_sha256,source.source_sha256);
  const boot=require(path.join(directory,'index.js'));const r=await boot.handler({method:'GET',path:'/health'});assert.equal(r.statusCode,200);assert.equal(JSON.parse(r.body).ready,false);
  fs.appendFileSync(path.join(directory,'index.js'),'// changed');assert.throws(()=>deploymentBinding(env,path.join(directory,'modules')),/bootstrap_bytes_changed/);
  fs.writeFileSync(path.join(directory,'index.js'),source.files['bootstrap/index.js']);fs.appendFileSync(path.join(directory,'modules/cloud/signer-volc-attest/runtime.mjs'),'// changed');assert.throws(()=>deploymentBinding(env,path.join(directory,'modules')),/release_bytes_changed/);
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
});
test('workflow puts no credentials on PR jobs, injects no model key and keeps live checks main-only',()=>{
 const workflow=fs.readFileSync('.github/workflows/deploy-signer-volc.yml','utf8'),offline=workflow.split('  offline:')[1].split('  credential_readback:')[0];assert(!offline.includes('secrets.'));assert(!workflow.includes('secrets.ARK_API_KEY'));assert(workflow.includes("github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'"));assert(!workflow.includes('ListUsers'));assert(workflow.includes('if-no-files-found: error'));
});
