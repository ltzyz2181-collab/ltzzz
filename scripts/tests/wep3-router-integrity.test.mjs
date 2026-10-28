import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {handleRequest, Wep3Ledger} from '../../wep3-worker.js';

function fixture() {
  let state = new Map(), tail = Promise.resolve(), failCommit = false, legacyWrites = 0;
  const legacy = {get:async()=>null,list:async()=>({keys:[],list_complete:true}),put:async()=>{legacyWrites++;throw Error('legacy KV must not be written');}};
  const ctx = {blockConcurrencyWhile(fn){const next=tail.then(fn);tail=next.catch(()=>{});return next;},storage:{
    get:async key=>state.get(key),list:async({prefix})=>new Map([...state].filter(([key])=>key.startsWith(prefix))),
    transaction:async fn=>{const next=new Map(state);await fn({put:async rows=>{for(const [key,value] of Object.entries(rows))next.set(key,value);}});if(failCommit)throw Error('fixture_commit_failed');state=next;}
  }};
  const env={LAB_PIN:'fixture',LEGACY_KV_FROZEN:'0',PAY_KV:legacy};
  const object=new Wep3Ledger(ctx,env);
  env.WEP3_LEDGER={idFromName:name=>{assert.equal(name,'wep3-ledger-v1');return name;},get:()=>object};
  const request=async(route,body,pin='fixture')=>{
    const r=await worker.fetch(new Request('https://test'+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','x-lab-pin':pin},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
    return {status:r.status,body:await r.json()};
  };
  return {env,request,state:()=>new Map(state),legacyWrites:()=>legacyWrites,failCommit:value=>{failCommit=value;}};
}

test('complete router exports the exact handler required by the existing durable ledger',()=>{
  assert.equal(typeof worker.fetch,'function');assert.equal(typeof handleRequest,'function');assert.equal(typeof Wep3Ledger,'function');
});
test('first-deploy cutover stays read-only without writes or premature durable hydration',async()=>{
  const f=fixture();
  assert.equal((await f.request('/health')).body.atomic_ledger_ready,false);
  const denied=await f.request('/deposit',{agent:'Grok',amount:0.1});
  assert.equal(denied.status,503);assert.equal(denied.body.error,'legacy_cutover_not_confirmed');
  assert.equal((await f.request('/wallet/Grok')).body.credit,1);
  assert.equal(f.state().size,0);assert.equal(f.legacyWrites(),0);
});
test('missing legacy data cannot masquerade as a new free balance',async()=>{
  const f=fixture();delete f.env.PAY_KV;
  assert.equal((await f.request('/wallet/Grok')).status,503);assert.equal(f.state().size,0);
});
test('confirmed cutover uses the durable transaction and never writes the old KV',async()=>{
  const f=fixture();f.env.LEGACY_KV_FROZEN='1';
  assert.equal((await f.request('/health')).body.atomic_ledger_ready,true);
  const r=await f.request('/transfer',{from:'DeepSeek',to:'Doubao',amount:0.1});
  assert.equal(r.status,200);assert.equal(r.body.status,'TRANSFERRED');
  assert.equal((await f.request('/wallet/DeepSeek')).body.credit,0.9);
  assert.equal((await f.request('/wallet/Doubao')).body.credit,1.1);
  assert.equal(f.legacyWrites(),0);assert.ok(f.state().size>0);
});
test('durable commit failure rolls back all transfer effects and returns unavailable',async()=>{
  const f=fixture();f.env.LEGACY_KV_FROZEN='1';f.failCommit(true);
  assert.equal((await f.request('/transfer',{from:'DeepSeek',to:'Doubao',amount:0.1})).status,503);
  assert.equal(f.state().size,0);assert.equal(f.legacyWrites(),0);
  f.failCommit(false);assert.equal((await f.request('/wallet/DeepSeek')).body.credit,1);
});
test('missing durable binding never falls back to KV writes after confirmed cutover',async()=>{
  const f=fixture();f.env.LEGACY_KV_FROZEN='1';delete f.env.WEP3_LEDGER;
  assert.equal((await f.request('/transfer',{from:'DeepSeek',to:'Doubao',amount:0.1})).body.error,'atomic_ledger_not_configured');
  assert.equal((await f.request('/wallet/DeepSeek')).status,503);
  assert.equal(f.state().size,0);assert.equal(f.legacyWrites(),0);
});
test('planning remains storage-free and legacy payment confirmation remains disabled',async()=>{
  const f=fixture();delete f.env.WEP3_LEDGER;delete f.env.PAY_KV;
  assert.equal((await f.request('/swarm/hire',{})).body.status,'planned_not_dispatched');
  assert.equal((await f.request('/swarm/spawn',{})).status,503);
  assert.equal((await f.request('/pay/confirm',{})).status,410);
  assert.equal((await f.request('/pay/credit',{})).status,410);
  assert.equal((await f.request('/transfer',{amount:0.1},'wrong')).status,401);
});
