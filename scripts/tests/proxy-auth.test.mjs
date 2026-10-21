import test from 'node:test';import assert from 'node:assert/strict';
import qwen from '../../qianwen-proxy-worker.js';import deep from '../../deepseek-proxy-worker-v2.js';import doubao from '../../doubao-proxy-worker.js';import grok from '../../xai-proxy-worker.js';import gpt from '../../ltzzz-gpt-proxy-worker.js';import kimi from '../../kimi-proxy-worker.js';
const targets=[[qwen,'/',{QWEN_API_KEY:'provider'}],[deep,'/',{DEEPSEEK_API_KEY:'provider'}],[doubao,'/',{ARK_API_KEY:'provider',DOUBAO_MODEL:'endpoint'}],[grok,'/',{XAI_API_KEY:'provider'}],[gpt,'/chat',{OPENAI_API_KEY:'provider'}],[kimi,'/',{KIMI_API_KEY:'provider'}]];
test('normal deployment without any feature variable still fails closed',async()=>{
 for(const [worker,path,provider] of targets){
  const request=()=>new Request('https://fixture'+path,{method:'POST',body:'{}'});
  assert.equal((await worker.fetch(request(),provider)).status,503);
  assert.equal((await worker.fetch(request(),{...provider,LTZZZ_AGENT_TOKEN:'service'})).status,401);
 }
});
test('Kimi health/auth/catalogue/generation accept the same migrated and legacy credentials',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async url=>{calls++;return url.endsWith('/models')?Response.json({data:[{id:'kimi-k3'}]}):Response.json({model:'kimi-k3',choices:[{message:{content:'OK'},finish_reason:'stop'}]});};
 try{const env={KIMI_API_KEY:'provider',KIMI_WORKER_TOKEN:'legacy',LTZZZ_AGENT_TOKEN:'service'};
  for(const token of ['legacy','service'])for(const [path,method] of [['/auth/check','GET'],['/catalogue','GET'],['/','POST']]){
   const r=await kimi.fetch(new Request('https://fixture'+path,{method,headers:{Authorization:'Bearer '+token},...(method==='POST'?{body:JSON.stringify({messages:[{role:'user',content:'fixture'}]})}:{})}),env);assert.equal(r.status,200);
  }assert.equal(calls,6);
 }finally{globalThis.fetch=old;}
});
test('all paid proxies reject anonymous, wrong and unconfigured callers before any upstream call, while health stays public',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected upstream');};
 try{for(const [worker,path,provider] of targets){
  for(const [token,auth,status] of [[null,null,503],['service',null,401],['service','Bearer wrong',401]]){
   const r=await worker.fetch(new Request('https://fixture'+path,{method:'POST',headers:auth?{Authorization:auth}:{},body:'{}'}),{...provider,REQUIRE_TOKEN:'true',LTZZZ_AGENT_TOKEN:token});assert.equal(r.status,status);
  }
  const env={...provider,REQUIRE_TOKEN:'true',LTZZZ_AGENT_TOKEN:'service'};
  assert.equal((await worker.fetch(new Request('https://fixture/health'),env)).status,200);
  const r=await worker.fetch(new Request('https://fixture/auth/check',{headers:{Authorization:'Bearer service'}}),env),d=await r.json();assert.equal(r.status,200);assert.equal(d.authenticated,true);assert.equal(d.model_calls,0);
 }assert.equal(calls,0);}finally{globalThis.fetch=old;}
});
test('authenticated generation forwards the provider key, never the service token',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async(url,o)=>{
  assert.equal(o.headers.Authorization,'Bearer provider');assert.equal(JSON.stringify(o).includes('service-credential'),false);
  if(url.endsWith('/models'))return Response.json({data:[{id:'kimi-k3'}]});calls++;
  return Response.json({model:'actual',choices:[{message:{content:'complete'},finish_reason:'stop'}]});
 };
 try{for(const [worker,path,provider] of targets){const r=await worker.fetch(new Request('https://fixture'+path,{method:'POST',headers:{Authorization:'Bearer service-credential'},body:JSON.stringify({messages:[{role:'user',content:'fixture'}]})}),{...provider,REQUIRE_TOKEN:'true',LTZZZ_AGENT_TOKEN:'service-credential'});assert.equal(r.status,200);}assert.equal(calls,6);}finally{globalThis.fetch=old;}
});
test('existing Worker callers use server credentials and fail before inference if unconfigured',async()=>{
 const {callAI}=await import('../../ltzzz-daily-automation-worker.js');const {invoke}=await import('../autonomy-core.mjs');const old=globalThis.fetch,prior=process.env.LTZZZ_AGENT_TOKEN;let calls=0;
 globalThis.fetch=async(url,o)=>{calls++;assert.ok(['https://api-xai.ltzzz.com/','https://api-kimi.ltzzz.com/','https://api-qianwen.ltzzz.com/'].includes(url));assert.equal(o.headers.Authorization,'Bearer service');return Response.json({model:'actual',choices:[{message:{content:'complete'},finish_reason:'stop'}]});};
 try{for(const channel of ['xia','kimi']){const missing=await callAI({channel,env:{},taskName:'fixture',prompt:'x'});assert.equal(missing.status,'service_auth_not_configured');await callAI({channel,env:{LTZZZ_AGENT_TOKEN:'service'},taskName:'fixture',prompt:'x'});}process.env.LTZZZ_AGENT_TOKEN='service';assert.equal((await invoke('qianwen_proxy','x',100)).status,'submitted');delete process.env.LTZZZ_AGENT_TOKEN;assert.equal((await invoke('qianwen_proxy','x',100)).status,'service_auth_not_configured');assert.equal(calls,3);}finally{globalThis.fetch=old;if(prior===undefined)delete process.env.LTZZZ_AGENT_TOKEN;else process.env.LTZZZ_AGENT_TOKEN=prior;}
});
