import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {generationEvidence,auditGenerationSources,auditProxyGates} from '../lib/credentialed-audit.mjs';
import {sentinelCoverage} from '../lib/sentinel-coverage.mjs';
import qianwen from '../../qianwen-proxy-worker.js';import deepseek from '../../deepseek-proxy-worker-v2.js';import grok from '../../xai-proxy-worker.js';import kimi from '../../kimi-proxy-worker.js';import doubao from '../../doubao-proxy-worker.js';
const digest=v=>createHash('sha256').update(v).digest('hex'),now=Date.parse('2026-10-21T12:00:00Z');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'audit-evidence-')),file='knowledge/results/daily-recovery/2026-10-21-doubao.json';
 const record={model:'real-provider-model',model_source:'provider_response',finish_reason:'stop',output:'I call myself a different model.',execution:{schema_version:'ltzzz.provider-execution.v1',receipt_source:'worker_code',executed_by:'doubao',actual_model:'real-provider-model',generation_verified:true,model_source:'provider_response',finish_reason:'stop',completed_at:'2026-10-21T11:00:00Z',upstream_http:200,http_status_observed:true}};
 const save=()=>{fs.mkdirSync(path.dirname(root+'/'+file),{recursive:true});fs.writeFileSync(root+'/'+file,JSON.stringify(record));};save();return {root,file,record,save,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('health reports code defaults or catalogue policy independently of an explicit MODEL secret, without generation',async()=>{
 for(const [worker,expected] of [[qianwen,'qwen-plus'],[deepseek,'deepseek-flash'],[grok,'grok-3'],[kimi,'auto']]){
  const r=await worker.fetch(new Request('https://fixture/health'),{}),d=await r.json();assert.equal(d.model_configured,true);assert.equal(d.model_override_configured,false);assert.equal(d.configured_model,expected);assert.equal(d.generation_verified,false);assert.equal(d.model_configuration_revision,'model-configuration-v2');
 }
 const d=await (await doubao.fetch(new Request('https://fixture/health'),{})).json();assert.equal(d.model_configured,false);assert.equal(d.model_config_source,'required_model_missing');
});
test('provider metadata wins over prose; exact artifact and output digests are checked',()=>{
 const f=fixture();try{const bytes=fs.readFileSync(f.root+'/'+f.file),r=generationEvidence(f.root,f.file,{now,expectedHash:digest(bytes)});assert.equal(r.generation_verified,true);assert.equal(r.actual_model,'real-provider-model');assert.equal(r.output_sha256,digest(f.record.output));assert.equal(r.scope,'actual_generation_only_not_delivery_quality_or_deployment');assert.equal(generationEvidence(f.root,f.file,{now,expectedProvider:'qianwen'}).generation_verified,false);assert.equal(generationEvidence(f.root,f.file,{now,expectedHash:'a'.repeat(64)}).generation_verified,false);f.record.output_sha256='b'.repeat(64);f.save();assert.equal(generationEvidence(f.root,f.file,{now}).generation_verified,false);}finally{f.cleanup();}
});
test('HTTP200 empty, length, requested-model fallback and mismatched provider identity cannot pass',()=>{
 for(const patch of [{output:''},{finish_reason:'length'},{model_source:'requested_model'},{model:'fabricated-model'}]){const f=fixture();try{Object.assign(f.record,patch);f.save();assert.equal(generationEvidence(f.root,f.file,{now}).generation_verified,false);}finally{f.cleanup();}}
});
test('stale evidence remains explicitly stale; missing HTTP observation is not invented',()=>{
 const f=fixture();try{f.record.execution.completed_at='2026-10-18T12:00:00Z';f.record.execution.upstream_http=null;f.record.execution.http_status_observed=false;f.save();const r=generationEvidence(f.root,f.file,{now});assert.equal(r.status,'stale_generation_evidence');assert.equal(r.fresh,false);assert.equal(r.http,null);assert.equal(r.http_observed,false);}finally{f.cleanup();}
});
test('audit has no provider fallback that could turn disabled GPT or external Claude into paid API calls',()=>{
 const f=fixture();try{const r=auditGenerationSources(f.root,{date:'2026-10-21',now});assert.equal(r.gpt.generation_verified,false);assert.equal(r.claude.author_provider,null);assert.equal(r.claude.author_provider_verified,false);assert.equal(r.claude.github_identity_proves_provider,false);assert.equal(r.doubao.supplemental,true);}finally{f.cleanup();}
});
test('credentialed verifier sends credentials only to fixed auth checks and never calls a generation endpoint',async()=>{
 const requests=[],token='private-service-fixture';const rows=await auditProxyGates({token,fetcher:async(url,options)=>{
  requests.push({url,options});assert.equal(options.redirect,'error');const auth=options.headers?.Authorization;
  if(url.endsWith('/health')){assert.equal(auth,undefined);return Response.json({ok:true});}
  assert.ok(url.endsWith('/auth/check'));return auth?Response.json({authenticated:true,model_calls:0}):Response.json({authenticated:false,model_calls:0},{status:401});
 }});assert.equal(requests.length,18);assert.equal(rows.every(r=>r.status==='health_and_credential_gate_verified_no_generation'),true);assert.equal(JSON.stringify(rows).includes(token),false);assert.equal(rows.some(r=>r.generation_verified),false);
});
test('denied auth and missing tokens are blockers, not model failures or fake success',async()=>{
 let calls=0;const fetcher=async(url)=>{calls++;return url.endsWith('/health')?Response.json({ok:true}):Response.json({model_calls:0},{status:401});};
 const noToken=await auditProxyGates({fetcher});assert.equal(calls,6);assert.ok(noToken.every(r=>r.status==='auth_check_token_not_configured'));const denied=await auditProxyGates({token:'wrong',fetcher});assert.ok(denied.every(r=>r.status==='auth_or_health_not_verified'));
});
test('Actions red alarm after successful scan and persistence is not counted as missing execution',async()=>{
 const report=await sentinelCoverage({token:'scoped-read',now,fetcher:async(url)=>{
  if(url.includes('/workflows/'))return Response.json({workflow_runs:[{id:7,event:'schedule',status:'completed',conclusion:'failure',created_at:'2026-10-21T10:00:00Z'}]});
  return Response.json({jobs:[{steps:[{name:'运行派单哨兵',conclusion:'success'},{name:'落盘',conclusion:'success'},{name:'报警（有超时/阻塞/未配置时）',conclusion:'failure'}]}]});
 }});assert.equal(report.actions_read_permission_verified,true);assert.equal(report.observed_scheduled_runs,1);assert.equal(report.sampled_persistence_successes,1);assert.equal(report.sampled_business_alerts,1);assert.equal(report.nominal_slots_are_not_guaranteed_runs,true);assert.equal('persistence_rate' in report,false);
});
test('missing/denied Actions read access cannot produce a coverage percentage',async()=>{
 const noToken=await sentinelCoverage({now});assert.equal(noToken.status,'actions_coverage_unverified');const denied=await sentinelCoverage({token:'read',now,fetcher:async()=>Response.json({},{status:403})});assert.equal(denied.actions_read_permission_verified,false);assert.equal(denied.status,'actions_coverage_unverified');assert.equal('observed_runs' in denied,false);
});
