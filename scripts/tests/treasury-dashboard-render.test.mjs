import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../../treasury-dashboard.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'Dashboard inline script must be available for regression checks');
const payload='</h3><img src=x onerror="globalThis.PWNED=1"><svg onload=alert(1)>\'&';
async function render(dashboard={},health={},regression={},error=null,statusByPath={}){
  const elements=Object.fromEntries(['stats','agents','raw'].map(id=>[id,{innerHTML:'',textContent:''}]));
  const requests=[];
  const context=vm.createContext({document:{getElementById:id=>elements[id]},fetch:async(url,options)=>{
    const record={url,options,json_reads:0};requests.push(record);if(error)throw error;
    const data=url.endsWith('/dashboard')?dashboard:url.endsWith('/health')?health:regression;
    const status=statusByPath[new URL(url).pathname]??200;
    return {ok:status>=200&&status<300,status,json:async()=>{record.json_reads++;return data;}};
  }});
  await new vm.Script(script,{filename:'treasury-dashboard.inline.js'}).runInContext(context);
  return {context,elements,requests};
}
function staticTagsOnly(markup){
  for(const [tag] of markup.matchAll(/<[^>]*>/g)){
    assert.match(tag,/^(?:<div(?: class="(?:card|big|muted|bar)")?>|<\/(?:div|h3|b|i)>|<h3>|<b>|<i style="width:\d+%">)$/,'Unexpected generated HTML tag: '+tag);
  }
}
test('inline JavaScript compiles and requests only the three existing read endpoints',async()=>{
  const {requests}=await render();
  assert.deepEqual(requests.map(r=>r.url),['dashboard','health','regression'].map(p=>'https://ltzzz-treasury-v11.ltzyz2181.workers.dev/'+p));
  assert.ok(requests.every(r=>r.options===undefined));
});
test('HTML text escaping covers markup, both quotes, ampersands and encoded entities',async()=>{
  const {context}=await render(),escape=context.escapeHtml;
  assert.equal(escape('&<>"\''),'&amp;&lt;&gt;&quot;&#39;');
  assert.equal(escape('&#x3c;img src=x&#x3e;'),'&amp;#x3c;img src=x&amp;#x3e;');
  assert.equal(escape(null),'');assert.equal(escape(undefined),'');assert.equal(escape(-2.5),'-2.5');
  assert.equal(escape(JSON.parse('{"toString":"<svg>"}')),'{&quot;toString&quot;:&quot;&lt;svg&gt;&quot;}');
});
test('usage accepts numeric API values and marks negative usage unknown',async()=>{
  const {context}=await render(),percent=context.usagePercent;
  for(const [used,limit,expected] of [[0,20,0],[5,20,25],[1,3,33],['2.5','10',25],[-1,10,null],[10,10,100],[15,10,100]]){
    assert.equal(percent(used,limit),expected);
  }
});
test('invalid or missing usage limits are unknown rather than a false zero',async()=>{
  const {context}=await render(),percent=context.usagePercent;
  for(const limit of [0,-1,undefined,null,'',' ',NaN,Infinity,-Infinity,'Infinity','NaN','invalid',{},[],true]){
    assert.equal(percent(1,limit),null,'Invalid limit must be unknown');
  }
  for(const used of [undefined,null,NaN,Infinity,-Infinity,'Infinity','bad',{},[],true])assert.equal(percent(used,10),null);
});
test('extreme finite numbers remain within 0–100 without division overflow',async()=>{
  const {context}=await render(),percent=context.usagePercent;
  assert.equal(percent(Number.MAX_VALUE,Number.MIN_VALUE),100);
  assert.equal(percent(Number.MIN_VALUE,Number.MAX_VALUE),0);
  assert.equal(percent(Number.MAX_VALUE,Number.MAX_VALUE),100);
});
test('malicious text in every interpolated dashboard and agent field cannot create active markup',async()=>{
  const dashboard={today_spend:payload,today_remaining_limit:payload,real_tx_success_count:payload,
    counts:{pending:payload,success:payload,failed:payload},agents:{[payload]:{used:payload,daily_limit:payload,single_limit:payload,remaining:payload}}};
  const {elements,context}=await render(dashboard);
  staticTagsOnly(elements.stats.innerHTML);staticTagsOnly(elements.agents.innerHTML);
  assert.equal((elements.stats.innerHTML.match(/class="card"/g)||[]).length,6);
  assert.match(elements.agents.innerHTML,/用量比例未知/);
  assert.ok(elements.stats.innerHTML.includes('&lt;img'));assert.ok(elements.agents.innerHTML.includes('&lt;svg'));
  assert.equal(context.PWNED,undefined);
});
test('invalid agent caps and missing entries show unknown while valid bars stay numeric',async()=>{
  const {elements}=await render({agents:{negative:{used:-5,daily_limit:10},zero:{used:5,daily_limit:0},huge:{used:1e300,daily_limit:1e-300},infinite:{used:1,daily_limit:'Infinity'},null:null,object:{used:1,daily_limit:{toString:payload}}}});
  staticTagsOnly(elements.agents.innerHTML);
  assert.deepEqual([...elements.agents.innerHTML.matchAll(/style="width:(\d+)%"/g)].map(m=>Number(m[1])),[100]);
  assert.equal((elements.agents.innerHTML.match(/用量比例未知/g)||[]).length,5);
});
test('raw API payloads and fetch errors remain in textContent',async()=>{
  const result=await render({safe:payload,regression_tx:payload},{report:payload},{message:payload});
  assert.equal(result.elements.raw.innerHTML,'');assert.ok(result.elements.raw.textContent.includes(payload.replaceAll('"','\\"')));
  const failed=await render({}, {}, {}, new Error(payload));
  assert.equal(failed.elements.raw.innerHTML,'');assert.equal(failed.elements.raw.textContent,'Error: '+payload);
});
test('HTTP error responses never render false zero balances or parse their JSON body',async()=>{
  for(const [path,status] of [['/dashboard',503],['/dashboard',404],['/health',502],['/regression',429]]){
    const {elements,requests}=await render({}, {}, {}, null,{[path]:status});
    assert.equal(elements.stats.innerHTML,'');assert.equal(elements.agents.innerHTML,'');
    assert.equal(elements.raw.textContent,'Error: '+path+' HTTP '+status);
    assert.equal(requests.find(r=>new URL(r.url).pathname===path).json_reads,0);
  }
});

test('missing Treasury metrics are unknown, never synthetic zero',async()=>{
  const {elements}=await render({});
  assert.equal((elements.stats.innerHTML.match(/<div class="big">未知<\/div>/g)||[]).length,6);
  assert.doesNotMatch(elements.stats.innerHTML,/>0 U</);
});
test('explicit zero Treasury metrics remain zero, not unknown',async()=>{
  const {elements}=await render({
    today_spend:0,today_remaining_limit:0,real_tx_success_count:0,
    counts:{pending:0,success:0,failed:0}
  });
  assert.equal((elements.stats.innerHTML.match(/<div class="big">0 U<\/div>/g)||[]).length,2);
  assert.equal((elements.stats.innerHTML.match(/<div class="big">0<\/div>/g)||[]).length,4);
  assert.doesNotMatch(elements.stats.innerHTML,/>未知</);
});
test('partial Treasury metrics preserve known values and expose missing values',async()=>{
  const {elements}=await render({today_spend:5,counts:{success:3},today_remaining_limit:null});
  assert.match(elements.stats.innerHTML,/<div class="big">5 U<\/div>/);
  assert.match(elements.stats.innerHTML,/<div class="big">3<\/div>/);
  assert.equal((elements.stats.innerHTML.match(/<div class="big">未知<\/div>/g)||[]).length,4);
});

test('missing per-agent amounts and limits are unknown, real zero remains zero',async()=>{
  const {elements}=await render({agents:{missing:{},zero:{used:0,daily_limit:10,single_limit:0,remaining:10},partial:{used:2}}});
  assert.match(elements.agents.innerHTML,/已用 <b>未知<\/b> \/ 未知/);
  assert.match(elements.agents.innerHTML,/单笔≤未知 · 剩 未知/);
  assert.match(elements.agents.innerHTML,/已用 <b>0<\/b> \/ 10/);
  assert.match(elements.agents.innerHTML,/style="width:0%"/);
  assert.equal((elements.agents.innerHTML.match(/用量比例未知/g)||[]).length,2);
});
