import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../kimi-proxy-worker.js';

test('health reports the effective model variable and actual deployment source without claiming generation', async()=>{
 const env={KIMI_API_KEY:'fixture',LTZZZ_AGENT_TOKEN:'service',KIMI_MODEL:'kimi-k3',KIMI_DEPLOY_SOURCE:'a'.repeat(40)};
 const r=await worker.fetch(new Request('https://fixture/health'),env),d=await r.json();
 assert.equal(d.configured_model,'kimi-k3');assert.equal(d.model_override_configured,true);
 assert.equal(d.model_config_source,'worker_variable');assert.equal(d.source_commit,env.KIMI_DEPLOY_SOURCE);
 assert.equal(d.kimi_model_resolution_revision,'kimi-model-override-v1');assert.equal(d.generation_verified,false);
});
test('missing model override remains honestly auto instead of inventing a fixed runtime configuration', async()=>{
 const d=await (await worker.fetch(new Request('https://fixture/health'),{})).json();
 assert.equal(d.configured_model,'auto');assert.equal(d.model_override_configured,false);assert.equal(d.generation_verified,false);
});
test('auto or absent request model uses the fixed variable without any catalogue request; explicit selection is retained', async()=>{
 const prior=globalThis.fetch,models=[];
 globalThis.fetch=async(url,o)=>{assert.equal(url,'https://api.moonshot.cn/v1/chat/completions');const b=JSON.parse(o.body);models.push(b.model);assert.equal(b.max_tokens,16384);return Response.json({id:'provider-fixture',model:b.model,choices:[{message:{content:'complete'},finish_reason:'stop'}]});};
 try{for(const model of [undefined,'auto','kimi-k2.6']){
  const r=await worker.fetch(new Request('https://fixture/',{method:'POST',headers:{Authorization:'Bearer service'},body:JSON.stringify({model,messages:[{role:'user',content:'fixture'}]})}),{KIMI_API_KEY:'provider',LTZZZ_AGENT_TOKEN:'service',KIMI_MODEL:'kimi-k3'});assert.equal(r.status,200);
 }assert.deepEqual(models,['kimi-k3','kimi-k3','kimi-k2.6']);}finally{globalThis.fetch=prior;}
});
