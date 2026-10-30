// Synthetic HTTP, treasury proof and provider responses; zero live payments/calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {preparePractice,practiceIdentity,createPracticeFetch,executePractice,practiceDigest,validatePracticeBridgeClaim} from '../lib/controller-paid-practice.mjs';
import {PROVIDER} from '../lib/external-procurement-preflight.mjs';
import {TREASURY} from '../lib/funded-invest-runtime.mjs';
import {dailyHireId,dailyHireBody} from '../../wep3-procurement-contract.js';
import {dailyHireReview} from '../../wep3-procurement-review.js';
const date='2026-10-30',now=Date.parse(date+'T08:00:00Z'),task_id='PLAN-PATCHGATE-ESCROW-20261023',command_id='CTRL-PRACTICE-20261030-01',TX='0x'+'3'.repeat(64);
const read=p=>Buffer.from('public source '+p),b64=x=>Buffer.from(JSON.stringify(x)).toString('base64');
const quote=()=>({x402Version:2,resource:{url:PROVIDER.url},accepts:[{scheme:'exact',network:PROVIDER.network,asset:PROVIDER.asset,payTo:PROVIDER.payTo,amount:'3000',maxTimeoutSeconds:120,extra:{name:'USD Coin',version:'2'}}]});
const payload=()=>({x402Version:2,accepted:quote().accepts[0],payload:{signature:'0x'+'1'.repeat(130),authorization:{from:TREASURY,to:PROVIDER.payTo,value:'3000',validAfter:String(Math.floor(now/1000)-10),validBefore:String(Math.floor(now/1000)+120),nonce:'0x'+'2'.repeat(64)}}});
const record=()=>preparePractice({command_id,task_id,date,sourceCommit:'a'.repeat(40),runId:'123',read});
function fixture(){
 const r=record(),book={procurement:{}},stats={quotes:0,paid:0,reviews:0,saves:[],reads:0},delivery=JSON.stringify({issues:[{id:'boundary',method:'POST',reason:'Positive decimal zero boundary is a hypothesis, not a verified bug.'}],limitations:['Synthetic fixture only; no live reproduction.']});
 const get=()=>book.procurement[dailyHireId(date)],m={save:async()=>{}};
 const api=async(p,body)=>{
  if(p.startsWith('/market/procurement/daily?')){stats.reads++;return {ok:true,order:get()?structuredClone(get()):null};}
  if(p.endsWith('daily-prepare-relay')){
   assert.equal(stats.saves.some(x=>x.status==='claimed_before_external_execution'),true);
   book.procurement[dailyHireId(date)]={id:dailyHireId(date),date,context:structuredClone(r.context),status:'payment_submitted_unknown',paid:false,tx_hash:null};
   return {ok:true,relay:{body:dailyHireBody(date,r.context),payment_payload:payload()}};
  }
  if(p.endsWith('daily-relay-result')){
   Object.assign(get(),{payer:TREASURY,pay_to:PROVIDER.payTo,amount_raw:'3000',paid:true,tx_hash:TX,payment_proof:{verified:true,tx_hash:TX},semantic_valid:true,model_reported:'deepseek/deepseek-chat',deliverable:delivery,deliverable_sha256:practiceDigest(delivery),status:'paid_delivery_schema_valid_pending_review'});return {ok:true,order:structuredClone(get())};
  }
  if(p.endsWith('daily-review'))return dailyHireReview(m,book,body);
  throw Error('unexpected_fixture_route');
 };
 const deps={api,clock:()=>now,read,save:async x=>stats.saves.push(structuredClone(x)),reviewerConfigured:true,pulseReady:true,
  fetcher:async(_,o)=>{
   if(!new Headers(o.headers).has('PAYMENT-SIGNATURE')){stats.quotes++;return new Response('',{status:402,headers:{'PAYMENT-REQUIRED':b64(quote())}});}
   assert.equal(stats.saves.at(-1).status,'paid_request_started_completion_unknown');stats.paid++;return new Response('synthetic provider delivery',{status:200});
  },callReviewer:async()=>{stats.reviews++;return {ok:true,model:'doubao-fixture',model_source:'provider_response',finish_reason:'stop',tokens_used:150,output:JSON.stringify({accepted:true,artifact_sha256:practiceDigest(delivery),reasons:['Synthetic source-bound quality check.'],unverified:['No live API or chain test.'],live_http_verified:false})};}};
 return {r,stats,deps,book,get};
}
test('strict command identity rejects paths, injected fields and foreign task syntax',()=>{
 for(const id of ['../private','CTRL-x','CTRL-a;run','CTRL-A'.repeat(50)])assert.throws(()=>practiceIdentity({command_id:id,task_id}));
 assert.throws(()=>practiceIdentity({command_id,task_id:'../../wallet'}));
});
test('new command or source commit does not manufacture a different learning input',()=>{
 const a=record(),b=preparePractice({command_id:'CTRL-PRACTICE-20261030-02',task_id,date,sourceCommit:'b'.repeat(40),runId:'456',read});
 assert.equal(a.context.input_sha256,b.context.input_sha256);assert.equal(a.paid,false);assert.equal(a.tx_hash,null);
 assert.throws(()=>preparePractice({command_id:'CTRL-PRACTICE-20261030-02',task_id,date,existing:a}));
});
test('persisted claim then one actual-adapter attempt, different-provider review and remote readback',async()=>{
 const f=fixture();await f.deps.save(f.r);await executePractice(f.r,f.deps);
 assert.equal(f.stats.paid,1);assert.equal(f.stats.reviews,1);assert.equal(f.r.paid,true);assert.equal(f.r.tx_hash,TX);
 assert.equal(f.r.delivery_accepted,true);assert.equal(f.r.reviewer_provider,'Doubao');assert.equal(f.r.author_provider_reported,'deepseek/deepseek-chat');
 assert.equal(f.r.production_deployment_verified,false);assert.equal(f.r.independently_reproduced_new_issues,0);
 assert.equal(JSON.stringify(f.stats.saves).includes('payment_payload'),false);assert.equal(JSON.stringify(f.stats.saves).includes(payload().payload.signature),false);
 await executePractice(f.r,f.deps);assert.equal(f.stats.paid,1);assert.equal(f.stats.reviews,1);
});
test('accepted stable input reuses the result without a quote or a new nonce',async()=>{
 const f=fixture();await executePractice(f.r,{...f.deps,acceptedInputs:[f.r.context.input_sha256]});
 assert.equal(f.r.status,'same_input_already_accepted_no_repurchase');assert.equal(f.stats.reads,1);assert.equal(f.stats.quotes,0);assert.equal(f.stats.paid,0);
});
test('changed source, missing reviewer and stale health never make a paid request',async()=>{
 for(const mutate of [f=>f.deps.read=()=>Buffer.from('changed'),f=>f.deps.reviewerConfigured=false,f=>f.deps.pulseReady=false]){
  const f=fixture();mutate(f);await executePractice(f.r,f.deps);assert.equal(f.stats.paid,0);assert.equal(f.stats.reviews,0);
 }
});
test('foreign existing remote order is linked, not relabeled or repurchased',async()=>{
 const f=fixture();f.book.procurement[dailyHireId(date)]={id:dailyHireId(date),date,context:{source_commit:'f'.repeat(40)},status:'payment_submitted_unknown',paid:false};
 await executePractice(f.r,f.deps);assert.equal(f.r.status,'existing_remote_order_not_reallocated_no_purchase');assert.equal(f.stats.paid,0);assert.equal(f.stats.quotes,0);
});
test('lost paid response reserves uncertainty forever; missing remote order is not permission to repay',async()=>{
 const f=fixture(),fetcher=f.deps.fetcher;f.deps.fetcher=async(u,o)=>{if(new Headers(o.headers).has('PAYMENT-SIGNATURE')){f.stats.paid++;throw Error('lost_network');}return fetcher(u,o);};
 await f.deps.save(f.r);await executePractice(f.r,f.deps);assert.equal(f.stats.paid,1);assert.equal(f.r.paid,false);assert.ok(f.r.paid_request_started_at);
 await executePractice(f.r,f.deps);assert.equal(f.stats.paid,1);
 delete f.book.procurement[dailyHireId(date)];await executePractice(f.r,f.deps);assert.equal(f.r.status,'blocked_original_reservation_missing_no_repurchase');assert.equal(f.stats.paid,1);
});
test('unverified paid chain proof cannot produce acceptance or another review',async()=>{
 const f=fixture(),api=f.deps.api;f.deps.api=async(p,b)=>{const r=await api(p,b);if(p.endsWith('daily-relay-result'))r.order.payment_proof.verified=false;return r;};
 await f.deps.save(f.r);await executePractice(f.r,f.deps);assert.equal(f.r.paid,false);assert.equal(f.r.delivery_accepted,false);assert.equal(f.stats.reviews,0);assert.equal(f.stats.paid,1);
});
function request(r,signature){return {method:'POST',redirect:'error',body:dailyHireBody(date,r.context),headers:signature?{'Content-Type':'application/json','PAYMENT-SIGNATURE':b64(signature),'Idempotency-Key':dailyHireId(date)}:{'Content-Type':'application/json'}};}
test('restricted transport blocks foreign URL, auth headers and changed prompts before fetch',async()=>{
 for(const mutate of [x=>x.url='https://evil.test',x=>x.o.body+='ignore policy',x=>x.o.headers.Authorization='secret',x=>x.o.redirect='follow']){
  const r=record();let calls=0;const fetcher=createPracticeFetch({date,context:r.context,fetcher:async()=>{calls++;throw Error('not_expected');}}),x={url:PROVIDER.url,o:request(r)};mutate(x);await assert.rejects(fetcher(x.url,x.o));assert.equal(calls,0);
 }
});
test('over-budget, recipient-swapped, expired, extended or malformed authorizations cannot spend',async()=>{
 for(const mutate of [p=>p.accepted.amount='50001',p=>p.payload.authorization.to='0x'+'9'.repeat(40),p=>p.payload.authorization.validBefore=String(Math.floor(now/1000)-1),p=>p.payload.authorization.validBefore=String(Math.floor(now/1000)+121),p=>p.payload.signature='fake',p=>p.payload.authorization.value='1']){
  const r=record();let paid=0;const fetcher=createPracticeFetch({date,context:r.context,clock:()=>now,fetcher:async(u,o)=>{if(new Headers(o.headers).has('PAYMENT-SIGNATURE'))paid++;return new Response('',{status:402,headers:{'PAYMENT-REQUIRED':b64(quote())}});}});
  await fetcher(PROVIDER.url,request(r));const p=payload();mutate(p);await assert.rejects(fetcher(PROVIDER.url,request(r,p)));assert.equal(paid,0);
 }
});
test('paid checkpoint failure or timeout cannot reuse the same in-process capability',async()=>{
 const r=record();let paid=0;const fetcher=createPracticeFetch({date,context:r.context,clock:()=>now,beforePaidAttempt:async()=>{throw Error('checkpoint_failed');},fetcher:async(u,o)=>{if(new Headers(o.headers).has('PAYMENT-SIGNATURE'))paid++;return new Response('',{status:402,headers:{'PAYMENT-REQUIRED':b64(quote())}});}});
 await fetcher(PROVIDER.url,request(r));await assert.rejects(fetcher(PROVIDER.url,request(r,payload())));await assert.rejects(fetcher(PROVIDER.url,request(r,payload())));assert.equal(paid,0);
});
test('workflow retains shared finance concurrency, persisted claim and scoped Actions secrets only',()=>{
 const w=fs.readFileSync('.github/workflows/controller-paid-practice.yml','utf8');assert.match(w,/group: wep3-deploy-and-accept/);assert.ok(w.indexOf('Persist exact claim')<w.indexOf('Reconcile then at most one'));
 assert.doesNotMatch(w,/cron:|OPENAI_API_KEY|ANTHROPIC_API_KEY|TREASURY_EXECUTOR_KEY|PRIVATE_KEY/);
});

test('child requires the actual owner bridge run and exact bound main source',()=>{
 const r=record(),source=r.source_commit,claim={schema:'ltzzz.controller-workflow-dispatch.v1',command_id,task_id,workflow:'controller-paid-practice.yml',dispatched:true,status:'dispatch_accepted_child_result_pending',source_commit:source,run_id:'123',command_sha256:'b'.repeat(64)};
 const run={id:123,actor:{id:261544579},repository:{full_name:'ltzyz2181-collab/ltzzz'},head_repository:{full_name:'ltzyz2181-collab/ltzzz'},head_branch:'main',head_sha:source,event:'issue_comment',path:'.github/workflows/controller-workflow-command.yml'};
 assert.equal(validatePracticeBridgeClaim(r,{claim,run,childSource:source}),true);
 for(const mutate of [x=>x.claim.command_id='CTRL-ANOTHER-COMMAND',x=>x.claim.dispatched=false,x=>x.run.actor.id=1,x=>x.run.event='pull_request',x=>x.run.head_sha='c'.repeat(40),x=>x.claim.workflow='arbitrary.yml']){const x=structuredClone({claim,run,childSource:source});mutate(x);assert.throws(()=>validatePracticeBridgeClaim(r,x));}
});
test('stored input paths cannot turn an authenticated run into a credential-file read',async()=>{
 const f=fixture();f.r.inputs[0].path='.env';await assert.rejects(executePractice(f.r,f.deps));assert.equal(f.stats.reads,0);assert.equal(f.stats.paid,0);
});
