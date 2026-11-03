import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{DeepTask,normalizeJob,parsePlan,verifyReview,sha256} from '../../workers/deep-superagent/index.js';

const TOKEN='test-only-service-token-not-a-real-key';
const INPUT={task_id:'DEEP-SUPERAGENT-20261103-TEST',package_id:'',prompt:'Create a concise source-checking checklist; exercise all three workers.',data_classification:'public_distributable',platform:'internal'};
const headers={Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'};
class Storage {
  data=new Map();alarmTime=null;tail=Promise.resolve();
  async get(k){return structuredClone(this.data.get(k));}
  async put(k,v){this.data.set(k,structuredClone(v));}
  async setAlarm(t){this.alarmTime=t;}
  async getAlarm(){return this.alarmTime;}
  transaction(fn){const result=this.tail.then(()=>fn(this));this.tail=result.catch(()=>{});return result;}
}
function fixture({badSeat=null,transportFailure=null,planOverride=null,reviewOverride=null}={}){
  const objects=new Map(),calls=[];
  const env={LTZZZ_AGENT_TOKEN:TOKEN,SUPERAGENT_SOURCE_COMMIT:'a'.repeat(40)};
  for(const [binding,seat] of Object.entries({DEEPSEEK:'deepseek',DOUBAO:'doubao',QIANWEN:'qianwen',KIMI:'kimi'}))env[binding]={async fetch(request){
    assert.equal(request.headers.get('Authorization'),'Bearer '+TOKEN);
    const body=await request.json();calls.push({seat,body});
    if(seat===transportFailure)throw Error('secret-like transport text must not be persisted');
    let output;
    if(seat==='deepseek'&&calls.filter(v=>v.seat==='deepseek').length===1)output=JSON.stringify(planOverride??{summary:'Three verifiable tasks',tasks:['doubao','qianwen','kimi'].map(s=>({seat:s,task:'Provide '+s+' checklist contribution'})),needs_gpt_decision:false});
    else if(seat==='deepseek'){
      const input=JSON.parse(body.messages[1].content);
      output=JSON.stringify(reviewOverride??{approved:true,summary:'Three reviewed source-check contributions; source access still requires evidence.',reviewed:input.outputs.map(v=>({seat:v.seat,sha256:v.sha256})),needs_gpt_decision:false});
    }else output=seat+' draft: cite the actual source, timestamp and uncertainty.';
    const receipt={executed_by:seat,task_id:body.task_id,actual_model:seat+'-provider-model',model_source:'provider_response',model_identity_verification:'upstream_metadata_not_cryptographic_attestation',request_id:'internal-'+calls.length,provider_response_id:'upstream-'+calls.length,upstream_request_id:null,finish_reason:seat===badSeat?'length':'stop',generation_verified:seat!==badSeat,tokens_used:123};
    return Response.json({model:receipt.actual_model,choices:[{message:{content:output},finish_reason:receipt.finish_reason}],ltzzz_receipt:receipt});
  }};
  env.TASKS={idFromName:n=>n,get(n){if(!objects.has(n))objects.set(n,new DeepTask({storage:new Storage()},env));return objects.get(n);}};
  const request=(path='/v1/jobs',method='POST',body=INPUT,auth=headers)=>worker.fetch(new Request('https://superagent.test'+path,{method,headers:auth,...(method==='POST'?{body:JSON.stringify(body)}:{})}),env);
  return {env,objects,calls,request};
}

test('anonymous/wrong-token generation is refused before any job or provider call',async()=>{
  const f=fixture();
  assert.equal((await f.request('/v1/jobs','POST',INPUT,{})).status,401);
  assert.equal((await f.request('/v1/jobs','POST',INPUT,{Authorization:'Bearer wrong'})).status,401);
  assert.equal(f.calls.length,0);assert.equal(f.objects.size,0);
  delete f.env.LTZZZ_AGENT_TOKEN;assert.equal((await f.request()).status,503);
});
test('health/discovery separate presence from native generation, money and full protocol support',async()=>{
  const f=fixture(),health=await (await f.request('/health','GET',null,{})).json();
  assert.equal(health.generation_verified,false);assert.equal(health.financial_execution,false);assert.equal(health.source_commit,'a'.repeat(40));
  const card=await (await f.request('/.well-known/agent-card.json','GET',null,{})).json();assert.match(card.protocol_support,/discovery_only/);assert.equal(card.capabilities.native_gpt,false);
  assert.equal(f.calls.length,0);assert.doesNotMatch(JSON.stringify(card)+JSON.stringify(health),new RegExp(TOKEN));
});
test('internal public input only; unknown options, old task claims and external packages cannot bypass admission',()=>{
  assert.equal(normalizeJob(INPUT).prompt,INPUT.prompt);
  for(const patch of [{data_classification:'confidential'},{platform:'uumit'},{endpoint:'https://attacker.test'},{model:'gpt'},{task_id:'ANS-2026-11-03-deepseek'},{package_id:'bad\npackage'}])assert.throws(()=>normalizeJob({...INPUT,...patch}));
});
test('DeepSeek cannot select reserved seats, duplicate workers or executable tool arguments',()=>{
  for(const tasks of [[{seat:'gpt',task:'act'}],[{seat:'kimi',task:'a'},{seat:'kimi',task:'b'}],[]])assert.throws(()=>parsePlan(JSON.stringify({summary:'plan',tasks})));
  const p=parsePlan(JSON.stringify({summary:'plan',tasks:[{seat:'doubao',task:'review data',command:'rm files'}]}));
  assert.deepEqual(p.tasks,[{seat:'doubao',task:'review data'}]);
});
test('concurrent enqueue claims exactly once; changed input under same original ID conflicts',async()=>{
  const f=fixture();const responses=await Promise.all([f.request(),f.request()]);const a=await responses[0].json(),b=await responses[1].json();
  assert.equal(a.execution_id,b.execution_id);assert.equal(Number(a.duplicate)+Number(b.duplicate),1);
  assert.equal((await f.request('/v1/jobs','POST',{...INPUT,prompt:'different original input'})).status,409);assert.equal(f.calls.length,0);
  assert.equal(a.input_sha256,await sha256(JSON.stringify(normalizeJob(INPUT))));
});
test('full durable native chain runs Deep plan, three real-bindable workers and hash-bound independent Deep review',async()=>{
  const f=fixture();assert.equal((await f.request()).status,202);const task=[...f.objects.values()][0];await task.alarm();
  const job=await (await f.request('/v1/jobs/'+INPUT.task_id,'GET')).json();
  assert.equal(job.status,'completed_pending_external_acceptance');assert.equal(job.terminal,true);assert.equal(job.model_calls,5);
  assert.equal(job.receipts.length,5);assert.equal(job.outputs.length,3);assert.equal(job.review.independent_of_worker_providers,true);assert.equal(job.review.approved,true);
  for(const r of job.receipts){assert.equal(r.generation_verified,true);assert.equal(r.model_source,'provider_response');assert.ok(r.actual_model);assert.ok(r.provider_response_id);assert.match(r.output_sha256,/^[a-f0-9]{64}$/);}
  assert.equal(f.calls.find(v=>v.seat==='kimi').body.max_tokens,16384);
  assert.equal(job.accepted,false);assert.equal(job.platform_accepted,false);assert.equal(job.paid,false);assert.equal(job.tx_hash,null);
  assert.equal(job.reflection.status,'context_injected_not_compliance_verified');assert.equal(job.weights_trained,false);
  const duplicate=await (await f.request()).json();assert.equal(duplicate.duplicate,true);assert.equal(duplicate.execution_id,job.execution_id);assert.equal(duplicate.model_calls,5);
  await task.alarm();assert.equal(f.calls.length,5);
});
test('upstream incomplete output blocks and escalates rather than pretending worker success or automatically retrying',async()=>{
  const f=fixture({badSeat:'kimi'});await f.request();const task=[...f.objects.values()][0];await task.alarm();
  const job=await (await f.request('/v1/jobs/'+INPUT.task_id,'GET')).json();
  assert.equal(job.status,'blocked');assert.equal(job.error,'native_generation_evidence_incomplete');assert.equal(job.model_calls,4);assert.equal(job.escalation.seat,'gpt');assert.equal(job.escalation.personal_owner_approval_required,false);
  assert.equal(job.escalation.email_sent,false);assert.equal(job.accepted,false);await f.request();await task.alarm();assert.equal(f.calls.length,4);
});
test('crash after durable generation reservation never replays an uncertain provider request',async()=>{
  const f=fixture();await f.request();const task=[...f.objects.values()][0],job=await task.state.storage.get('job');
  job.status='running';job.model_calls=1;job.receipts=[{stage:'plan',status:'generation_started'}];await task.state.storage.put('job',job);await task.alarm();
  const state=await task.state.storage.get('job');assert.equal(state.status,'unknown');assert.equal(state.terminal,true);assert.equal(state.model_calls,1);assert.equal(f.calls.length,0);assert.ok(state.escalation);
});
test('upstream transport exceptions do not persist arbitrary error text or reset call accounting',async()=>{
  const f=fixture({transportFailure:'deepseek'});await f.request();const task=[...f.objects.values()][0];await task.alarm();
  const job=await task.state.storage.get('job');assert.equal(job.model_calls,1);assert.equal(job.status,'blocked');assert.doesNotMatch(JSON.stringify(job),/secret-like/);assert.equal(job.receipts[0].status,'failed_or_uncertain_no_retry');
});
test('a claimed review without all exact output hashes is rejected',()=>{
  const outputs=[{seat:'doubao',sha256:'a'.repeat(64)}];
  assert.throws(()=>verifyReview(JSON.stringify({approved:true,summary:'ok',reviewed:[{seat:'doubao',sha256:'b'.repeat(64)}],needs_gpt_decision:false}),outputs),/review_binding_mismatch/);
});
test('GPT decision binds original execution/input and stays separate from platform acceptance or payment',async()=>{
  const f=fixture({planOverride:{summary:'Need one decision',tasks:[{seat:'doubao',task:'draft'}],needs_gpt_decision:true,reason:'Design exception'}});
  await f.request();const task=[...f.objects.values()][0];await task.alarm();const j=await task.state.storage.get('job');
  assert.equal(j.status,'needs_gpt_decision');assert.equal(j.model_calls,1);
  const d={decision_id:'GPT-DECISION-20261103-ONE',execution_id:j.execution_id,reviewed_input_sha256:j.input_sha256,decision:'keep_blocked',reason:'Record actual missing capability without asking owner again.'};
  assert.equal((await f.request('/v1/jobs/'+INPUT.task_id+'/decision','POST',{...d,execution_id:'wrong'})).status,400);
  const r=await (await f.request('/v1/jobs/'+INPUT.task_id+'/decision','POST',d)).json();assert.equal(r.decision.seat,'gpt');assert.equal(r.decision.actual_model,null);assert.equal(r.accepted,false);assert.equal(r.paid,false);
  const repeat=await (await f.request('/v1/jobs/'+INPUT.task_id+'/decision','POST',d)).json();assert.equal(repeat.decision_duplicate,true);
  assert.equal((await f.request('/v1/jobs/'+INPUT.task_id+'/decision','POST',{...d,decision:'approve_internal_draft'})).status,409);
});
test('concurrent conflicting GPT decisions cannot overwrite each other',async()=>{
 const f=fixture();await f.request();const task=[...f.objects.values()][0];await task.alarm();const job=await task.state.storage.get('job');
 const d={decision_id:'GPT-DECISION-ATOMIC-01',execution_id:job.execution_id,reviewed_input_sha256:job.input_sha256,decision:'keep_blocked',reason:'Keep actual evidence.'};
 const results=await Promise.all([f.request('/v1/jobs/'+INPUT.task_id+'/decision','POST',d),f.request('/v1/jobs/'+INPUT.task_id+'/decision','POST',{...d,decision_id:'GPT-DECISION-ATOMIC-02',decision:'approve_internal_draft'})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await task.state.storage.get('job')).decision.decision_id,d.decision_id);
});
