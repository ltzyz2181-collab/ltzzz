import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BOOTSTRAP_JOB,REVISION,bootstrapInputHash,trustedContext,assertCurrentMain,sourceReadSet,redact,wranglerFailureEvidence,validateJob,jobEvidenceIdentity,validateReplay,bootstrapVerdict,verifyDeployment,runBootstrap} from '../deploy-deep-superagent.mjs';
import {normalizeJob,sha256} from '../../workers/deep-superagent/index.js';

const SHA='a'.repeat(40),HASH='b'.repeat(64);
const env={GITHUB_REPOSITORY:'ltzyz2181-collab/ltzzz',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_SHA:SHA,GITHUB_RUN_ID:'12345',GITHUB_RUN_ATTEMPT:'1'};
const answer=(body,status=200)=>Response.json(body,{status});
const healthy=()=>({revision:REVISION,source_commit:SHA,generation_verified:false,auth_configured:true});
const ready=()=>({...healthy(),financial_execution:false,external_submissions_enabled:false,bindings:{deepseek:true,doubao:true,qianwen:true,kimi:true},reserved_native_seats:{gpt:'disabled_reserved',claude:'disabled_reserved'}});
function job(patch={}){
 return {task_id:BOOTSTRAP_JOB.task_id,package_id:BOOTSTRAP_JOB.package_id,input_sha256:bootstrapInputHash(),execution_id:'original-execution-01',source_commit:SHA,status:'completed_pending_external_acceptance',terminal:true,model_calls:5,receipts:['deepseek','doubao','qianwen','kimi','deepseek'].map((seat,index)=>({stage:'stage-'+index,seat,actual_provider:{deepseek:'deepseek',doubao:'bytedance',qianwen:'aliyun_dashscope',kimi:'moonshot_cn'}[seat],actual_model:seat+'-test-model',finish_reason:'stop',generation_verified:true,output_sha256:HASH,provider_response_id:'response-'+index})),accepted:false,paid:false,tx_hash:null,...patch};
}
function fakeGit({current=SHA,changed=null,head=SHA}={}){
 return args=>{
  if(args[0]==='fetch')return {status:0,stdout:''};
  if(args[0]==='show'){
   const file=args[1].slice(SHA.length+1);
   return {status:0,stdout:file==='workers/deep-superagent/index.js'?"import p from '../../config/deep-superagent.json' with {type:'json'};import {proxyAuth} from '../../lib/proxy-auth.js';":file==='scripts/deploy-deep-superagent.mjs'?"import fs from 'node:fs';":''};
  }
  const ref=args[1];
  return {status:0,stdout:ref==='HEAD'?head:ref==='origin/main'?current:ref===current+':'+changed?'d'.repeat(40):'e'.repeat(40)};
 };
}
test('deployment accepts trusted main only and refuses changed runtime source before upload',()=>{
 assert.equal(trustedContext(env).source_commit,SHA);
 for(const patch of [{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REF:'refs/heads/topic'},{GITHUB_REPOSITORY:'attacker/repo'},{GITHUB_SHA:'latest'},{GITHUB_RUN_ID:''}])assert.throws(()=>trustedContext({...env,...patch}),/trusted_main_execution_required/);
 assert.doesNotThrow(()=>assertCurrentMain({context:trustedContext(env),run:fakeGit()}));
 assert.throws(()=>assertCurrentMain({context:trustedContext(env),run:fakeGit({head:'c'.repeat(40)})}),/stale_deployment_source/);
 for(const changed of ['workers/deep-superagent/index.js','lib/proxy-auth.js','config/deep-superagent.json','.github/workflows/deep-superagent.yml'])assert.throws(()=>assertCurrentMain({context:trustedContext(env),run:fakeGit({current:'c'.repeat(40),changed})}),error=>error.message==='stale_deployment_source'&&error.source_readback.source_readset_conflict.path===changed&&error.source_readback.source_readset_match===false);
});
test('unrelated metadata-only main advance retains old exact source and records current observation',()=>{
 const current='c'.repeat(40),run=fakeGit({current});
 const result=assertCurrentMain({context:trustedContext(env),run});
 assert.equal(result.observed_main_commit,current);assert.equal(result.source_readset_match,true);assert.equal(result.metadata_only_main_advance,true);
 assert.equal(trustedContext(env).source_commit,SHA);
 assert.ok(result.source_readset.some(r=>r.path==='lib/proxy-auth.js'));
 assert.ok(result.source_readset.some(r=>r.path==='config/deep-superagent.json'));
 assert.match(result.source_readset_sha256,/^[a-f0-9]{64}$/);
});
test('source read-set rejects untracked dynamic or external imports',()=>{
 for(const text of ["import('untracked')", "import sdk from 'external-package'"]){
  const base=fakeGit();const run=args=>args[0]==='show'&&args[1].endsWith('workers/deep-superagent/index.js')?{status:0,stdout:text}:base(args);
  assert.throws(()=>sourceReadSet({source:SHA,run}),/untracked_/);
 }
});
test('fixed bootstrap uses the exact Worker-normalized input hash',async()=>{
 assert.deepEqual(normalizeJob(BOOTSTRAP_JOB),BOOTSTRAP_JOB);
 assert.equal(await sha256(JSON.stringify(normalizeJob(BOOTSTRAP_JOB))),bootstrapInputHash());
});
test('health and correct auth must match deployed source; probes never send a generation request',async()=>{
 const observed=[];
 const fetcher=async(url,options)=>{
  observed.push({url,options});
  if(url.endsWith('/health'))return answer(healthy());
  return answer(ready(),options.headers.Authorization==='Bearer test-service-identity'?200:401);
 };
 const result=await verifyDeployment({source:SHA,token:'test-service-identity',fetcher});
 assert.equal(result.model_calls,0);assert.equal(result.anonymous_job_post_http,401);
 assert.equal(observed.filter(r=>r.options.method==='POST').length,1);
 assert.deepEqual(JSON.parse(observed.at(-1).options.body),{});
 assert.equal(observed.at(-1).options.headers.Authorization,undefined);
 await assert.rejects(verifyDeployment({source:'d'.repeat(40),token:'test-service-identity',fetcher,attempts:1}),/deployment_source_or_health_unverified/);
});
test('missing service bindings or an enabled financial/native seat fail deployment acceptance',async()=>{
 for(const patch of [{bindings:{deepseek:true,doubao:true,qianwen:true,kimi:false}},{financial_execution:true},{reserved_native_seats:{gpt:'enabled',claude:'disabled_reserved'}}]){
  const fetcher=async(url,options)=>url.endsWith('/health')?answer(healthy()):answer({...ready(),...patch},options.headers.Authorization==='Bearer test-service-identity'?200:401);
  await assert.rejects(verifyDeployment({source:SHA,token:'test-service-identity',fetcher,attempts:1}),/deployment_isolation_or_service_binding_unverified/);
 }
});
test('public probes reject an auth-open production endpoint',async()=>{
 const fetcher=async(url)=>answer(url.endsWith('/health')?{revision:REVISION,source_commit:SHA,generation_verified:false,auth_configured:true}:{});
 await assert.rejects(verifyDeployment({source:SHA,token:'test-service-identity',fetcher,attempts:1}),/deployment_auth_acceptance_failed/);
});
test('bootstrap requires five native complete outputs and preserves absent external acceptance',()=>{
 assert.equal(bootstrapVerdict(job()),true);
 for(const patch of [{paid:true},{accepted:true},{tx_hash:'0x01'},{model_calls:4},{model_calls:6},{source_commit:'latest'},{package_id:'other'},{input_sha256:'c'.repeat(64)}])assert.throws(()=>bootstrapVerdict(job(patch)));
 const incomplete=job();incomplete.receipts[2].generation_verified=false;assert.throws(()=>bootstrapVerdict(incomplete),/bootstrap_native_receipt_incomplete/);
 const wrongSeat=job();wrongSeat.receipts[2].seat='gpt';assert.throws(()=>bootstrapVerdict(wrongSeat),/bootstrap_native_receipt_incomplete/);
});
test('duplicate probe requires the same execution, immutable receipts and model count',()=>{
 const before=job(),after={...job(),duplicate:true};
 assert.equal(validateReplay(before,after),true);
 const reordered={...after,receipts:after.receipts.map(row=>Object.fromEntries(Object.entries(row).reverse()))};
 assert.equal(jobEvidenceIdentity(before),jobEvidenceIdentity(reordered));
 for(const patch of [{execution_id:'other-execution'},{model_calls:4},{source_commit:'c'.repeat(40)},{duplicate:false}])assert.throws(()=>validateReplay(before,{...after,...patch}));
 const changed=job({duplicate:true});changed.receipts[0].output_sha256='c'.repeat(64);assert.throws(()=>validateReplay(before,changed),/bootstrap_duplicate_replay_changed_execution/);
});
test('one new bootstrap job is followed by a cached replay probe, never a second execution',async()=>{
 let get=0,posts=0;
 const fetcher=async(url,options)=>{
  if(options.method==='POST'){
   posts++;assert.deepEqual(JSON.parse(options.body),BOOTSTRAP_JOB);
   return posts===1?answer({task_id:BOOTSTRAP_JOB.task_id,input_sha256:bootstrapInputHash(),execution_id:'original-execution-01'},202):answer(job({duplicate:true}));
  }
  get++;return get===1?answer({error:'not_found'},404):answer(job());
 };
 const result=await runBootstrap({token:'test-service-identity',fetcher});
 assert.equal(result.status,'bootstrap_native_chain_verified');assert.equal(result.model_calls,5);assert.equal(posts,2);
 assert.equal(result.duplicate_probe,'same_execution_receipts_and_model_count_verified');
});
test('unknown initial POST is reconciled only by GET and never submitted or replayed again',async()=>{
 let gets=0,posts=0;
 const fetcher=async(url,options)=>{
  if(options.method==='POST'){posts++;throw Error('response_lost_after_acceptance');}
  gets++;return gets===1?answer({},404):answer(job());
 };
 const result=await runBootstrap({token:'test-service-identity',fetcher});
 assert.equal(posts,1);assert.equal(result.first_post_outcome,'unknown_reconcile_get_only');
 assert.equal(result.status,'bootstrap_native_chain_verified');assert.match(result.duplicate_probe,/skipped_unknown/);
});
test('an existing job from an earlier deployed source is reused with its original provenance',async()=>{
 let posts=0;
 const fetcher=async(url,options)=>{if(options.method==='POST'){posts++;return answer(job({duplicate:true}));}return answer(job());};
 const result=await runBootstrap({token:'test-service-identity',fetcher});
 assert.equal(result.reused_existing,true);assert.equal(result.post_attempted,false);assert.equal(posts,1);
 assert.equal(result.job.source_commit,SHA);assert.equal(result.model_calls,5);
});
test('blocked or timed-out jobs stop without repurchase',async()=>{
 let posts=0,clock=0;
 const blocked=job({status:'needs_gpt_decision',model_calls:1,receipts:[],error:'incomplete_output'});
 let result=await runBootstrap({token:'test-service-identity',fetcher:async(url,options)=>{if(options.method==='POST')posts++;return answer(blocked);}});
 assert.equal(result.status,'bootstrap_terminal_blocked');assert.equal(posts,0);
 result=await runBootstrap({token:'test-service-identity',clock:()=>clock,timeoutMs:100,pause:async()=>{clock+=100;},fetcher:async()=>answer({...blocked,status:'running',terminal:false})});
 assert.equal(result.status,'bootstrap_timeout_reconcile_only');assert.equal(result.post_attempted,false);
});
test('credential redaction covers nested reports and no new model keys or schedules are deployed',()=>{
 assert.deepEqual(redact({text:'prefix test-service-identity suffix',rows:[{token:'test-service-identity'}]},['test-service-identity']),{text:'prefix [REDACTED] suffix',rows:[{token:'[REDACTED]'}]});
 const workflow=fs.readFileSync('.github/workflows/deep-superagent.yml','utf8'),config=fs.readFileSync('wrangler.deep-superagent.toml','utf8');
 assert.doesNotMatch(workflow,/^\s*schedule:/m);assert.doesNotMatch(config,/crons\s*=|PAY_KV|WEP3_LEDGER|ANTHROPIC_API_KEY|OPENAI_API_KEY/);
 assert.match(workflow,/github\.event_name == 'workflow_dispatch' && inputs\.bootstrap == true/);
 assert.match(config,/new_sqlite_classes = \["DeepTask"\]/);
 for(const [binding,service] of Object.entries({DEEPSEEK:'ltzzz-deepseek-proxy',DOUBAO:'ltzzz-doubao-proxy',QIANWEN:'ltzzz-qianwen-proxy',KIMI:'ltzzz-kimi-proxy'}))assert.match(config,new RegExp('binding = "'+binding+'"\\nservice = "'+service+'"'));
});
test('Wrangler failure diagnostics retain actionable bounded output after credential redaction',()=>{
 const secret='sensitive-service-identity';
 const details=wranglerFailureEvidence({status:1,stdout:'x'.repeat(5000)+secret,stderr:'Worker upload rejected: '+secret+'; binding target missing'},[secret]);
 assert.equal(details.exit_code,1);assert.equal(details.stdout_tail.length,4000);
 assert.doesNotMatch(JSON.stringify(details),/sensitive-service-identity/);
 assert.match(details.stderr_tail,/Worker upload rejected: \[REDACTED\]; binding target missing/);
 assert.equal(wranglerFailureEvidence({status:null,error:{code:'ETIMEDOUT'}},[]).process_error,'ETIMEDOUT');
});
