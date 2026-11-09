import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Market,hash} from '../../wep3-market.js';import {MarketRuntimeV3} from '../../wep3-worker.js';import {AAVE_RUNTIME_REVISION} from '../../wep3-aave.js';
globalThis.crypto??=crypto.webcrypto;
import {transactionSignerStatus} from '../../wep3-signer-status.js';
import {readSignerStatus,readSignerStatusWithPropagation} from '../lib/signer-status-readback.mjs';

test('signer status requires auth and observes only the guarded transaction adapter without effects',async()=>{
 let saved={ledger:[{id:'existing'}],orders:{},aave:{active_intent:'preserved'}};const before=structuredClone(saved);let writes=0,network=0;
 const env={LAB_PIN:'pin',WEP3_SOURCE_COMMIT:'a'.repeat(40)};
 for(const key of ['TREASURY_EXECUTOR_KEY','FUNDING_EXECUTOR_KEY','PRIVATE_KEY'])Object.defineProperty(env,key,{enumerable:true,get(){throw Error('credential must never be read');}});
 const market=new Market({storage:{async get(){return structuredClone(saved)},async put(k,v){writes++;saved=v;}}},env);
 const original=globalThis.fetch;globalThis.fetch=async()=>{network++;throw Error('no RPC or signer calls');};
 try{
  for(const scope of ['aave_supply','snapshot_anchor']){
   const route='/market/aave/status?capability='+scope;
   assert.equal((await send(market,route)).status,401);
   assert.equal((await send(market,route,undefined,{'X-Lab-Pin':'wrong'})).status,401);
   const r=await send(market,route,undefined,{'X-Lab-Pin':'pin'});
   assert.equal(r.status,200);assert.equal(r.body.schema,'ltzzz.treasury-signer-status.v1');assert.equal(r.body.revision,'wep3-signer-status-v1');assert.equal(r.body.scope,scope);assert.equal(r.body.source_commit,'a'.repeat(40));
   assert.equal(r.body.configured,false);assert.equal(r.body.control_verified,null);assert.equal(r.body.control_evidence,null);assert.equal(r.body.transaction_adapter_ready,false);assert.equal(r.body.signed,false);assert.equal(r.body.transactions,0);
  }
  assert.equal((await send(market,'/market/aave/status?capability=wrong',undefined,{'X-Lab-Pin':'pin'})).status,400);
  assert.equal((await send(market,'/market/aave/status?capability=aave_supply&capability=snapshot_anchor',undefined,{'X-Lab-Pin':'pin'})).status,400);
  const publicStatus=await send(market,'/market/aave/status');assert.equal(publicStatus.body.error,'treasury_missing');assert.equal(publicStatus.body.schema,undefined);
  assert.equal(writes,0);assert.equal(network,0);assert.deepEqual(saved,before);
 }finally{globalThis.fetch=original;}
});

test('deployment readback uses six GETs, isolates scopes, and retains only safe fields',async()=>{
 const sha='b'.repeat(40),calls=[];
 const fetcher=async(url,options)=>{calls.push({url,method:options.method});const scope=new URL(url).searchParams.get('capability');const auth=options.headers['X-Lab-Pin'];return Response.json(auth==='fixture-token'?{...transactionSignerStatus({WEP3_SOURCE_COMMIT:sha},scope),future_private_value:'never-export-this'}:{ok:false,error:'pin_required'},{status:auth==='fixture-token'?200:401});};
 const report=await readSignerStatus({base:'https://fixture.invalid',token:'fixture-token',sourceCommit:sha,fetcher});
 assert.equal(report.ok,true);assert.equal(calls.length,6);assert.equal(calls.every(c=>c.method==='GET'),true);assert.equal(report.rows.every(r=>r.gate.state==='missing'),true);assert.equal(JSON.stringify(report).includes('never-export-this'),false);assert.equal(JSON.stringify(report).includes('fixture-token'),false);
});

test('signer status propagation poll retries only bounded read-only GET checks and stops on verified contract',async()=>{
 const sha='b'.repeat(40);let requests=0,pauses=0,clock=0;
 const fetcher=async(url,options)=>{requests++;assert.equal(options.method,'GET');const auth=options.headers['X-Lab-Pin'];if(requests<=6)return Response.json({ok:false,error:'old_edge'}, {status:200});return Response.json(auth==='fixture-token'?{...transactionSignerStatus({WEP3_SOURCE_COMMIT:sha},new URL(url).searchParams.get('capability'))}:{ok:false,error:'pin_required'},{status:auth==='fixture-token'?200:401});};
 const report=await readSignerStatusWithPropagation({base:'https://fixture.invalid',token:'fixture-token',sourceCommit:sha,fetcher,pause:async ms=>{assert.equal(ms,5000);pauses++;},now:()=>String(++clock)});
 assert.equal(report.ok,true);assert.equal(requests,12);assert.equal(pauses,1);assert.equal(report.propagation.attempts.length,2);assert.equal(report.propagation.verified_attempt,2);assert.equal(report.propagation.complete,true);
});

test('signer status propagation poll stops fail-closed at its strict retry bound',async()=>{
 let requests=0,pauses=0;
 const report=await readSignerStatusWithPropagation({base:'https://fixture.invalid',token:'fixture-token',sourceCommit:'b'.repeat(40),attempts:3,fetcher:async(url,options)=>{requests++;assert.equal(options.method,'GET');return Response.json({ok:false,error:'stale_or_auth_failure'},{status:200});},pause:async()=>{pauses++;}});
 assert.equal(report.ok,false);assert.equal(requests,18);assert.equal(pauses,2);assert.equal(report.propagation.attempts.length,3);assert.equal(report.propagation.verified_attempt,null);assert.equal(report.propagation.complete,false);
});

test('deployment readback rejects a stale source and any claim that the adapter was enabled',async()=>{
 for(const patch of [{source_commit:'c'.repeat(40)},{configured:true},{control_verified:true},{transactions:1}]){
  const fetcher=async(url,options)=>Response.json(options.headers['X-Lab-Pin']==='fixture-token'?{...transactionSignerStatus({WEP3_SOURCE_COMMIT:'b'.repeat(40)},new URL(url).searchParams.get('capability')),...patch}:{ok:false},{status:options.headers['X-Lab-Pin']==='fixture-token'?200:401});
  assert.equal((await readSignerStatus({base:'https://fixture.invalid',token:'fixture-token',sourceCommit:'b'.repeat(40),fetcher})).ok,false);
 }
});
const secret='whsec_fixture';
test('renamed runtime reuses existing book; authenticated state proof hides signed bytes and does not mutate',async()=>{
 const f=fixture(),book=await f.market.read();book.orders.historical={id:'historical',status:'delivered'};
 book.aave={first_supply_confirmed:true,exit_test_confirmed:true,intents:{historical:{steps:[{raw:'private-signed-fixture'}]}}};
 await f.storage.put('book',book);const replacement=new MarketRuntimeV3({storage:f.storage},{LAB_PIN:'pin'});
 assert.equal((await send(replacement,'/market/runtime-state')).status,401);
 const r=await send(replacement,'/market/runtime-state',undefined,{'X-Lab-Pin':'pin'});
 assert.equal(r.status,200);assert.equal(r.body.market_runtime_revision,'market-runtime-v3');assert.equal(r.body.aave_runtime_revision,AAVE_RUNTIME_REVISION);
 assert.equal(r.body.first_supply_confirmed,true);assert.equal(r.body.exit_test_confirmed,true);assert.equal(r.body.aave_intent_count,1);assert.equal(r.body.order_count,1);
 assert.equal(r.body.book_sha256,await hash(JSON.stringify(book)));assert.equal(JSON.stringify(r.body).includes('private-signed-fixture'),false);assert.deepEqual(await f.storage.get('book'),book);
});
function fixture(){let saved;const storage={async get(){return structuredClone(saved)},async put(k,v){saved=structuredClone(v)}};const market=new Market({storage},{LAB_PIN:'pin',STRIPE_WEBHOOK_SECRET:secret,PAY_KV:{async get(){return {score:100}}}});return {market,storage};}
async function send(m,p,b,headers={}){const r=await m.fetch(new Request('https://test'+p,{method:b===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:b===undefined?undefined:JSON.stringify(b)}));return {status:r.status,body:await r.json()};}
async function seed(f,live=true){const book=await f.market.read();book.orders.o={id:'o',worker:'DeepSeek',skill:'scan',amount_cents:500,currency:'usd',session_id:'cs_1',live,status:'awaiting_payment',children:[],parent_id:null,brief:'A real customer research brief',access_hash:await hash('buyer')};await f.storage.put('book',book);}
async function event(m,changes={},id='evt_1',live=true){const e={id,type:'checkout.session.completed',livemode:live,data:{object:{id:'cs_1',metadata:{order_id:'o'},amount_total:500,currency:'usd',livemode:live,payment_status:'paid',...changes}}};const raw=JSON.stringify(e),t=Math.floor(Date.now()/1000);const sig=crypto.createHmac('sha256',secret).update(t+'.'+raw).digest('hex');const r=await m.fetch(new Request('https://test/market/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':`t=${t},v1=${sig}`},body:raw}));return {status:r.status,body:await r.json()};}
test('unsigned payment cannot credit pool',async()=>{const f=fixture();await seed(f);const r=await send(f.market,'/market/stripe/webhook',{});assert.equal(r.status,400);assert.equal((await f.market.read()).live_revenue_cents,0)});
test('mismatched amount and unpaid events never credit',async()=>{const f=fixture();await seed(f);assert.equal((await event(f.market,{amount_total:1})).status,422);await event(f.market,{payment_status:'unpaid'});assert.equal((await f.market.read()).live_revenue_cents,0)});
test('concurrent webhook retries reserve budget once',async()=>{const f=fixture();await seed(f);await Promise.all([event(f.market),event(f.market,{},'evt_2'),event(f.market)]);const b=await f.market.read();assert.equal(b.live_revenue_cents,500);assert.equal(b.pool_reserved_cents,200);assert.equal(b.pool_available_cents,300);assert.equal(b.ledger.length,1)});
test('test payment does not enter real pool',async()=>{const f=fixture();await seed(f,false);assert.equal((await event(f.market,{},'evt_test',false)).status,200);const b=await f.market.read();assert.equal(b.test_revenue_cents,500);assert.equal(b.live_revenue_cents,0);assert.equal(b.pool_available_cents,0);assert.equal(b.pool_reserved_cents,0)});
test('buyer order requires private capability',async()=>{const f=fixture();await seed(f);assert.equal((await send(f.market,'/market/order/o')).status,401);const r=await send(f.market,'/market/order/o',undefined,{'X-Order-Token':'buyer'});assert.equal(r.status,200);assert.equal(r.body.order.access_hash,undefined)});
test('self review and missing delivery cannot settle; real audit hashes are reproducible',async()=>{const f=fixture();await seed(f);await event(f.market);const deliverable='Concrete verified research output '.repeat(8),digest=await hash(deliverable);const input={order_id:'o',deliverable,evidence_path:'results/o.json',reasoning_summary:'Produced a source checked report for the customer research brief.',audit:{accepted:true,auditor:'DeepSeek',deliverable_sha256:digest}};assert.equal((await send(f.market,'/market/complete',input,{'X-Lab-Pin':'pin'})).status,422);input.audit.auditor='GPT';const r=await send(f.market,'/market/complete',input,{'X-Lab-Pin':'pin'});assert.equal(r.status,200);assert.equal(r.body.receipt.deliverable_sha256,digest);assert.equal(r.body.receipt.reasoning_hash,await hash(JSON.stringify(r.body.receipt.reasoning)));await send(f.market,'/market/complete',input,{'X-Lab-Pin':'pin'});const b=await f.market.read();assert.equal(b.agent_credit_cents.DeepSeek,180);assert.equal(b.pool_reserved_cents,0)});
test('subtask allocations cannot exceed paid budget',async()=>{const f=fixture();await seed(f);await event(f.market);assert.equal((await send(f.market,'/market/subtask',{parent_id:'o',skill:'copy',brief:'Create a real video script',budget_cents:201},{'X-Lab-Pin':'pin'})).status,422);const r=await send(f.market,'/market/subtask',{parent_id:'o',skill:'copy',brief:'Create a real video script',budget_cents:150},{'X-Lab-Pin':'pin'});assert.equal(r.status,200);assert.equal((await f.market.read()).orders.o.allocated_cents,150)});
test('skill updates require auth and preserve existing owner',async()=>{const f=fixture();const b={id:'scan',agent:'Doubao',title:'Hijack',price_cents:200};assert.equal((await send(f.market,'/skill/register',b)).status,401);assert.equal((await send(f.market,'/skill/register',b,{'X-Lab-Pin':'pin'})).status,409)});
test('order claims are exclusive and retry cap stops repeated API cost',async()=>{const f=fixture();await seed(f);await event(f.market);const a=await send(f.market,'/market/claim',{order_id:'o'},{'X-Lab-Pin':'pin'});assert.equal(a.status,200);assert.equal(a.body.order.lease_token,undefined);assert.equal((await send(f.market,'/market/claim',{order_id:'o'},{'X-Lab-Pin':'pin'})).status,409);await send(f.market,'/market/fail',{order_id:'o',lease_token:a.body.lease_token},{'X-Lab-Pin':'pin'});const b=await send(f.market,'/market/claim',{order_id:'o'},{'X-Lab-Pin':'pin'});await send(f.market,'/market/fail',{order_id:'o',lease_token:b.body.lease_token},{'X-Lab-Pin':'pin'});assert.equal((await send(f.market,'/market/claim',{order_id:'o'},{'X-Lab-Pin':'pin'})).status,409);assert.equal((await f.market.read()).orders.o.status,'blocked')});

test('x402 arbitrary hash cannot create revenue; simulation requires admin and never joins live queue',async()=>{const f=fixture();let c=await send(f.market,'/market/x402/challenge',{skill:'audit',brief:'A complete audit test brief'});const id=c.body.challenge_id;assert.equal((await send(f.market,'/market/x402/verify',{challenge_id:id,proof:'0x'+'a'.repeat(64)})).status,410);assert.equal((await send(f.market,'/market/x402/verify',{challenge_id:id,proof:'sim_test_123456'})).status,401);let sim=await send(f.market,'/market/x402/verify',{challenge_id:id,proof:'sim_test_123456'},{'X-Lab-Pin':'pin'});assert.equal(sim.status,200);assert.equal(sim.body.live,false);assert.equal((await f.market.read()).live_revenue_cents,0);assert.equal((await f.market.read()).pool_reserved_cents,0);});

test('Aave orphan: execute stays structured 422; auto clears stale pointer and resumes',async()=>{
 const f=fixture(),b=await f.market.read();b.aave={active_intent:'DOUBAO-AAVE-FIRST-38380985712',intents:{}};await f.storage.put('book',b);
 for(const path of ['/market/aave/auto','/market/aave/auto-preview','/market/aave/execute']){
  assert.equal((await send(f.market,path,{})).status,401);
 }
 const ex=await send(f.market,'/market/aave/execute',{},{'X-Lab-Pin':'pin'});assert.equal(ex.status,422);assert.equal(ex.body.error,'orphaned_active_intent_requires_reconciliation');assert.equal(ex.body.signed,false);
 const auto=await send(f.market,'/market/aave/auto',{},{'X-Lab-Pin':'pin'});assert.equal(auto.status,200);assert.equal(auto.body.status,'cleared_stale_active_intent');assert.equal(auto.body.cleared_intent,'DOUBAO-AAVE-FIRST-38380985712');
 const after=await f.market.read();assert.equal(after.aave.active_intent,null);assert.deepEqual(after.aave.intents,{});
 const pre=await send(f.market,'/market/aave/auto-preview',{},{'X-Lab-Pin':'pin'});assert.equal(pre.body.error,'treasury_missing');
});
test('Aave orphan diagnostics stay structured 200 diagnostic without mutation',async()=>{
 const f=fixture(),b=await f.market.read();b.aave={active_intent:'DOUBAO-AAVE-FIRST-38380985712',intents:{}};await f.storage.put('book',b);
 assert.equal((await send(f.market,'/market/aave/diagnostics')).status,401);
 const diagnostic=await send(f.market,'/market/aave/diagnostics',undefined,{'X-Lab-Pin':'pin'});assert.equal(diagnostic.status,200);assert.equal(diagnostic.body.aave_runtime_revision,AAVE_RUNTIME_REVISION);assert.equal(diagnostic.body.balances,undefined);assert.equal(diagnostic.body.storage.error,'orphaned_active_intent_requires_reconciliation');assert.equal(diagnostic.body.signed,false);
});
