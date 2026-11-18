import test from 'node:test';
import assert from 'node:assert/strict';
import {DeepTask} from '../../workers/deep-superagent/index.js';
import {ADJUDICATION_REVISION,fundFamilyHit,fundShortCircuit,parseAdjudication,adjudicationPrompt,adjudicationRecord} from '../../workers/deep-superagent/adjudicator.mjs';
import {RELAY_PRICES,estimateWorstCaseCost,usageCostUsd} from '../../workers/deep-superagent/accounting.mjs';
import {MODEL_PRICES,MAX_CALL_COST_USD} from '../../workers/relay-proxy/worker.mjs';

const TOKEN='test-only-service-token-not-a-real-key';
const HASH='b'.repeat(64);
const headers={Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'};

class Storage{
  data=new Map();tail=Promise.resolve();
  async get(k){return structuredClone(this.data.get(k));}
  async put(k,v){this.data.set(k,structuredClone(v));}
  async setAlarm(){}
  async getAlarm(){return null;}
  transaction(fn){const r=this.tail.then(()=>fn(this));this.tail=r.catch(()=>{});return r;}
}
function job(overrides={}){
  return {task_id:'DEEP-SUPERAGENT-20261117-ADJ',package_id:'',prompt:'补充口径文档并确认已合并状态，保持现有行为，只补文档与状态确认。',data_classification:'public_distributable',platform:'internal',input_sha256:HASH,execution_id:'exec-1',source_commit:'a'.repeat(40),status:'completed_pending_external_acceptance',terminal:true,model_calls:0,receipts:[],outputs:[{seat:'doubao',text:'建议把口径写进 docs 并附证据路径。',sha256:'c'.repeat(64)}],accepted:false,deployed:false,paid:false,tx_hash:null,financial_execution:false,...overrides};
}
function relayEnv({enabled=true}={}){
  const env={LTZZZ_AGENT_TOKEN:TOKEN};
  if(enabled){env.RELAY_PROXY_TOKEN='scoped-proxy-token';env.RELAY_ACCEPTANCE_VERIFIED='1';env.RELAY_PROXY_URL='https://ltzzz-relay-proxy.ltzyz2181.workers.dev/v1';env.RELAY_MODEL_GPT='gpt-6.1-sol';}
  return env;
}
async function adjudicate(jobRecord,{env=relayEnv(),body={adjudication_id:'ADJ-20261117-01'}}= {}){
  const storage=new Storage();await storage.put('job',jobRecord);
  const task=new DeepTask({storage},env);
  const response=await task.fetch(new Request('https://task.internal/adjudication',{method:'POST',headers,body:JSON.stringify(body)}));
  return {status:response.status,payload:await response.json(),stored:await storage.get('job')};
}

// --- pure rules -----------------------------------------------------------
test('funds family is recognized before any relay call across zh/en phrasings',()=>{
  for(const [prompt,family] of [['请把退款展示防御改成自动','refund_semantics'],['放款额度自动下发','loan_disbursement'],['给钱包加一次 multisig 签名','wallet_or_safe_ops'],['用私钥签这笔交易','signing'],['production deploy 到生产环境','production_write'],['购买订阅并自动续费','funding_moves'],['灰度发布并上线新版本','production_write'],['执行五签 5-of-5 放款','five_signature_safe'],['five-signature wallet approval','five_signature_safe']]){
    const hit=fundFamilyHit({task_id:'DEEP-X',prompt});
    assert.equal(hit.hit,true,prompt);assert.equal(hit.family,family,prompt);
  }
  assert.deepEqual(fundFamilyHit({task_id:'DEEP-SUPERAGENT-20261117-ADJ',prompt:'补充口径文档并确认已合并状态，保持现有行为，只补文档与状态确认。'}).hit,false);
});
test('short-circuit record never claims a call, money or execution',()=>{
  const r=fundShortCircuit({task_id:'DEEP-X',input_sha256:HASH,family:'refund_semantics'});
  assert.equal(r.revision,ADJUDICATION_REVISION);
  assert.equal(r.relay_called,false);assert.equal(r.model_calls,0);assert.equal(r.transport,'none');
  assert.equal(r.disposition,'needs_decision');assert.equal(r.escalate_to,'gpt_decision_seat');
  assert.equal(r.relay_attested,false);assert.equal(r.financial_execution,false);assert.equal(r.execution_authority,false);
  assert.match(r.why_out_of_scope,/refund_semantics/);
});
test('five-signature items stay with the owner/multisig, never the GPT seat',()=>{
  const r=fundShortCircuit({task_id:'DEEP-X',input_sha256:HASH,family:'five_signature_safe'});
  assert.equal(r.escalate_to,'owner_multisig');
  assert.equal(r.five_signature_owner_required,true);
  assert.equal(r.relay_called,false);assert.equal(r.financial_execution,false);
  assert.match(r.why_out_of_scope,/owner_multisig_excludes_five_signature_safe/);
  for(const family of ['funding_moves','refund_semantics','wallet_or_safe_ops','production_write']){
    assert.equal(fundShortCircuit({task_id:'DEEP-X',input_sha256:HASH,family}).escalate_to,'gpt_decision_seat',family);
  }
});
test('each disposition enforces the fields the seat-rules file requires',()=>{
  const base={task_id:'DEEP-X',input_sha256:HASH,reason:'判定依据'};
  assert.equal(parseAdjudication(JSON.stringify({...base,disposition:'approve_in_scope',scope_ref:'SCOPE-INTERNAL-DOCS-20261117',permitted_actions:['更新文档'],evidence_refs:['docs/a.md'],rollback:'revert commit'}),{task_id:'DEEP-X',input_sha256:HASH}).ok,true);
  assert.equal(parseAdjudication(JSON.stringify({...base,disposition:'approve_in_scope',scope_ref:'SCOPE-INTERNAL-DOCS-20261117',permitted_actions:['更新文档'],evidence_refs:['docs/a.md']}),{task_id:'DEEP-X',input_sha256:HASH}).error,'adjudication_required_fields_missing');
  assert.equal(parseAdjudication(JSON.stringify({...base,disposition:'conditional_approve',conditions:['补证据'],verification:['跑测试'],deadline:'2026-11-18',evidence_refs:['docs/a.md']}),{task_id:'DEEP-X',input_sha256:HASH}).ok,true);
  assert.equal(parseAdjudication(JSON.stringify({...base,disposition:'return_for_revision',missing_items:['证据'],acceptance_criteria:['有哈希']}),{task_id:'DEEP-X',input_sha256:HASH}).ok,true);
  assert.equal(parseAdjudication(JSON.stringify({...base,disposition:'needs_decision',why_out_of_scope:'超出范围',escalate_to:'gpt_decision_seat'}),{task_id:'DEEP-X',input_sha256:HASH}).ok,true);
  // A relay verdict can no longer route a routine decision to the owner.
  assert.equal(parseAdjudication(JSON.stringify({...base,disposition:'needs_decision',why_out_of_scope:'超出范围',escalate_to:'owner'}),{task_id:'DEEP-X',input_sha256:HASH}).error,'adjudication_required_fields_missing');
  assert.equal(parseAdjudication(JSON.stringify({...base,disposition:'needs_decision',why_out_of_scope:'超出范围',escalate_to:'doubao'}),{task_id:'DEEP-X',input_sha256:HASH}).error,'adjudication_required_fields_missing');
});
test('scope_ref must exist in the registry and every action must stay inside it',()=>{
  const base={task_id:'DEEP-X',input_sha256:HASH,reason:'判定依据',disposition:'approve_in_scope',evidence_refs:['docs/a.md'],rollback:'revert commit'};
  const parse=extra=>parseAdjudication(JSON.stringify({...base,...extra}),{task_id:'DEEP-X',input_sha256:HASH});
  assert.equal(parse({scope_ref:'SCOPE-20261117-01',permitted_actions:['更新文档']}).error,'adjudication_scope_unknown');
  assert.equal(parse({scope_ref:'SCOPE-INTERNAL-DOCS-20261117',permitted_actions:['执行生产部署']}).error,'adjudication_permitted_action_in_funds_family');
  assert.equal(parse({scope_ref:'SCOPE-INTERNAL-DOCS-20261117',permitted_actions:['修改 worker 队列派发代码']}).error,'adjudication_permitted_action_outside_scope');
  assert.equal(parse({scope_ref:'SCOPE-INTERNAL-DOCS-20261117',permitted_actions:['更新文档','购买订阅']}).error,'adjudication_permitted_action_in_funds_family');
  assert.equal(parse({scope_ref:'SCOPE-INTERNAL-QUEUE-20261117',permitted_actions:['补充队列回执文档']}).ok,true);
});
test('a relay verdict cannot assert execution, acceptance or a different binding',()=>{
  const base={task_id:'DEEP-X',input_sha256:HASH,reason:'判定依据',disposition:'needs_decision',why_out_of_scope:'范围外',escalate_to:'gpt_decision_seat'};
  for(const claim of ['accepted','deployed','paid','financial_execution']){
    const r=parseAdjudication(JSON.stringify({...base,[claim]:true}),{task_id:'DEEP-X',input_sha256:HASH});
    assert.equal(r.ok,false,claim);assert.match(r.error,new RegExp('may_not_assert_execution_'+claim));
  }
  assert.equal(parseAdjudication(JSON.stringify({...base,task_id:'DEEP-Y'}),{task_id:'DEEP-X',input_sha256:HASH}).error,'adjudication_task_binding_mismatch');
  assert.equal(parseAdjudication(JSON.stringify({...base,input_sha256:'d'.repeat(64)}),{task_id:'DEEP-X',input_sha256:HASH}).error,'adjudication_input_binding_mismatch');
  assert.equal(parseAdjudication(JSON.stringify({...base,disposition:'auto_approve_everything'}),{task_id:'DEEP-X',input_sha256:HASH}).error,'adjudication_disposition_unknown');
  assert.equal(parseAdjudication('not json',{task_id:'DEEP-X',input_sha256:HASH}).error,'adjudication_json_invalid');
  assert.equal(parseAdjudication(JSON.stringify({task_id:'DEEP-X',input_sha256:HASH,disposition:'needs_decision',why_out_of_scope:'范围外',escalate_to:'owner'}),{task_id:'DEEP-X',input_sha256:HASH}).error,'adjudication_reason_missing');
});
test('records and prompts keep the third-party relay labelling and binding',()=>{
  const rec=adjudicationRecord({task_id:'DEEP-X',input_sha256:HASH,decision:{disposition:'approve_in_scope',reason:'ok'},receipt:{actual_model:'gpt-6.1-sol',request_id:'req-1'}});
  assert.equal(rec.relay_attested,false);assert.equal(rec.actual_provider,'apisrouter_relay');
  assert.equal(rec.accepted,false);assert.equal(rec.deployed,false);assert.equal(rec.financial_execution,false);assert.equal(rec.execution_authority,false);
  assert.equal(rec.decision_authority,'bounded_adjudication_owner_delegated_except_funds_and_five_signature');
  assert.equal(rec.budget_gate,'relay_proxy_durable_object');
  assert.equal(rec.input_classification,'public_distributable');
  const msgs=adjudicationPrompt({task_id:'DEEP-X',input_sha256:HASH,input_text:'补充口径文档'});
  assert.match(msgs[0].content,/approve_in_scope/);assert.match(msgs[0].content,new RegExp(HASH));
  assert.match(msgs[0].content,/funds/);
});

test('worker accounting matches the proxy price table and the per-call cap',()=>{
  assert.deepEqual(RELAY_PRICES,MODEL_PRICES);
  const estimate=estimateWorstCaseCost({model:'gpt-6.1-sol',messages:[{role:'user',content:'中文'.repeat(3000)}],maxCompletionTokens:256});
  assert.ok(estimate>0&&estimate<=MAX_CALL_COST_USD);
  assert.equal(estimateWorstCaseCost({model:'gpt-5.5',messages:[{role:'user',content:'x'}],maxCompletionTokens:1}),null);
  // A station-reported prompt count of zero must not lower the billed floor.
  assert.equal(usageCostUsd({model:'gpt-6.1-sol',reportedPromptTokens:0,estimatedInputTokens:5000,completionTokens:0}),Number(((5000+1446)*1.5/1e6).toFixed(6)));
});

// --- runtime wiring -------------------------------------------------------
test('funds items short-circuit inside the worker without any relay call',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('relay must not be called');};
  const {status,payload,stored}=await adjudicate(job({prompt:'把退款展示防御 F1-F7 自动化上线'}));
  assert.equal(status,202);assert.equal(payload.status,'needs_decision');assert.equal(payload.relay_called,false);
  assert.equal(payload.escalate_to,'gpt_decision_seat');assert.equal(calls,0);
  assert.equal(stored.model_calls,0);assert.equal(stored.financial_execution,false);assert.equal(stored.accepted,false);
});
test('a non-configured relay seat fails closed instead of falling back',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('no relay');};
  const {status,payload}=await adjudicate(job(),{env:relayEnv({enabled:false})});
  assert.equal(status,202);assert.equal(payload.status,'undecided');assert.match(payload.error,/relay_gpt_not_enabled_relay_proxy_token_missing/);
  assert.equal(calls,0);assert.equal(payload.relay_attested,false);
});
test('a valid relay verdict is stored bound, labelled third-party and without execution flags',async()=>{
  let calls=0;globalThis.fetch=async(url,init)=>{
    calls++;assert.match(String(url),/ltzzz-relay-proxy\.ltzyz2181\.workers\.dev\/v1\/chat\/completions/);
    assert.equal(init.headers['x-ltzzz-batch'],'1');
    const body=JSON.parse(init.body);assert.equal(body.model,'gpt-6.1-sol');
    return Response.json({id:'relay-req-1',model:'gpt-6.1-sol',usage:{total_tokens:900,prompt_tokens:700,completion_tokens:200},choices:[{finish_reason:'stop',message:{content:JSON.stringify({disposition:'approve_in_scope',reason:'在授权范围内，证据路径完整',task_id:'DEEP-SUPERAGENT-20261117-ADJ',input_sha256:HASH,scope_ref:'SCOPE-INTERNAL-DOCS-20261117',permitted_actions:['补写口径文档'],evidence_refs:['docs/OWNER-AUTHORITY-CURRENT.md'],rollback:'revert commit'})}}]},{headers:{'x-ltzzz-cost-usd':'0.004321','x-ltzzz-balance-after-usd':'12.732766','x-ltzzz-budget-reservation':'res-1'}});
  };
  const {status,payload,stored}=await adjudicate(job());
  assert.equal(status,200);assert.equal(payload.status,'adjudicated');assert.equal(payload.relay_called,true);
  assert.equal(payload.decision.disposition,'approve_in_scope');assert.equal(payload.relay_attested,false);
  assert.equal(payload.accepted,false);assert.equal(payload.deployed,false);assert.equal(payload.financial_execution,false);
  assert.equal(stored.model_calls,1);assert.equal(stored.accepted,false);assert.equal(stored.deployed,false);
  assert.equal(stored.receipts.at(-1).stage,'relay_adjudication');
  assert.equal(stored.receipts.at(-1).decision_authority,'bounded_adjudication_owner_delegated_except_funds_and_five_signature');
  assert.equal(payload.audit.prompt_tokens,700);
  assert.equal(payload.audit.completion_tokens,200);
  assert.equal(payload.audit.actual_cost_usd,0.004321);
  assert.equal(payload.audit.balance_after_usd,12.732766);
  assert.equal(payload.audit.budget_reservation_id,'res-1');
  assert.equal(payload.audit.estimated_cost_usd,stored.receipts.at(-1).estimated_cost_usd);
  assert.ok(Number.isFinite(payload.audit.latency_ms));
});
test('malformed or execution-claiming verdicts become undecided and are not retried',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({id:'relay-req-2',model:'gpt-6.1-sol',choices:[{finish_reason:'stop',message:{content:'not json at all'}}]});};
  const first=await adjudicate(job());
  assert.equal(first.status,202);assert.equal(first.payload.status,'undecided');assert.equal(first.payload.error,'adjudication_json_invalid');
  assert.equal(calls,1);
  const again=await adjudicate(job({adjudication:{adjudication_id:'ADJ-20261117-01',status:'undecided'}}));
  assert.equal(again.payload.duplicate,true);assert.equal(calls,1);
  globalThis.fetch=async()=>{calls++;return Response.json({id:'relay-req-3',model:'gpt-6.1-sol',choices:[{finish_reason:'stop',message:{content:JSON.stringify({disposition:'approve_in_scope',reason:'ok',task_id:'DEEP-SUPERAGENT-20261117-ADJ',input_sha256:HASH,scope_ref:'SCOPE-20261117-01',permitted_actions:['x'],evidence_refs:['docs/a.md'],rollback:'r',accepted:true})}}]});};
  const claimed=await adjudicate(job());
  assert.equal(claimed.payload.status,'undecided');assert.equal(claimed.payload.error,'adjudication_may_not_assert_execution_accepted');
});
test('a different adjudication id cannot overwrite an existing verdict',async()=>{
  const {status}=await adjudicate(job({adjudication:{adjudication_id:'ADJ-OTHER',status:'adjudicated',decision:{disposition:'needs_decision'}}}),{body:{adjudication_id:'ADJ-20261117-02'}});
  assert.equal(status,409);
});
test('non-terminal jobs and unknown request fields are refused before a provider call',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('no relay');};
  const pending=await adjudicate(job({terminal:false,status:'queued'}));
  assert.equal(pending.status,409);assert.equal(calls,0);
  const bad=await adjudicate(job(),{body:{adjudication_id:'ADJ-20261117-03',execute:true}});
  assert.equal(bad.payload.error,'invalid_adjudication_request');assert.equal(calls,0);
});
test('non-public input is refused before any relay egress',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('relay must not be called');};
  const {status,payload}=await adjudicate(job({data_classification:'internal'}));
  assert.equal(status,403);assert.equal(payload.error,'adjudication_public_distributable_input_required');
  assert.equal(calls,0);
});
test('concurrent adjudication calls share one atomic claim and one provider call',async()=>{
  const storage=new Storage();await storage.put('job',job());
  const task=new DeepTask({storage},relayEnv());
  const realFetch=globalThis.fetch;
  let calls=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  globalThis.fetch=async()=>{
    calls+=1;await gate;
    return Response.json({id:'relay-concurrent-1',model:'gpt-6.1-sol',choices:[{finish_reason:'stop',message:{content:JSON.stringify({disposition:'needs_decision',reason:'需要人工确认',why_out_of_scope:'范围外',escalate_to:'gpt_decision_seat',task_id:'DEEP-SUPERAGENT-20261117-ADJ',input_sha256:HASH})}}]});
  };
  try{
    const body=JSON.stringify({adjudication_id:'ADJ-20261117-09'});
    const send=()=>task.fetch(new Request('https://task.internal/adjudication',{method:'POST',headers,body}));
    const first=send();
    for(let index=0;index<400&&calls===0;index+=1)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(calls,1);
    const second=await send();
    assert.equal(second.status,202);
    const secondBody=await second.json();
    assert.equal(secondBody.status,'in_progress');
    assert.equal(secondBody.duplicate,true);
    assert.equal(secondBody.relay_called,null);
    release();
    const firstResponse=await first;
    assert.equal(firstResponse.status,200);
    const firstBody=await firstResponse.json();
    assert.equal(firstBody.status,'adjudicated');
    assert.equal(calls,1);
  }finally{globalThis.fetch=realFetch;}
});
test('an abandoned claim becomes undecided and is never replayed',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls+=1;throw Error('relay must not be called');};
  const expired={adjudication_id:'ADJ-20261117-08',status:'in_flight',claimed_at:'2026-01-01T00:00:00.000Z',lease_until:'2026-01-01T00:03:00.000Z'};
  const {status,payload,stored}=await adjudicate(job({adjudication_claim:expired}),{body:{adjudication_id:'ADJ-20261117-08'}});
  assert.equal(status,202);assert.equal(payload.status,'undecided');
  assert.equal(payload.error,'adjudication_claim_abandoned_no_retry');
  assert.equal(payload.relay_called,true);
  assert.equal(calls,0);assert.equal(stored.adjudication_claim,undefined);
  assert.equal(stored.adjudication.adjudication_id,'ADJ-20261117-08');
});
test('a live claim with another id is a conflict, not a second call',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls+=1;throw Error('relay must not be called');};
  const live={adjudication_id:'ADJ-OTHER',status:'in_flight',claimed_at:new Date().toISOString(),lease_until:new Date(Date.now()+60000).toISOString()};
  const {status}=await adjudicate(job({adjudication_claim:live}),{body:{adjudication_id:'ADJ-20261117-07'}});
  assert.equal(status,409);assert.equal(calls,0);
});
test('routine escalation names the GPT decision queue, not the owner mailbox',()=>{
  const escalation=new DeepTask({storage:new Storage()},relayEnv()).escalation(job(),'routine internal decision');
  assert.equal(escalation.queue,'gpt_decision_queue');
  assert.equal(escalation.delivery,'gpt_decision_queue_not_owner_approval');
  assert.equal(escalation.email_sent,false);
  assert.equal(escalation.personal_owner_approval_required,false);
  assert.equal(JSON.stringify(escalation).includes('@'),false);
});
