import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {Wallet} from 'ethers';
import {dailyHireId,dailyHireBody,inspectProcurementDelivery} from '../../wep3-procurement-contract.js';
import {externalPurchase,completeExternalRelay,PROCUREMENT_ORDER} from '../../wep3-procurement.js';
import {dailyHireReview} from '../../wep3-procurement-review.js';
import {dailyHireAssignment,executeDailyHire} from '../lib/daily-external-hire.mjs';
import {externalAIRelay} from '../lib/external-ai-relay.mjs';
import {AAVE} from '../../wep3-aave.js';
import {TREASURY} from '../lib/funded-invest-runtime.mjs';
const date='2026-10-19',now=()=>Date.parse(date+'T08:00:00Z'),context={source_commit:'a'.repeat(40),input_sha256:'b'.repeat(64),ans_status:'draft_rejected'};
const artifact=()=>({issues:[{id:'method',method:'POST',reason:'The preview method must be POST.'},{id:'limits',method:'GET',reason:'Limits are at the response top level.'}],tests:[200,401].map((status,i)=>({id:'test'+i,expected_http:status,request:{method:'POST',path:'/market/aave/preview',headers:{'X-Lab-Pin':i?'WRONG_PIN_PLACEHOLDER':'VALID_PIN_PLACEHOLDER'},body:{intent_id:'CONTRACT_TEST_INTENT_20261019',action:'supply',amount_usdc:'1'}}}))});
const wallet=Wallet.createRandom(),payTo='0xaBF4FAbd7c416fB67202E5f9002389Fc75e2a9D0';
const quote=()=>({x402Version:2,resource:{url:'https://agent402.tools/v1/nano/chat/completions'},accepts:[{scheme:'exact',network:'eip155:8453',asset:AAVE.usdc,payTo,amount:'3000',maxTimeoutSeconds:120,extra:{name:'USD Coin',version:'2'}}]});
function fixture(value=artifact()){
 const original=JSON.parse(fs.readFileSync('knowledge/results/funded-invest/run-39005569942-attempt-1.json')).external_ai.order;
 const book={procurement:{[PROCUREMENT_ORDER]:structuredClone(original)}},old=JSON.stringify(original);let paid=0,saves=0;
 const m={env:{X402_RECEIVE_ADDRESS:wallet.address,TREASURY_EXECUTOR_KEY:wallet.privateKey},save:async()=>{saves++;}};
 const content=JSON.stringify(value),result={model:'deepseek/deepseek-chat',choices:[{finish_reason:'stop',message:{content}}],usage:{total_tokens:300}};
 const options={date,context,now,execute:true,statusReader:async()=>({ok:true,address:wallet.address,usdc_raw:'20000000',block_number:10}),paymentVerifier:async()=>({verified:true,tx_hash:'0x'+'1'.repeat(64)}),fetcher:async(_,o)=>{if(!o.headers['PAYMENT-SIGNATURE'])return Response.json(quote(),{status:402});paid++;return Response.json(result);}};
 return {book,m,options,result,old,get paid(){return paid;},get saves(){return saves;}};
}
test('strict contract rejects the historical semantic failures even after ID normalization',()=>{
 const original=JSON.parse(fs.readFileSync('knowledge/results/funded-invest/run-39005569942-attempt-1.json')).external_ai.order;
 const checked=inspectProcurementDelivery(original.deliverable,{strict:true});
 assert.equal(checked.structural_valid,true);assert.equal(checked.semantic_valid,false);assert.ok(checked.errors.includes('invalid_preview_body'));assert.ok(checked.errors.includes('invalid_test_auth'));assert.ok(checked.warnings.length);
});
test('wrong method, path, short ID, amount, action, duplicate IDs and auth fail the revised contract',()=>{
 for(const mutate of [a=>a.tests[0].request.method='GET',a=>a.tests[0].request.path='/other',a=>a.tests[0].request.body.intent_id='test123',a=>a.tests[0].request.body.action='deposit',a=>a.tests[0].request.body.amount_usdc=1000,a=>a.tests[0].request.body.amount_usdc='0',a=>a.tests[0].request.headers={Authorization:'invalid'},a=>a.tests[0].request.headers['X-Lab-Pin']='real-or-unapproved-pin',a=>a.tests[1].id=a.tests[0].id]){
  const a=artifact();mutate(a);assert.equal(inspectProcurementDelivery(JSON.stringify(a),{strict:true}).semantic_valid,false);
 }
 assert.equal(inspectProcurementDelivery(JSON.stringify(artifact()),{strict:true}).semantic_valid,true);
});
test('malformed deliveries cannot throw or become valid',()=>{for(const v of ['null','[]','{}','{"issues":[null]}','not-json'])assert.equal(inspectProcurementDelivery(v,{strict:true}).semantic_valid,false);});
test('date and context cannot supply arbitrary prompts or foreign identifiers',()=>{
 for(const date of ['2026-02-30','2026-1-2','../../key'])assert.throws(()=>dailyHireId(date));
 assert.throws(()=>dailyHireBody(date,{...context,prompt:'untrusted instructions'}));
 const body=JSON.parse(dailyHireBody(date,context));assert.equal(body.model,'deepseek/deepseek-chat');assert.equal(body.max_tokens,768);assert.match(body.messages[0].content,/X-Lab-Pin/);
});
test('new daily order pays at most once and preserves the old rejected order byte for byte',async()=>{
 const f=fixture();const first=await externalPurchase(f.m,f.book,f.options),again=await externalPurchase(f.m,f.book,f.options);
 assert.equal(first.order.id,dailyHireId(date));assert.equal(first.order.paid,true);assert.equal(first.order.semantic_valid,true);assert.equal(first.order.delivery_accepted,false);assert.equal(first.order.status,'paid_delivery_schema_valid_pending_review');
 assert.equal(again.reused,true);assert.equal(f.paid,1);assert.equal(JSON.stringify(f.book.procurement[PROCUREMENT_ORDER]),f.old);assert.equal('payment_payload' in first.order,false);
});
test('direct and relay results apply exactly the same semantic rejection',async()=>{
 const bad=artifact();bad.tests[0].request.body.action='deposit';
 for(const relay of [false,true]){const f=fixture(bad);let r=await externalPurchase(f.m,f.book,{...f.options,...(relay?{providedQuote:quote(),relayPrepare:true}:{})});
  if(relay)r=await completeExternalRelay(f.m,f.book,{http:200,body:JSON.stringify(f.result),payment_response:''},{date,paymentVerifier:f.options.paymentVerifier});
  assert.equal(r.order.paid,true);assert.equal(r.order.semantic_valid,false);assert.equal(r.order.delivery_accepted,false);assert.equal(r.order.status,'paid_delivery_rejected');
 }
});
test('unknown payment and pending independent review block spending on a later date',async()=>{
 for(const proof of [true,false]){const f=fixture();await externalPurchase(f.m,f.book,{...f.options,paymentVerifier:async()=>({verified:proof})});
  const r=await externalPurchase(f.m,f.book,{...f.options,date:'2026-10-20',now:()=>Date.parse('2026-10-20T08:00:00Z')});assert.equal(r.error,'prior_daily_order_requires_reconciliation_or_review');assert.equal(f.paid,1);
 }
});
test('over-budget, wrong date and missing evidence never pay',async()=>{
 const f=fixture();const q=quote();q.accepts[0].amount='50001';
 assert.equal((await externalPurchase(f.m,f.book,{...f.options,providedQuote:q})).error,'external_quote_not_accepted');
 assert.equal((await externalPurchase(f.m,f.book,{...f.options,date:'2026-10-18'})).error,'new_daily_order_must_be_today');
 await assert.rejects(externalPurchase(f.m,f.book,{...f.options,context:undefined}),/invalid_hire_context/);assert.equal(f.paid,0);
});
test('independent review requires paid delivery, exact hash, Doubao, a complete response and matching claim',async()=>{
 const f=fixture();const r=await externalPurchase(f.m,f.book,f.options),o=r.order;
 const input={date,claim_id:'review-1',phase:'submit',artifact_sha256:o.deliverable_sha256,executed_by:'Doubao',model:'doubao-seed-2-1-pro-260915',model_source:'provider_response',finish_reason:'stop',tokens_used:100,output:JSON.stringify({accepted:true,artifact_sha256:o.deliverable_sha256,reasons:['Contract and negative control match.'],unverified:['Live API not executed.'],live_http_verified:false})};
 assert.equal((await dailyHireReview(f.m,f.book,{date,claim_id:'review-1',phase:'claim'})).claimed,true);
 assert.equal((await dailyHireReview(f.m,f.book,{date,claim_id:'review-1',phase:'claim'})).claimed,false);
 for(const patch of [{claim_id:'other'},{artifact_sha256:'bad'},{executed_by:'DeepSeek'},{finish_reason:'length'},{tokens_used:0},{model:'gpt-unknown'},{model_source:'requested_model'},{model_source:undefined},{output:'{}'}])assert.equal((await dailyHireReview(f.m,f.book,{...input,...patch})).ok,false);
 const done=await dailyHireReview(f.m,f.book,input);assert.equal(done.delivery_accepted,true);assert.equal(f.book.procurement[dailyHireId(date)].status,'paid_delivery_accepted');
 await dailyHireReview(f.m,f.book,input);assert.equal(f.book.ledger.filter(e=>e.type==='external_AI_delivery_review').length,1);
});
test('an accepted artifact is not bought again merely because the date changes',async()=>{
 const f=fixture();await externalPurchase(f.m,f.book,f.options);const o=f.book.procurement[dailyHireId(date)];o.delivery_accepted=true;o.status='paid_delivery_accepted';
 const r=await externalPurchase(f.m,f.book,{...f.options,date:'2026-10-20',now:()=>Date.parse('2026-10-20T08:00:00Z')});assert.equal(r.status,'same_input_already_accepted_no_repurchase');assert.equal(f.paid,1);
});
test('missing reviewer configuration or stale health prevents even the external purchase',async()=>{
 for(const config of [{reviewerConfigured:false,pulseReady:true},{reviewerConfigured:true,pulseReady:false}]){
  const record=dailyHireAssignment({mode:'external',date,sourceCommit:context.source_commit,context,runId:'test'});record.new_payments_this_run=1;
  await executeDailyHire(record,{...config,relay:()=>{throw Error('must not purchase');}});assert.equal(record.status,'blocked_review_key_or_fresh_health');assert.equal(record.new_payments_this_run,0);
 }
});
test('replaying a paid and reviewed order never calls the reviewer again',async()=>{
 const f=fixture();await externalPurchase(f.m,f.book,f.options);const order=f.book.procurement[dailyHireId(date)];order.status='paid_delivery_accepted';order.delivery_accepted=true;order.independent_review={status:'accepted_engineering_artifact',executed_by:'Doubao',model:'doubao-test',model_source:'provider_response',output:'review'};
 const record=dailyHireAssignment({mode:'external',date,sourceCommit:context.source_commit,context,runId:'test'});
 await executeDailyHire(record,{reviewerConfigured:true,pulseReady:true,relay:async()=>({order}),api:async path=>path.endsWith('daily-review')?{ok:true,claimed:false}:{ok:true,order},callReviewer:()=>{throw Error('duplicate review');}});
 assert.equal(record.review_generation_attempts_this_run,0);assert.equal(record.new_payments_this_run,0);assert.equal(record.status,'paid_delivery_accepted');assert.equal(record.follow_up_receipt.reviewer_provider,'Doubao');
});
test('paid delivery, one real-review adapter response and final readback form an end-to-end acceptance chain',async()=>{
 const f=fixture();let calls=0;
 const record=dailyHireAssignment({mode:'external',date,sourceCommit:context.source_commit,context,runId:'test'});
 const api=async(path,body)=>path.endsWith('daily-review')?dailyHireReview(f.m,f.book,body):externalPurchase(f.m,f.book,{...f.options,execute:false});
 const dependencies={reviewerConfigured:true,pulseReady:true,
  relay:async()=>({...await externalPurchase(f.m,f.book,f.options),paid_request_attempted_this_run:f.paid===1&&!f.book.procurement[dailyHireId(date)]?.independent_review}),api,
  callReviewer:async()=>{calls++;return {ok:true,model:'doubao-seed-2-1-pro-260915',model_source:'provider_response',finish_reason:'stop',tokens_used:125,output:JSON.stringify({accepted:true,artifact_sha256:f.book.procurement[dailyHireId(date)].deliverable_sha256,reasons:['API method, typed body and PIN controls are statically consistent.'],unverified:['Live HTTP and deployment not executed.'],live_http_verified:false})};}};
 await executeDailyHire(record,dependencies);
 assert.equal(record.status,'paid_delivery_accepted');assert.equal(record.follow_up_receipt.delivery_accepted,true);assert.equal(record.follow_up_receipt.reviewer_provider,'Doubao');assert.equal(record.new_payments_this_run,1);assert.equal(calls,1);
 await executeDailyHire(record,dependencies);assert.equal(calls,1);assert.equal(f.paid,1);assert.equal(record.review_generation_attempts_this_run,0);assert.equal(record.new_payments_this_run,0);
});
test('daily scheduler uses persisted dispatch, one shared financial queue and no native paid GPT/Claude calls',()=>{
 const source=fs.readFileSync('.github/workflows/daily-external-hire.yml','utf8');assert.equal((source.match(/cron:/g)||[]).length,1);assert.match(source,/group: wep3-deploy-and-accept/);assert.ok(source.indexOf('Persist dispatch')<source.indexOf('Explicitly selected external payment'));assert.doesNotMatch(source,/OPENAI_API_KEY|ANTHROPIC_API_KEY|TREASURY_EXECUTOR_KEY/);
});
test('relay with an existing daily order does not request another quote or payment',async()=>{
 const order={id:dailyHireId(date),paid:true};const r=await externalAIRelay('fixture',{date,context,api:async path=>{assert.equal(path,'/market/procurement/daily?date='+date);return {ok:true,order};},fetcher:()=>{throw Error('duplicate network');}});assert.equal(r.order,order);
});
test('a lost paid body or failed result import remains one attempted payment and is never replayed',async()=>{
 for(const failAt of ['fetch','body','import']){
  let stored=null,paid=0;
  const body=dailyHireBody(date,context);
  const api=async(path)=>{
   if(path.startsWith('/market/procurement/daily?'))return {ok:true,order:stored};
   if(path.endsWith('daily-prepare-relay')){stored={id:dailyHireId(date),status:'payment_submitted_unknown',paid:false};return {ok:true,relay:{body,payment_payload:{accepted:quote().accepts[0],payload:{authorization:{from:TREASURY,to:payTo,value:'3000'}}}}};}
   if(path.endsWith('daily-relay-result'))throw Error('import unavailable');
   throw Error('unexpected path');
  };
  const fetcher=async(_,options)=>{
   if(!options.headers['PAYMENT-SIGNATURE'])return new Response('',{status:402,headers:{'PAYMENT-REQUIRED':Buffer.from(JSON.stringify(quote())).toString('base64')}});
   paid++;if(failAt==='fetch')throw Error('lost request');
   return {status:200,headers:new Headers(),text:async()=>{if(failAt==='body')throw Error('terminated');return '{}';}};
  };
  const first=await externalAIRelay('fixture',{date,context,api,fetcher});assert.equal(first.paid_request_attempted_this_run,true);assert.equal(first.order.status,'payment_submitted_unknown');
  await externalAIRelay('fixture',{date,context,api,fetcher});assert.equal(paid,1);
 }
});
test('model verdict extras cannot overwrite the claimed reviewer, state or object prototype',async()=>{
 const f=fixture();const {order}=await externalPurchase(f.m,f.book,f.options);
 await dailyHireReview(f.m,f.book,{date,claim_id:'fixed-claim',phase:'claim'});
 const verdict={accepted:true,artifact_sha256:order.deliverable_sha256,reasons:['Valid static regression artifact.'],unverified:['Live HTTP not run.'],live_http_verified:false,status:'forged_status',claim_id:'forged-claim',reviewer_provider:'DeepSeek'};
 Object.defineProperty(verdict,'__proto__',{value:{polluted:true},enumerable:true});
 const r=await dailyHireReview(f.m,f.book,{date,claim_id:'fixed-claim',phase:'submit',artifact_sha256:order.deliverable_sha256,executed_by:'Doubao',model:'doubao-test',model_source:'provider_response',finish_reason:'stop',tokens_used:100,output:JSON.stringify(verdict)});
 assert.equal(r.review.reviewer_provider,'Doubao');assert.equal(r.review.claim_id,'fixed-claim');assert.equal(r.review.status,'accepted_engineering_artifact');assert.equal(r.review.polluted,undefined);assert.equal(Object.getPrototypeOf(r.review),Object.prototype);
});
test('a changed delivery is rejected locally before any paid independent review',async()=>{
 const f=fixture();const result=await externalPurchase(f.m,f.book,f.options);result.order.deliverable+='tampered';
 const record=dailyHireAssignment({mode:'external',date,sourceCommit:context.source_commit,context,runId:'test'});
 await executeDailyHire(record,{reviewerConfigured:true,pulseReady:true,relay:async()=>result,api:()=>{throw Error('must not claim review');},callReviewer:()=>{throw Error('must not call reviewer');}});
 assert.equal(record.status,'blocked_original_delivery_identity_or_hash');assert.equal(record.review_generation_attempts_this_run,0);
});
test('an interrupted review submission resumes from the saved output with no second model call',async()=>{
 const f=fixture();let calls=0,failSubmit=true;
 const record=dailyHireAssignment({mode:'external',date,sourceCommit:context.source_commit,context,runId:'test'});
 const api=async(path,body)=>{
  if(path.endsWith('daily-review')){if(body.phase==='submit'&&failSubmit){failSubmit=false;throw Error('submission interrupted');}return dailyHireReview(f.m,f.book,body);}
  return externalPurchase(f.m,f.book,{...f.options,execute:false});
 };
 const dependencies={reviewerConfigured:true,pulseReady:true,relay:async()=>externalPurchase(f.m,f.book,f.options),api,callReviewer:async()=>{calls++;return {ok:true,model:'doubao-test',model_source:'provider_response',finish_reason:'stop',tokens_used:100,output:JSON.stringify({accepted:true,artifact_sha256:f.book.procurement[dailyHireId(date)].deliverable_sha256,reasons:['Specific contract evidence checked.'],unverified:['Live not run.'],live_http_verified:false})};}};
 await executeDailyHire(record,dependencies);assert.equal(record.status,'blocked_review_submission_no_generation_retry');assert.ok(record.review_response.output);
 await executeDailyHire(record,dependencies);assert.equal(record.status,'paid_delivery_accepted');assert.equal(calls,1);assert.equal(record.review_generation_attempts_this_run,0);assert.equal(f.paid,1);
});
test('a locally observed order missing on the server is never purchased again',async()=>{
 const r=await externalAIRelay('fixture',{date,context,existingOnly:true,api:async()=>({ok:true}),fetcher:()=>{throw Error('must not request a new quote or payment');}});
 assert.equal(r.status,'blocked_original_order_missing_no_repurchase');assert.equal(r.paid,false);
});
test('requested-model fallback cannot become actual independent reviewer identity',async()=>{
 const f=fixture(),record=dailyHireAssignment({mode:'external',date,sourceCommit:context.source_commit,context,runId:'test'});
 const api=async(path,body)=>path.endsWith('daily-review')?dailyHireReview(f.m,f.book,body):externalPurchase(f.m,f.book,{...f.options,execute:false});
 await executeDailyHire(record,{reviewerConfigured:true,pulseReady:true,relay:async()=>externalPurchase(f.m,f.book,f.options),api,callReviewer:async()=>({ok:true,model:'doubao-test',model_source:'requested_model',finish_reason:'stop',tokens_used:100,output:'complete but model identity unverified'})});
 assert.equal(record.review_response.model_source,'requested_model');assert.equal(record.status,'blocked_review_generation');assert.equal(record.order.delivery_accepted,false);assert.equal(record.order.independent_review.failure_kind,'model_identity_unverified');
});
test('error, empty or truncated reviews stay blocked on readback and replay without another model call',async()=>{
 for(const response of [{ok:false},{ok:true,output:''},{ok:true,output:'partial',finish_reason:'length'}]){
  const f=fixture(),record=dailyHireAssignment({mode:'external',date,sourceCommit:context.source_commit,context,runId:'test'});let calls=0;
  const api=async(path,body)=>path.endsWith('daily-review')?dailyHireReview(f.m,f.book,body):externalPurchase(f.m,f.book,{...f.options,execute:false});
  const deps={reviewerConfigured:true,pulseReady:true,relay:async()=>externalPurchase(f.m,f.book,f.options),api,callReviewer:async()=>{calls++;return {model:'doubao-test',model_source:'provider_response',tokens_used:100,finish_reason:'stop',...response};}};
  await executeDailyHire(record,deps);assert.equal(record.status,'blocked_review_generation');assert.equal(record.follow_up_receipt.reviewer_status,'blocked_review_generation');
  await executeDailyHire(record,deps);assert.equal(record.status,'blocked_review_generation');assert.equal(calls,1);assert.equal(f.paid,1);
 }
});
test('static review cannot omit limitations or assert a live HTTP execution',async()=>{
 const f=fixture(),{order}=await externalPurchase(f.m,f.book,f.options);
 await dailyHireReview(f.m,f.book,{date,claim_id:'limitations',phase:'claim'});
 const verdict={accepted:true,artifact_sha256:order.deliverable_sha256,reasons:['Contract checked statically.'],unverified:['Live endpoint not executed.'],live_http_verified:false};
 const input={date,claim_id:'limitations',phase:'submit',artifact_sha256:order.deliverable_sha256,executed_by:'Doubao',model:'doubao-test',model_source:'provider_response',finish_reason:'stop',tokens_used:100};
 for(const patch of [{unverified:[]},{unverified:['  ']},{live_http_verified:true},{live_http_verified:undefined}]){
  assert.equal((await dailyHireReview(f.m,f.book,{...input,output:JSON.stringify({...verdict,...patch})})).ok,false);
  assert.equal(order.delivery_accepted,false);
 }
 const result=await dailyHireReview(f.m,f.book,{...input,output:JSON.stringify(verdict)});
 assert.equal(result.delivery_accepted,true);assert.equal(result.review.live_http_verified,false);assert.match(result.review.unverified[0],/HTTP 200 未实测/);
});
