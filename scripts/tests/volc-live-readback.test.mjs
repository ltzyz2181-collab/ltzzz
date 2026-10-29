import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {validateReadbackRequest,verifyApprovedProbe,publicReadbackProjection,runReadback} from '../run-volc-live-readback.mjs';
const now=Date.parse('2026-10-29T18:00:00Z');
const request={task_id:'PLAN-PATCHGATE-ESCROW-20261023',step_id:'SPLIT-SIGNER-INFRA-20261026',operation:'read_only_snapshot',function_id:'jt247vfx',cloud_account_id:'2131926778',approved_probe_commit:'ad1333216f2f0bc4f6c96430137a737d05369e4e',state:'pending',request_id:'VOLC-READBACK-20261029-01',created_at_utc:new Date(now-1000).toISOString(),expires_at_utc:new Date(now+300000).toISOString()};
const observation={status:'function_detail_read_only_not_restart_challenge',function_id:'jt247vfx',function_name:'ltzzz-signer-volc-attest',cloud_account_id:'2131926778',nas_mount_declared:false,runtime:'node20/v1',revision_time:'2026-10-29 02:48:09 +0000 UTC',revision_count:1,revisions:[{revision_number:1,id:'r1'}],code_size_bytes:3122,trigger_count:0,triggers:[]};
test('scope, target and expiry failures stop before cloud inspector invocation',async()=>{
 let calls=0;
 for(const patch of [{function_id:'other'},{cloud_account_id:'other'},{operation:'deploy'},{state:'completed'},{approved_probe_commit:'a'.repeat(40)},{request_id:'../bad'},{expires_at_utc:new Date(now-1).toISOString()},{created_at_utc:new Date(now+1).toISOString()},{expires_at_utc:new Date(now+7200000).toISOString()}]){
  await assert.rejects(runReadback({request:{...request,...patch},now,inspect:async()=>{calls++;return observation;}}),/readback_request_/);
 }assert.equal(calls,0);
});
test('source-byte mismatch blocks any import or cloud call',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'volc-readback-source-'));let calls=0;
 try{fs.mkdirSync(path.join(root,'scripts'),{recursive:true});fs.writeFileSync(path.join(root,'scripts/signer-volc-deploy.mjs'),'throw Error("must_not_be_imported")');
  await assert.rejects(runReadback({request,now,root,inspect:async()=>{calls++;return observation;}}),/readback_probe_source_changed/);assert.equal(calls,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('only Claude-approved exact two probe source blobs are accepted',()=>{assert.equal(Object.keys(verifyApprovedProbe()).length,2);assert.equal(validateReadbackRequest(request,now).function_id,'jt247vfx');});
test('public receipt omits nonstandard path tokens and arbitrary cloud metadata',()=>{
 const r=publicReadbackProjection({...observation,Envs:[{Value:'synthetic-credential'}],SourceLocation:'synthetic-source',triggers:[
  {id:'t1',url:'https://synthetic-user:synthetic-password@signer.apigateway-cn-beijing.volceapi.com/opaque-synthetic-token?signature=synthetic-query#synthetic-fragment'},
  {id:'t2',url:'https://signer.apigateway-cn-beijing.volceapi.com/health?signature=synthetic-query'},
  {id:'t3',url:'https://attacker.invalid/health'},{id:'t4',url:'not-a-url'}
 ]});
 assert.equal(r.triggers[0].url,'https://signer.apigateway-cn-beijing.volceapi.com/');assert.equal(r.triggers[0].path_shape,'nonstandard_path_omitted');
 assert.equal(r.triggers[1].url,'https://signer.apigateway-cn-beijing.volceapi.com/health');assert.equal(r.triggers[2].url,null);assert.equal(r.triggers[3].url,null);
 const text=JSON.stringify(r);for(const s of ['synthetic-user','synthetic-password','synthetic-token','synthetic-query','synthetic-fragment','synthetic-credential','synthetic-source'])assert(!text.includes(s));
});
test('snapshot is a readback with provenance, never a restart or model-signature success',async()=>{
 let calls=0;const r=await runReadback({request,now,sourceCommit:'a'.repeat(40),runId:'123',runAttempt:1,inspect:async x=>{calls++;assert.deepEqual(x,{command:'detail',functionId:'jt247vfx'});return observation;}});
 assert.equal(calls,1);assert.equal(r.observation.nas_mount_declared,false);assert.equal(r.source_commit,'a'.repeat(40));assert.equal(r.run_id,'123');
 for(const key of ['private_keys_read','production_deployed','public_key_registered','reader_inventory_verified','actual_source_bytes_verified','restart_same_key_verified','native_doubao_signature_verified'])assert.equal(r[key],false);
 assert.equal(r.cloud_writes,0);assert.equal(r.model_calls,0);
});
test('wrong real cloud owner cannot become a verified snapshot',async()=>{await assert.rejects(runReadback({request,now,inspect:async()=>({...observation,cloud_account_id:'wrong-account'})}),/readback_cloud_identity_mismatch/);});
test('one-off main-only credential job has no PR secrets, cron, deployment command or model key',()=>{
 const w=fs.readFileSync('.github/workflows/volc-signer-live-readback.yml','utf8'),offline=w.split('  offline:')[1].split('  readback:')[0];
 assert(!offline.includes('secrets.'));assert(w.includes("github.event_name == 'push' && github.ref == 'refs/heads/main' && github.repository == 'ltzyz2181-collab/ltzzz'"));
 assert(w.indexOf('run-volc-live-readback.mjs validate')<w.indexOf('secrets.VOLC_ACCESS_KEY'));
 for(const absent of ['schedule:','workflow_dispatch:','ARK_API_KEY','CreateFunction','UpdateFunction','contents: write'])assert(!w.includes(absent));
});
