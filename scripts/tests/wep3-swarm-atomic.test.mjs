import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {Wep3Ledger} from '../../wep3-worker.js';
import {spawnChild} from '../../wep3-swarm.js';

function fixture({failAt=0}={}) {
  const initial={id:'parent-fixture',poster:'Grok',status:'open',remaining:1,held:0,children:[],depth:0};
  const legacy=new Map([['wep3:intent:parent-fixture',JSON.stringify(initial)]]);
  let data=new Map(),tail=Promise.resolve(),ledger,fail=failAt,legacyWrites=0;
  const env={LAB_PIN:'fixture',LEGACY_KV_FROZEN:'1',PAY_KV:{get:async k=>legacy.get(k)??null,list:async({prefix})=>({keys:[...legacy.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name})),list_complete:true}),put:async()=>{legacyWrites++;assert.fail('No write may reach legacy KV');}}};
  const ctx={blockConcurrencyWhile(fn){const p=tail.then(fn);tail=p.catch(()=>{});return p;},storage:{get:async k=>data.get(k),list:async({prefix})=>new Map([...data].filter(([k])=>k.startsWith(prefix))),transaction:async fn=>{const copy=new Map(data);let writes=0;await fn({put:async rows=>{for(const[k,v]of Object.entries(rows)){if(++writes===fail)throw Error('injected_commit_failure');copy.set(k,v);}}});data=copy;}}};
  const restart=()=>{ledger=new Wep3Ledger(ctx,env);};restart();
  env.WEP3_LEDGER={idFromName:name=>{assert.equal(name,'wep3-ledger-v1');return name;},get:()=>ledger};
  const request=async(body={},key='test-reservation-0001',path='/swarm/spawn',pin='fixture')=>{const r=await worker.fetch(new Request('https://test'+path,{method:'POST',headers:{'content-type':'application/json','X-Lab-Pin':pin,'Idempotency-Key':key},body:JSON.stringify({parent_intent_id:'parent-fixture',poster:'Grok',skill:'copy',max_usd:0.5,...body})}),env);return{http:r.status,body:await r.json()};};
  const rows=prefix=>[...data].filter(([k,v])=>k.startsWith(prefix)&&v!==null).map(([,v])=>JSON.parse(v));
  return{env,request,rows,restart,setFail:n=>{fail=n;},size:()=>data.size,legacy,legacyWrites:()=>legacyWrites};
}

test('legacy direct module calls cannot reproduce a partial KV debit',async()=>{
  let reads=0,writes=0;const r=await spawnChild({PAY_KV:{get:async()=>{reads++;return '{}';},put:async()=>{writes++;}}},'parent','copy',0.5,'fixture','Grok',1,'test-reservation-0001');
  assert.equal(r.status,503);assert.equal(r.error,'atomic_swarm_context_required');assert.equal(reads,0);assert.equal(writes,0);
});
test('both recursive routes require cutover and never write legacy KV',async()=>{
  for(const path of ['/swarm/spawn','/swarm/tree']){const f=fixture();f.env.LEGACY_KV_FROZEN='0';const r=await f.request({plan:[{skill:'copy',max_usd:0.5}]},undefined,path);assert.equal(r.http,503);assert.equal(r.body.error,'legacy_cutover_not_confirmed');assert.equal(f.size(),0);assert.equal(f.legacyWrites(),0);}
});
test('one reservation atomically binds parent, child, journal and idempotency record',async()=>{
  const f=fixture(),r=await f.request();assert.equal(r.http,200);assert.equal(r.body.status,'reserved_not_dispatched');
  const parent=f.rows('wep3:intent:').find(x=>x.id==='parent-fixture'),child=f.rows('wep3:intent:').find(x=>x.id!=='parent-fixture');
  assert.equal(parent.remaining,0.5);assert.equal(parent.held,0.5);assert.deepEqual(parent.children,[child.id]);assert.equal(child.remaining,0.5);assert.equal(child.parent_id,parent.id);assert.equal(child.depth,1);
  assert.equal(f.rows('wep3:ledger:').length,1);assert.equal(f.rows('wep3:swarm-idempotency:').length,1);assert.equal(r.body.paid,false);assert.equal(r.body.tx_hash,null);assert.equal(r.body.model_calls,0);assert.equal(f.legacyWrites(),0);
});
test('20 concurrent requests and 100 retries after restart reserve once',async()=>{
  const f=fixture(),replies=await Promise.all(Array.from({length:20},()=>f.request()));for(const r of replies){assert.equal(r.http,200);assert.deepEqual(r.body,replies[0].body);}
  f.restart();for(let i=0;i<100;i++)assert.deepEqual((await f.request()).body,replies[0].body);
  assert.equal(f.rows('wep3:intent:').length,2);assert.equal(f.rows('wep3:ledger:').length,1);assert.equal(f.rows('wep3:intent:').find(x=>x.id==='parent-fixture').remaining,0.5);
});
test('same idempotency key with a changed amount or operation conflicts without a debit',async()=>{
  const f=fixture();assert.equal((await f.request()).http,200);assert.equal((await f.request({max_usd:0.4})).http,409);
  assert.equal((await f.request({plan:[{skill:'copy',max_usd:0.5}]},undefined,'/swarm/tree')).http,409);
  assert.equal(f.rows('wep3:intent:').find(x=>x.id==='parent-fixture').remaining,0.5);assert.equal(f.rows('wep3:intent:').length,2);
});
test('competing reservations cannot overspend a shared parent',async()=>{
  const f=fixture(),rs=await Promise.all([f.request({max_usd:0.6},'competing-key-0001'),f.request({max_usd:0.6},'competing-key-0002')]);assert.deepEqual(rs.map(r=>r.http).sort(),[200,409]);
  const p=f.rows('wep3:intent:').find(x=>x.id==='parent-fixture');assert.equal(p.remaining,0.4);assert.equal(p.held,0.6);assert.equal(p.children.length,1);
});
test('any durable row-write failure rolls back all rows and same-key retry succeeds',async()=>{
  const probe=fixture();assert.equal((await probe.request()).http,200);const writes=probe.size();assert.ok(writes>=4);
  for(let failAt=1;failAt<=writes;failAt++){const f=fixture({failAt});const r=await f.request();assert.equal(r.http,503,'failure at row '+failAt);assert.equal(f.size(),0);assert.equal(JSON.parse(f.legacy.get('wep3:intent:parent-fixture')).remaining,1);f.setFail(0);assert.equal((await f.request()).http,200);assert.equal(f.rows('wep3:ledger:').length,1);}
});
test('tree validation rejects its invalid later step before reserving an earlier step',async()=>{
  for(const plan of [[{skill:'copy',max_usd:0.2},{skill:'missing',max_usd:0.2}],[{skill:'copy',max_usd:0.6},{skill:'audit',max_usd:0.6}]]){const f=fixture();const r=await f.request({plan},undefined,'/swarm/tree');assert.ok(r.http>=400);assert.equal(f.rows('wep3:ledger:').length,0);assert.equal(f.rows('wep3:intent:').some(x=>x.id!=='parent-fixture'),false);}
});
test('a complete tree is one exact-micro reservation and retries return the same child ids',async()=>{
  const f=fixture(),body={plan:[{skill:'copy',max_usd:'0.100001'},{skill:'audit',max_usd:'0.200002'}]},r=await f.request(body,undefined,'/swarm/tree');assert.equal(r.http,200);assert.equal(r.body.total_sliced,0.300003);assert.equal(r.body.children.length,2);assert.deepEqual((await f.request(body,undefined,'/swarm/tree')).body,r.body);
  const p=f.rows('wep3:intent:').find(x=>x.id==='parent-fixture');assert.equal(p.remaining,0.699997);assert.equal(p.held,0.300003);assert.equal(p.children.length,2);
});
test('tree commit failures after either child leave the parent and entire tree unchanged',async()=>{
  const body={plan:[{skill:'copy',max_usd:0.2},{skill:'audit',max_usd:0.3}]},probe=fixture();assert.equal((await probe.request(body,undefined,'/swarm/tree')).http,200);
  for(let failAt=1;failAt<=probe.size();failAt++){const f=fixture({failAt});assert.equal((await f.request(body,undefined,'/swarm/tree')).http,503);assert.equal(f.size(),0);f.setFail(0);assert.equal((await f.request(body,undefined,'/swarm/tree')).http,200);assert.equal(f.rows('wep3:ledger:').length,2);}
});
test('invalid keys, nondecimal amounts, identity, depth and missing auth never reserve',async()=>{
  for(const [body,key]of [[{},''],[{max_usd:0},'validation-key-01'],[{max_usd:'1e-2'},'validation-key-01'],[{max_usd:'0.0000001'},'validation-key-01'],[{poster:'Microsoft'},'validation-key-01'],[{depth:99},'validation-key-01']]){const f=fixture();assert.ok((await f.request(body,key)).http>=400);assert.equal(f.rows('wep3:ledger:').length,0);}
  const f=fixture();assert.equal((await f.request({},undefined,undefined,'wrong')).http,401);assert.equal(f.size(),0);
});
