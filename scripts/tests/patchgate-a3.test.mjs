import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import worker from '../../workers/patchgate-canary/index.js';
import {canonical,verifyDeployment} from '../lib/patchgate.mjs';
import {TARGET,validateA3Policy,trustedContext,activeVersion,collectCanary,sourceReadback,reconcileExisting} from '../run-patchgate-a3.mjs';
const A='a'.repeat(40),B='b'.repeat(40),V='11111111-1111-4111-8111-111111111111',T=Date.parse('2026-11-03T09:00:00Z');
const cfg=JSON.parse(fs.readFileSync('config/patchgate-a3.json')),basePolicy=JSON.parse(fs.readFileSync('config/patch-policy.json'));
function apiResult(id=V,percentage=100){return {deployments:[{id:'deployment-one',created_on:'2026-11-03T09:00:00Z',versions:[{version_id:id,percentage}]}]};}
async function fixture({body,source=A,version=V,date=new Date(T).toUTCString(),changedVersion=false}={}){
 let reads=0;
 return collectCanary({source:A,base:B,clock:()=>T,api:async route=>{assert.equal(route,'/deployments');reads++;return apiResult(changedVersion&&reads===2?'second-version':V);},fetcher:async(url,options)=>{
  assert.equal(url,TARGET.url);assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);
  return new Response(body??canonical({schema:'ltzzz.patchgate.canary.v1',source_commit:A})+'\n',{headers:{Date:date,'X-Source-Commit':source,'X-Worker-Version-Id':version}});
 }});
}
test('inert canary returns only canonical source metadata and real runtime version header',async()=>{
 const r=worker.fetch(new Request(TARGET.url),{CANARY_SOURCE_COMMIT:A,CF_VERSION_METADATA:{id:V}});
 assert.equal(r.status,200);assert.equal(await r.text(),canonical({schema:'ltzzz.patchgate.canary.v1',source_commit:A})+'\n');assert.equal(r.headers.get('X-Worker-Version-Id'),V);
 assert.equal(worker.fetch(new Request(TARGET.url),{CANARY_SOURCE_COMMIT:A}).status,503);
 assert.equal(worker.fetch(new Request(TARGET.url,{method:'POST'}),{}).status,404);
});
test('a caller cannot choose source identity using URL parameters',async()=>{
 const r=worker.fetch(new Request(TARGET.url+'?source_commit='+B),{CANARY_SOURCE_COMMIT:A,CF_VERSION_METADATA:{id:V}});
 assert.equal(r.headers.get('X-Source-Commit'),A);assert.equal((await r.json()).source_commit,A);
});
test('A3 profile admits one registered inert target and keeps broader permissions off',()=>{
 assert.equal(validateA3Policy(cfg,basePolicy),cfg);assert.equal(basePolicy.automatic_deploy,false);assert.equal(basePolicy.real_funds_enabled,false);
 for(const patch of [{url:'https://attacker.test/canary'},{service:'other-worker'},{financial_execution:true},{automatic_rollback:true},{freshness_seconds:301}])assert.throws(()=>validateA3Policy({...cfg,...patch},basePolicy));
 assert.throws(()=>validateA3Policy(cfg,{canary_targets:[]}));
});
test('actual current deployment collection satisfies all five existing deterministic checks',async()=>{
 const r=await fixture();assert.equal(r.verification.passed,true);assert.deepEqual(Object.values(r.verification.checks),[true,true,true,true,true]);
 assert.equal(r.evidence.platform.source,'cloudflare_current_deployment_api');assert.equal(r.evidence.observation.body_base64,Buffer.from(canonical({schema:'ltzzz.patchgate.canary.v1',source_commit:A})+'\n').toString('base64'));
});
test('wrong source/body/header and a changed active version cannot pass',async()=>{
 for(const options of [{source:B},{body:canonical({schema:'ltzzz.patchgate.canary.v1',source_commit:B})+'\n'},{body:canonical({schema:'ltzzz.patchgate.canary.v1',source_commit:A,extra:'ignored'})+'\n'},{version:'unrelated-version'},{changedVersion:true}])assert.equal((await fixture(options)).verification.passed,false);
});
test('same deployed subject is reused; unknown previous deployment cannot be overwritten',async()=>{
 assert.deepEqual(reconcileExisting(await fixture()),{already_current:true});
 const previous=await fixture({body:canonical({schema:'ltzzz.patchgate.canary.v1',source_commit:B})+'\n',source:B});
 assert.deepEqual(reconcileExisting(previous),{already_current:false,previous_source_commit:B,previous_version_id:V});
 for(const options of [{changedVersion:true},{source:B},{date:new Date(T-301000).toUTCString()}]){const unknown=await fixture(options);assert.throws(()=>reconcileExisting(unknown));}
});
test('old HTTP date and forged body hash cannot pass freshness or transport',async()=>{
 assert.equal((await fixture({date:new Date(T-301000).toUTCString()})).verification.checks.fresh,false);
 const r=await fixture();r.evidence.observation.body_sha256='0'.repeat(64);
 assert.equal(verifyDeployment({subject:{head_sha:A,base_sha:B},evidence:r.evidence,allowedTargets:[{url:TARGET.url}],now:T}).checks.transport,false);
});
test('collector rejects split traffic, missing versions and partial commit identities',async()=>{
 for(const result of [{deployments:[]},apiResult(V,50),{deployments:[{versions:[{version_id:V,percentage:50},{version_id:'other',percentage:50}]}]}])assert.throws(()=>activeVersion(result));
 await assert.rejects(()=>collectCanary({source:'latest',base:B,api:async()=>apiResult()}));
});
test('trusted main context only, including immutable run identity',()=>{
 const env={GITHUB_REPOSITORY:'ltzyz2181-collab/ltzzz',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_SHA:A,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1'};
 assert.equal(trustedContext(env).source_commit,A);
 for(const patch of [{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REF:'refs/heads/evil'},{GITHUB_REPOSITORY:'other/repo'},{GITHUB_SHA:'latest'}])assert.throws(()=>trustedContext({...env,...patch}));
});
test('metadata-only main advance is accepted, while an altered runtime read-set is rejected',()=>{
 const fake=(changed=false)=>args=>{
  if(args[0]==='fetch')return '';
  if(args[1]==='HEAD')return A;if(args[1]==='origin/main')return B;
  return changed&&args[1]===B+':workers/patchgate-canary/index.js'?'d'.repeat(40):'c'.repeat(40);
 };
 const r=sourceReadback(A,fake());assert.equal(r.observed_main_commit,B);assert.equal(r.source_files.length,8);
 assert.throws(()=>sourceReadback(A,fake(true)),/a3_runtime_source_changed/);
});
