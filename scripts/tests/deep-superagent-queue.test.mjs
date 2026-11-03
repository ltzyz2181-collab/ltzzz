import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeJob,sha256,REVISION} from '../../workers/deep-superagent/index.js';
import {ORIGIN,MAX_WAIT_MS,selectQueueCards,normalizeDecision,decisionPayload,publicJob,redactKnownSecrets,DeepQueueLatchStore,trustedQueueContext,runQueueCard,runQueue} from '../run-deep-superagent-queue.mjs';

const SOURCE='a'.repeat(40),RUNTIME='b'.repeat(40),TOKEN='mock-only-service-identity';
test('GPT queue evidence preserves code-owned content findings without arbitrary model fields',()=>{
 const gate={revision:'executor-metadata-declarations-v1',source_commit:RUNTIME,passed:false,phase:'after_independent_review',findings:[{code:'unsupported_executor_metadata_declaration',field:'executed_by',line:2,seat:'qianwen',output_sha256:'c'.repeat(64),arbitrary:'drop me'}],arbitrary:'drop me'};
 const result=publicJob({content_guard_revision:gate.revision,content_gate:{...gate,checks:[gate]}});
 assert.equal(result.content_guard_revision,gate.revision);assert.equal(result.content_gate.passed,false);assert.equal(result.content_gate.findings[0].seat,'qianwen');
 assert.equal(result.content_gate.findings[0].output_sha256,'c'.repeat(64));assert.equal(result.content_gate.checks.length,1);assert.doesNotMatch(JSON.stringify(result),/drop me/);
});
const input={task_id:'DSA-QUEUE-TEST-01',package_id:'PUBLIC-OWN-01',prompt:'Use only this LTZZZ-owned fictional dataset; explain why offline tests are not production acceptance.',data_classification:'public_distributable',platform:'internal'};
const inputHash=await sha256(JSON.stringify(normalizeJob(input)));
function fixture(patch={}){
 return {...normalizeJob(input),input_sha256:inputHash,execution_id:'mock-execution-original',source_commit:RUNTIME,revision:REVISION,status:'completed_pending_external_acceptance',terminal:true,model_calls:3,receipts:[{seat:'deepseek',actual_provider:'deepseek',actual_model:'provider-model-response',request_id:'mock-upstream-id',generation_verified:true}],outputs:[{seat:'doubao',actual_provider:'volcengine_ark',text:'Mock public own result, no external acceptance.',sha256:'f'.repeat(64)}],accepted:false,platform_accepted:false,deployed:false,paid:false,tx_hash:null,financial_execution:false,external_submissions_enabled:false,...patch};
}
function latchStore(){
 const values=new Map(),events=[];
 return {values,events,async read(key){events.push('read');return values.has(key)?{head:'c'.repeat(40),state:values.get(key)}:null;},async compareAndSwap(key,previous,state){events.push('reserve');assert.equal(previous,null);if(values.has(key))return false;values.set(key,structuredClone(state));return true;}};
}
function http(data,status=200){return Response.json(data,{status});}
function fakeTime(){let time=0;return {clock:()=>time,pause:async ms=>{time+=ms;}};}
function decision(patch={}){return {task_id:input.task_id,package_id:input.package_id,decision_id:'GPT-QUEUE-DECISION-01',execution_id:'mock-execution-original',reviewed_input_sha256:inputHash,decision:'approve_internal_draft',reason:'Reviewed public own outputs and actual evidence; this approves only an internal draft.',...patch};}
const base=(extra={})=>({kind:'task',body:input,source_commit:SOURCE,token:TOKEN,store:latchStore(),...fakeTime(),deadline:20,...extra});

test('only one new top-level card of each kind is selected; tasks precede decisions',()=>{
 const cards=selectQueueCards([{status:'A',path:'ops/deep-superagent/decisions/DECISION-001.json'},{status:'M',path:'docs/unrelated.md'},{status:'A',path:'ops/deep-superagent/tasks/TASK-001.json'}]);
 assert.deepEqual(cards.map(x=>x.kind),['task','decision']);
 assert.throws(()=>selectQueueCards([{status:'A',path:'ops/deep-superagent/tasks/TASK-001.json'},{status:'A',path:'ops/deep-superagent/tasks/TASK-002.json'}]),/maximum_one/);
 for(const change of [{status:'M',path:'ops/deep-superagent/tasks/TASK-001.json'},{status:'D',path:'ops/deep-superagent/tasks/TASK-001.json'},{status:'A',path:'ops/deep-superagent/tasks/sub/TASK-001.json'},{status:'A',path:'ops/deep-superagent/decisions/../../other.json'}])assert.throws(()=>selectQueueCards([change]));
});

test('task cards cannot choose URLs, models, credentials, output budgets or an external platform',async()=>{
 for(const patch of [{url:'https://invalid.example'},{endpoint:'https://invalid.example'},{model:'gpt-anything'},{token:'do-not-accept'},{max_tokens:1},{platform:'uumit'},{data_classification:'confidential'},{task_id:'UUMIT-OLD-ORDER-001'}]){
  let calls=0;
  await assert.rejects(()=>runQueueCard(base({body:{...input,...patch},fetcher:async()=>{calls++;throw Error('must_not_fetch');}})));
  assert.equal(calls,0);
 }
});

test('new task persists an exclusive latch before the one POST, then uses GET readback',async()=>{
 const store=latchStore(),methods=[];let current=null;
 const outcome=await runQueueCard(base({store,fetcher:async(url,options)=>{
  assert.equal(new URL(url).origin,ORIGIN);
  assert.equal(options.headers.Authorization,'Bearer '+TOKEN);
  methods.push(options.method);
  if(options.method==='POST'){
   assert.equal(store.values.size,1);
   assert.deepEqual(JSON.parse(options.body),normalizeJob(input));
   current=fixture();return http(fixture({status:'queued',terminal:false,model_calls:0,receipts:[]}),202);
  }
  return current?http(current):http({error:'task_not_found'},404);
 }}));
 assert.deepEqual(methods,['GET','POST','GET']);
 assert.equal(outcome.status,'job_terminal_observed');
 assert.equal(outcome.post_attempted,true);
 assert.equal(outcome.attempt_latch,'durable_reserved_before_post');
 assert.equal(outcome.queue_card_source_commit,SOURCE);
 assert.equal(outcome.runtime_source_commit,RUNTIME);
 assert.equal(outcome.model_calls_original_task_total,3);
 assert.equal(outcome.job.platform_accepted,false);
});

test('an existing job is reused without touching latches or issuing POST',async()=>{
 const store={read(){throw Error('must_not_reserve');},compareAndSwap(){throw Error('must_not_reserve');}},methods=[];
 const outcome=await runQueueCard(base({store,fetcher:async(url,o)=>{methods.push(o.method);return http(fixture());}}));
 assert.equal(outcome.reused_existing,true);
 assert.equal(outcome.post_attempted,false);
 assert.equal(outcome.status,'job_terminal_observed');
 assert.deepEqual(methods,['GET','GET']);
});

test('changed input for an existing original task blocks before reservation or model trigger',async()=>{
 const store=latchStore(),methods=[];
 const result=await runQueueCard(base({store,body:{...input,prompt:input.prompt+' changed'},fetcher:async(url,o)=>{methods.push(o.method);return http(fixture());}}));
 assert.equal(result.status,'blocked');assert.equal(result.error,'remote_job_binding_or_isolation_invalid');
 assert.equal(result.post_attempted,false);assert.equal(store.values.size,0);assert.deepEqual(methods,['GET']);
});

test('lost successful POST response reconciles the original execution by GET only',async()=>{
 let current=null,posts=0;const methods=[];
 const result=await runQueueCard(base({fetcher:async(url,o)=>{
  methods.push(o.method);
  if(o.method==='POST'){posts++;current=fixture();throw Error('transport_result_unknown');}
  return current?http(current):http({error:'task_not_found'},404);
 }}));
 assert.equal(posts,1);assert.deepEqual(methods,['GET','POST','GET']);
 assert.equal(result.first_post_outcome,'unknown_reconcile_get_only');
 assert.equal(result.status,'job_terminal_observed');assert.equal(result.execution_id,'mock-execution-original');
});

test('a malformed POST response also uses GET reconciliation without repeating POST',async()=>{
 let posted=false,posts=0;
 const result=await runQueueCard(base({fetcher:async(url,o)=>{
  if(o.method==='POST'){posted=true;posts++;return http({unexpected:true},202);}
  return posted?http(fixture()):http({error:'task_not_found'},404);
 }}));
 assert.equal(posts,1);assert.equal(result.status,'job_terminal_observed');assert.equal(result.first_post_outcome,'unknown_reconcile_get_only');
});

test('unknown POST plus missing job stays latched across workflow reruns; GET404 cannot replay it',async()=>{
 const store=latchStore();let posts=0;
 const fetcher=async(url,o)=>{if(o.method==='POST'){posts++;throw Error('lost');}return http({error:'task_not_found'},404);};
 const first=await runQueueCard(base({store,fetcher}));
 const rerun=await runQueueCard(base({store,fetcher}));
 assert.equal(first.status,'pending_reconcile_get_only');assert.equal(rerun.status,'pending_reconcile_get_only');
 assert.equal(posts,1);assert.equal(rerun.post_attempted,false);assert.equal(rerun.attempt_latch,'existing_no_post_replay');
});

test('a concurrent reservation loser reconciles instead of posting',async()=>{
 let reads=0,state;const store={async read(){reads++;return reads===1?null:{state};},async compareAndSwap(key,previous,next){state=next;return false;}};
 let gets=0,posts=0;
 const result=await runQueueCard(base({store,fetcher:async(url,o)=>{if(o.method==='POST'){posts++;throw Error('must_not_post');}return ++gets===1?http({error:'task_not_found'},404):http(fixture());}}));
 assert.equal(result.status,'job_terminal_observed');assert.equal(posts,0);assert.equal(result.attempt_latch,'concurrent_existing_no_post_replay');
});

test('an uncertain CAS write result prevents POST even if the branch may have been created',async()=>{
 let posts=0;const store={async read(){return null;},async compareAndSwap(){throw Error('reservation_transport_unknown');}};
 const result=await runQueueCard(base({store,fetcher:async(url,o)=>{if(o.method==='POST')posts++;return http({error:'task_not_found'},404);}}));
 assert.equal(result.status,'blocked');assert.equal(result.error,'reservation_transport_unknown');assert.equal(posts,0);
});

test('conflicting persistent payload latch cannot be repurposed for changed input',async()=>{
 let posts=0;const store={async read(){return {state:{kind:'task',payload_sha256:'0'.repeat(64)}};},async compareAndSwap(){throw Error('must_not_write');}};
 const result=await runQueueCard(base({store,fetcher:async(url,o)=>{if(o.method==='POST')posts++;return http({error:'task_not_found'},404);}}));
 assert.equal(result.status,'blocked');assert.equal(result.error,'durable_attempt_payload_conflict');assert.equal(posts,0);
});

test('bound GPT AI decision records only the five allowed API fields and preserves runtime provenance',async()=>{
 const card=decision(),payload=decisionPayload(card),store=latchStore();let current=fixture(),posts=0;
 const result=await runQueueCard(base({kind:'decision',body:card,store,fetcher:async(url,o)=>{
  if(o.method==='POST'){
   posts++;assert.equal(store.values.size,1);assert.equal(new URL(url).pathname,'/v1/jobs/'+input.task_id+'/decision');
   assert.deepEqual(JSON.parse(o.body),payload);
   current={...current,decision:{seat:'gpt',kind:'AI_manual_intervention',actual_provider:null,actual_model:null,decision_id:card.decision_id,payload}};
  }
  return http(current);
 }}));
 assert.equal(posts,1);assert.equal(result.status,'decision_recorded_verified');
 assert.equal(result.runtime_source_commit,RUNTIME);assert.equal(result.queue_card_source_commit,SOURCE);
 assert.equal(result.job.decision.actual_model,null);assert.equal(result.job.platform_accepted,false);assert.equal(result.job.paid,false);
});

test('identical existing decision is reused without a POST or a second reservation',async()=>{
 const card=decision(),payload=decisionPayload(card);let calls=0;
 const result=await runQueueCard(base({kind:'decision',body:card,store:{read(){throw Error('must_not_reserve');}},fetcher:async(url,o)=>{calls++;assert.equal(o.method,'GET');return http(fixture({decision:{decision_id:card.decision_id,payload}}));}}));
 assert.equal(result.status,'decision_existing_verified');assert.equal(result.post_attempted,false);assert.equal(calls,1);
});

test('decision cannot conflict with a final recorded decision or bind another execution/input',async()=>{
 const cases=[{card:decision({reason:'A different purported decision'}),job:fixture({decision:{payload:decisionPayload(decision())}})},{card:decision({execution_id:'wrong-execution'}),job:fixture()},{card:decision({reviewed_input_sha256:'9'.repeat(64)}),job:fixture()},{card:decision(),job:fixture({status:'running',terminal:false})}];
 for(const item of cases){
  let posts=0;const store=latchStore();
  const result=await runQueueCard(base({kind:'decision',body:item.card,store,fetcher:async(url,o)=>{if(o.method==='POST')posts++;return http(item.job);}}));
  assert.equal(result.status,'blocked');assert.equal(posts,0);assert.equal(store.values.size,0);
 }
});

test('unknown decision POST is reconciled by GET and rerun reuses the durable original decision',async()=>{
 const card=decision(),store=latchStore();let current=fixture(),posts=0;
 const fetcher=async(url,o)=>{
  if(o.method==='POST'){posts++;current={...current,decision:{payload:decisionPayload(card)}};throw Error('lost_decision_response');}
  return http(current);
 };
 const first=await runQueueCard(base({kind:'decision',body:card,store,fetcher}));
 const second=await runQueueCard(base({kind:'decision',body:card,store,fetcher}));
 assert.equal(posts,1);assert.equal(first.status,'decision_recorded_verified');assert.equal(second.status,'decision_existing_verified');
});

test('decision cards reject arbitrary options, elevated decisions, invalid IDs and private packages',()=>{
 for(const patch of [{model:'gpt-native'},{endpoint:ORIGIN},{financial_execution:true},{decision:'approve_payment'},{reviewed_input_sha256:null},{task_id:'ANS-legacy-task'},{package_id:'bad\npackage'}])assert.throws(()=>normalizeDecision(decision(patch)));
});

test('public job evidence whitelists actual receipts and redacts known identities without inventing models',()=>{
 const raw=fixture({Authorization:'Bearer '+TOKEN,outputs:[{seat:'doubao',actual_provider:'volcengine_ark',text:'Accidental known token '+TOKEN,sha256:'f'.repeat(64),secret_header:'not_retained'}],receipts:[{seat:'doubao',actual_model:null,request_id:'original-upstream',headers:{Authorization:TOKEN}}]});
 const record=redactKnownSecrets(publicJob(raw),[TOKEN]);
 assert.equal(record.Authorization,undefined);assert.equal(record.receipts[0].headers,undefined);assert.equal(record.outputs[0].secret_header,undefined);
 assert.equal(record.receipts[0].actual_model,null);assert.equal(record.receipts[0].request_id,'original-upstream');
 assert.equal(JSON.stringify(record).includes(TOKEN),false);assert.match(record.outputs[0].text,/\[REDACTED\]/);
});

test('queue execution context is trusted main push only; latches use a separate branch namespace',()=>{
 const env={GITHUB_REPOSITORY:'ltzyz2181-collab/ltzzz',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_SHA:SOURCE,GITHUB_RUN_ID:'12345',GITHUB_RUN_ATTEMPT:'1'};
 assert.equal(trustedQueueContext(env).source_commit,SOURCE);
 for(const patch of [{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REF:'refs/heads/untrusted'},{GITHUB_REPOSITORY:'other/repo'}])assert.throws(()=>trustedQueueContext({...env,...patch}));
 const store=new DeepQueueLatchStore({repository:env.GITHUB_REPOSITORY,token:'mock-github-token',baseCommit:SOURCE,baseTree:'c'.repeat(40),fetcher:()=>{throw Error('no_network');}});
 assert.equal(store.names('d'.repeat(64)).ref,'heads/deep-superagent/attempts/'+'d'.repeat(64));
 assert.throws(()=>store.names('../escape'));
});

test('queue-wide timeout and maximum card count remain bounded',async()=>{
 await assert.rejects(()=>runQueue({cards:[],source_commit:SOURCE,timeoutMs:MAX_WAIT_MS+1}),/invalid_bounded/);
 await assert.rejects(()=>runQueue({cards:[{kind:'task'},{kind:'task'}],source_commit:SOURCE}),/maximum_one/);
 await assert.rejects(()=>runQueue({cards:[{kind:'task'},{kind:'decision'},{kind:'task'}],source_commit:SOURCE}),/invalid_bounded/);
});

test('persistent GitHub CAS transport shares the execution time limit and cannot start after expiry',async()=>{
 let calls=0;
 const store=new DeepQueueLatchStore({repository:'ltzyz2181-collab/ltzzz',token:'mock-github',baseCommit:SOURCE,baseTree:'c'.repeat(40),deadline:5,clock:()=>6,fetcher:async()=>{calls++;throw Error('must_not_fetch_after_deadline');}});
 await assert.rejects(()=>store.read('d'.repeat(64)),/queue_time_budget_exhausted/);
 assert.equal(calls,0);
});

test('queue workflow has no cron or provider keys and confines credentialed execution to trusted main pushes',()=>{
 const workflow=fs.readFileSync('.github/workflows/deep-superagent-queue.yml','utf8');
 assert.doesNotMatch(workflow,/\bschedule:|\bcron:|\bworkflow_dispatch:/);
 assert.doesNotMatch(workflow,/DEEPSEEK_API_KEY|DOUBAO_API_KEY|MOONSHOT_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY/);
 assert.match(workflow,/github\.event_name == 'push' && github\.ref == 'refs\/heads\/main' && github\.repository == 'ltzyz2181-collab\/ltzzz'/);
 assert.match(workflow,/node tools\/push-receipt-commit\.mjs/);
});
