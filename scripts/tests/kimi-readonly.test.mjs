import test from 'node:test';import assert from 'node:assert/strict';
import worker,{KimiGate} from '../../workers/kimi-queue/index.js';
import {probeKimiReadonly} from '../probe-kimi-readonly.mjs';
function fixture(){
 const rows=new Map([['lease:private-one',{expires_at:Date.now()+100000}],['lease:private-two',{expires_at:0}],['lease:private-bad',{}]]);
 let writes=0,modelReads=0;const env={LTZZZ_AGENT_TOKEN:'fixture-service',KIMI_QUEUE_SOURCE_COMMIT:'a'.repeat(40)};
 Object.defineProperty(env,'MOONSHOT_API_KEY_CN',{get(){modelReads++;return 'fixture-model-key';}});
 const storage={list:async({prefix})=>new Map([...rows].filter(([k])=>k.startsWith(prefix))),put:async()=>{writes++;},delete:async()=>{writes++;},setAlarm:async()=>{writes++;}};
 storage.get=async key=>rows.get(key);storage.transaction=async fn=>fn(storage);
 const gate=new KimiGate({storage},env);env.KIMI_GATE={idFromName:()=> 'same-existing-object',get:()=>({fetch:req=>gate.fetch(req)})};
 return {env,rows,gate,writes:()=>writes,modelReads:()=>modelReads,fetcher:(url,options)=>worker.fetch(new Request(url,options),env)};
}
test('public/wrong callers cannot inspect lease state, including direct DO reads',async()=>{
 const f=fixture();for(const path of ['/auth/check','/leases/count'])for(const headers of [{},{Authorization:'Bearer wrong'}]){
  assert.equal((await worker.fetch(new Request('https://test'+path,{headers}),f.env)).status,401);
  if(path==='/leases/count')assert.equal((await f.gate.fetch(new Request('https://test'+path,{headers}))).status,401);
 }
 assert.equal(f.writes(),0);assert.equal(f.modelReads(),0);
});
test('authenticated counts are non-mutating, omit identities and retain unknown historical totals',async()=>{
 const f=fixture(),before=structuredClone([...f.rows]);const r=await worker.fetch(new Request('https://test/leases/count',{headers:{Authorization:'Bearer fixture-service'}}),f.env),b=await r.json();
 assert.equal(r.status,200);assert.equal(b.active,1);assert.equal(b.expired,1);assert.equal(b.invalid,1);assert.equal(b.records_observed,3);
 assert.equal(b.historical_totals_available,false);assert.equal(b.reserved_total,null);assert.equal(b.released_total,null);
 assert.equal(JSON.stringify(b).includes('private-one'),false);assert.deepEqual([...f.rows],before);assert.equal(f.writes(),0);assert.equal(f.modelReads(),0);
});
test('probe uses only seven GETs, proves auth and does not reserve, release or generate',async()=>{
 const f=fixture(),seen=[];const r=await probeKimiReadonly({token:'fixture-service',expectedSourceCommit:'a'.repeat(40),fetcher:(url,o)=>{seen.push({url,o});return f.fetcher(url,o);}});
 assert.equal(r.verified,true);assert.equal(seen.length,7);assert.equal(seen.every(x=>x.o.method==='GET'&&!/reserve|release|chat|completion/.test(x.url)),true);assert.equal(f.writes(),0);assert.equal(r.model_calls,0);
});
test('transport loss is blocked without retries or pretending queue died',async()=>{
 let count=0;const r=await probeKimiReadonly({token:'fixture',expectedSourceCommit:'a'.repeat(40),fetcher:async()=>{count++;throw Error('transport');}});assert.equal(count,7);assert.equal(r.verified,false);assert.equal(r.status,'readonly_probe_blocked');
});
test('a stale or mixed deployment source cannot pass the read-only probe',async()=>{
 const f=fixture();
 assert.equal((await probeKimiReadonly({token:'fixture-service',expectedSourceCommit:'b'.repeat(40),fetcher:f.fetcher})).verified,false);
 assert.equal((await probeKimiReadonly({token:'fixture-service',expectedSourceCommit:'a'.repeat(40),fetcher:async(url,o)=>{
  const r=await f.fetcher(url,o),b=await r.json();if(url.endsWith('/leases/count')&&r.status===200)b.source_commit='c'.repeat(40);return Response.json(b,{status:r.status});
 }})).verified,false);
});
test('a probe cannot claim acceptance without a specific expected deployment',async()=>{
 const f=fixture();await assert.rejects(()=>probeKimiReadonly({token:'fixture-service',fetcher:f.fetcher}),/expected_source_commit_required/);
});
test('direct Durable Object write routes require the same service identity',async()=>{
 const f=fixture();
 for(const route of ['/reserve','/release'])assert.equal((await f.gate.fetch(new Request('https://test'+route,{method:'POST',body:JSON.stringify({messages:[{role:'user',content:'x'}],lease:'a'.repeat(36)})}))).status,401);
 assert.equal(f.writes(),0);
});
