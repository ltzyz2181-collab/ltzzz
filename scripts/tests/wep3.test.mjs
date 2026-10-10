import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import worker, {Wep3Ledger} from '../../wep3-worker.js';
import {deliveryPayload, isInternalSettlement} from '../wep3-acceptance.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const delivery = 'Concrete reusable checklist | https://ltzzz.com/knowledge/results/wep3/test.json';
function payload(overrides = {}) {
  return {agent:'DeepSeek', worker:'Doubao', skill:'copy', max_usd:0.04, deliverable:delivery, evidence_path:'knowledge/results/wep3/test.json', audit_report:{accepted:true, auditor:'GPT', reason:'Checked the concrete checklist', deliverable_sha256:hash(delivery)}, ...overrides};
}
function fixture(seed = {}) {
  let data = new Map(Object.entries(seed).map(([k,v]) => [k, JSON.stringify(v)]));
  let tail = Promise.resolve();
  let failCommit = false;
  let failLegacyRead = false;
  const legacyData = new Map(data); data.clear();
  const legacy = {
    get: async key => {if(failLegacyRead) throw Error('legacy read failed'); return legacyData.get(key) ?? null;},
    list: async ({prefix}) => ({keys:[...legacyData.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name})),list_complete:true})
  };
  const ctx = {
    blockConcurrencyWhile(fn) {const next=tail.then(fn);tail=next.catch(()=>{});return next;},
    storage: {
      get: async key => data.get(key),
      list: async ({prefix}) => new Map([...data].filter(([k])=>k.startsWith(prefix))),
      transaction: async fn => {
        const copy = new Map(data);
        await fn({put:async rows=>{for(const [k,v] of Object.entries(rows))copy.set(k,v);}});
        if(failCommit) throw Error('commit failed');
        data=copy;
      }
    }
  };
  const env = {PAY_KV:legacy,LAB_PIN:'admin',WEP3_RUNNER_TOKEN:'runner',LEGACY_KV_FROZEN:'1'};
  let ledger = new Wep3Ledger(ctx,env);
  env.WEP3_LEDGER = {idFromName:()=> 'singleton',get:()=>ledger};
  const request = async (path, body, token='admin') => {
    const res=await worker.fetch(new Request('https://wep3.test'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Lab-Pin':token},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
    return {status:res.status,body:await res.json()};
  };
  return {request,env,restart:()=>{ledger=new Wep3Ledger(ctx,env);},rows:()=>new Map(data),legacyData,failCommit: value=>{failCommit=value;},failRead:value=>{failLegacyRead=value;}};
}
const rows = (f,prefix) => [...f.rows()].filter(([k])=>k.startsWith(prefix)).map(([,v])=>JSON.parse(v)).filter(Boolean);

test('audited hire conserves credit, releases escrow and reports no real payment', async()=>{
  const f=fixture(); const r=await f.request('/hire',payload(),'runner');
  assert.equal(r.status,200);assert.equal(r.body.status,'HIRED');
  const receipt=r.body.receipt;
  assert.equal(receipt.worker,'Doubao');assert.equal(receipt.attester,'GPT');
  assert.equal(receipt.deliverable_sha256,hash(delivery));
  assert.equal(receipt.audit.deliverable_sha256,receipt.deliverable_sha256);
  assert.equal(isInternalSettlement(r.body,hash(delivery)),true);
  const poster=rows(f,'wep3:rep:').find(r=>r.agent==='DeepSeek');
  assert.equal(poster.held,0);assert.equal(poster.spent,receipt.amount_usd);
  assert.equal(poster.credit,Number((1-receipt.amount_usd).toFixed(6)));
  const l=(await f.request('/ledger')).body;
  assert.ok(Math.abs(l.credit_sum+l.pool_nav-9)<0.000001);
  assert.equal(l.entries.filter(e=>e.type==='hire_settle').length,1);
  assert.equal(l.entries.find(e=>e.type==='hire_settle').ref,r.body.intent_id);
});

test('20 concurrent submissions settle once and retries after restart preserve deduplication',async()=>{
  const f=fixture();
  const replies=await Promise.all(Array.from({length:20},()=>f.request('/hire',payload())));
  assert.equal(replies.filter(r=>r.body.status==='HIRED').length,1);
  assert.equal(replies.filter(r=>r.body.status==='ALREADY_SETTLED').length,19);
  assert.equal(rows(f,'wep3:receipt:').length,1);
  assert.equal(rows(f,'wep3:ledger:').filter(r=>r.type==='hire_settle').length,1);
  f.restart();
  assert.equal((await f.request('/hire',payload())).body.status,'ALREADY_SETTLED');
  assert.equal((await f.request('/hire',payload({worker:'Grok'}))).body.error,'delivery_already_used');
});

test('invalid parties, self-audit, wrong hash and bad evidence do not debit',async()=>{
  for(const p of [payload({agent:undefined}),payload({worker:'DeepSeek'}),payload({skill:'unknown'}),payload({max_usd:0}),payload({max_usd:'Infinity'}),payload({evidence_path:'knowledge/results/../bad.json'}),payload({deliverable:{text:delivery}}),payload({audit_report:{accepted:true,auditor:'Doubao',reason:'x',deliverable_sha256:hash(delivery)}}),payload({audit_report:{accepted:true,auditor:'GPT',reason:'x',deliverable_sha256:'bad'}})]){
    const f=fixture();const r=await f.request('/hire',p);
    assert.ok(r.status>=400);assert.equal(rows(f,'wep3:rep:').length,0);assert.equal(rows(f,'wep3:receipt:').length,0);
  }
});

test('no affordable quote refunds full amount including line debt and spent',async()=>{
  const f=fixture({'wep3:rep:DeepSeek':{agent:'DeepSeek',score:110,credit:0,earned:0,spent:0,held:0,line_used:0}});
  const r=await f.request('/hire',payload({max_usd:0.001}));
  assert.equal(r.status,409);assert.equal(r.body.refunded,true);
  const p=rows(f,'wep3:rep:').find(r=>r.agent==='DeepSeek');
  assert.equal(p.credit,0);assert.equal(p.line_used,0);assert.equal(p.held,0);assert.equal(p.spent,0);
  assert.equal(rows(f,'wep3:receipt:').length,0);
  assert.equal(rows(f,'wep3:ledger:').find(r=>r.type==='hire_refund').amount_usd,0.001);
});

test('insufficient credit never creates an intent or reward',async()=>{
  const f=fixture({'wep3:rep:DeepSeek':{agent:'DeepSeek',score:100,credit:0,earned:0}});
  const r=await f.request('/hire',payload());assert.equal(r.status,402);
  assert.equal(rows(f,'wep3:intent:').length,0);assert.equal(rows(f,'wep3:receipt:').length,0);
});

test('storage commit failure rolls back every debit, reward, receipt and dedup key; retry succeeds',async()=>{
  const f=fixture();f.failCommit(true);
  const r=await f.request('/hire',payload());assert.equal(r.status,503);assert.equal(f.rows().size,0);
  f.failCommit(false);const retry=await f.request('/hire',payload());assert.equal(retry.body.status,'HIRED');
  assert.equal(rows(f,'wep3:receipt:').length,1);
});

test('legacy read failures and missing atomic binding fail closed',async()=>{
  const f=fixture();f.failRead(true);
  assert.equal((await f.request('/hire',payload())).status,500);
  assert.equal(f.rows().size,0);
  f.failRead(false);delete f.env.WEP3_LEDGER;
  assert.equal((await f.request('/hire',payload())).status,503);
  assert.equal(f.rows().size,0);
});

test('auth rejects missing PIN and runner cannot access other writes or aliases',async()=>{
  const f=fixture();
  assert.equal((await f.request('/hire',payload(),'')).status,401);
  assert.equal((await f.request('/transfer',{from:'DeepSeek',to:'Doubao',amount:0.1},'runner')).status,401);
  assert.equal((await f.request('/mesh',payload(),'runner')).status,401);
  delete f.env.LAB_PIN;delete f.env.WEP3_RUNNER_TOKEN;
  assert.equal((await f.request('/hire',payload(),'admin')).status,401);
});

test('legacy settled delivery remains deduplicated without creating new rewards',async()=>{
  const receipt={id:'old',status:'cleared',audit:{deliverable_sha256:hash(delivery)},poster:'DeepSeek',worker:'Doubao',attester:'GPT',skill:'copy',evidence_path:'knowledge/results/wep3/test.json',paid:false,tx_hash:null,settlement_mode:'internal_credit'};
  const f=fixture({['wep3:delivery:'+hash(delivery)]:receipt});
  assert.equal((await f.request('/hire',payload())).body.status,'ALREADY_SETTLED');
  assert.equal(rows(f,'wep3:ledger:').length,0);
});

test('credit invoice payment is idempotent and leaves fulfillment pending',async()=>{
  const f=fixture({'wep3:rep:DeepSeek':{agent:'DeepSeek',credit:5,score:100,earned:0,spent:0,held:0}});
  const invoice=(await f.request('/checkout',{sku:'script-video'})).body.invoice;
  const results=await Promise.all([f.request('/pay/credit',{invoice_id:invoice.id,payer:'DeepSeek'}),f.request('/pay/credit',{invoice_id:invoice.id,payer:'DeepSeek'})]);
  assert.equal(results.filter(r=>r.body.status==='CREDIT_PAID').length,1);
  const paid=results.find(r=>r.body.status==='CREDIT_PAID').body;
  assert.equal(paid.paid,false);assert.equal(paid.invoice.fulfillment_status,'pending_delivery_and_audit');assert.equal(paid.hire,null);
  assert.equal(rows(f,'wep3:receipt:').length,0);
  assert.equal(rows(f,'wep3:rep:').find(r=>r.agent==='DeepSeek').held,0);
  assert.equal(rows(f,'wep3:ledger:').filter(r=>r.type==='credit_pay').length,1);
});

test('unverified external proof cannot mint credit or mark invoice paid',async()=>{
  const f=fixture();f.env.PAY_WEBHOOK_SECRET='webhook';
  const invoice=(await f.request('/checkout',{sku:'script-video'})).body.invoice;
  const r=await f.request('/pay/confirm',{invoice_id:invoice.id,provider:'usdc',proof:'invented',secret:'webhook'});
  // Object receives env at construction by reference.
  assert.equal(r.status,503);assert.equal(r.body.error,'real_payment_verification_not_implemented');
  assert.equal((await f.request('/invoice/'+invoice.id)).body.invoice.status,'open');
  assert.equal(rows(f,'wep3:rep:').length,0);
});

test('delivery validation binds actual source and receipt validation rejects ok-only success',()=>{
  const source='knowledge/results/wep3/test.json';
  const item={executor:'doubao',file:source,data:{hiring:{deliverable_file:source}},output:'Reusable checklist'};
  const d=deliveryPayload(item,source);assert.equal(d.sha256,hash(d.text));
  assert.throws(()=>deliveryPayload({...item,executor:'gpt'},source));
  assert.throws(()=>deliveryPayload(item,'knowledge/results/wep3/wrong.json'));
  assert.equal(isInternalSettlement({ok:true},d.sha256),false);
});

test('corrupt persisted balance cannot silently reset to a fresh credit grant',async()=>{
 const f=fixture();f.legacyData.set('wep3:rep:DeepSeek','corrupt-json');
 const r=await f.request('/hire',payload());assert.equal(r.status,500);
 assert.equal(f.rows().size,0);
});

test('completed transfers, deposits, stakes and cites clear their temporary holds',async()=>{
 const f=fixture();
 assert.equal((await f.request('/transfer',{from:'DeepSeek',to:'Doubao',amount:0.1})).status,200);
 assert.equal((await f.request('/deposit',{agent:'Grok',amount:0.1})).status,200);
 assert.equal((await f.request('/stake',{agent:'Kimi',amount:0.1})).status,200);
 const receipt=(await f.request('/hire',payload())).body.receipt;
 assert.equal((await f.request('/cite',{agent:'Claude',receipt_id:receipt.id,fee_usd:0.005})).status,200);
 for(const agent of ['DeepSeek','LTZZZ','Kimi','Claude'])assert.equal((await f.request('/wallet/'+agent)).body.held,0);
});

test('cutover stays read-only without prematurely freezing KV into durable storage',async()=>{
 const f=fixture();f.env.LEGACY_KV_FROZEN='0';
 const health=(await f.request('/health')).body;assert.equal(health.atomic_ledger_ready,false);
 assert.equal((await f.request('/hire',payload())).body.error,'legacy_cutover_not_confirmed');
 assert.equal((await f.request('/wallet/DeepSeek')).body.credit,1);
 assert.equal(f.rows().size,0);
});

test('existing daily reconcile endpoints expose causal receipts and open intent count',async()=>{
 const f=fixture();await f.request('/hire',payload());
 assert.equal((await f.request('/causal')).body.receipts.length,1);
 assert.equal((await f.request('/pulse')).body.open,0);
});

test('ledger reads paginate before date filtering and return the latest requested entries',async()=>{
 const seed={};
 for(let i=0;i<1100;i++)seed['wep3:ledger:'+String(i).padStart(4,'0')]={id:'entry-'+i,type:'test',at:new Date(Date.UTC(2026,0,1)+i*60000).toISOString()};
 const f=fixture(seed);const l=(await f.request('/ledger?limit=100')).body;
 assert.equal(l.count,100);assert.equal(l.entries[0].id,'entry-1099');assert.equal(l.entries[99].id,'entry-1000');
});

test('unverified legacy dedup record cannot masquerade as a settled delivery',async()=>{
 const f=fixture({['wep3:delivery:'+hash(delivery)]:{status:'void'}});
 assert.equal((await f.request('/hire',payload())).body.error,'delivery_not_verified');
 assert.equal(rows(f,'wep3:rep:').length,0);
});
