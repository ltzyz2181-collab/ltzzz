import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {catalogProviders,inspectCatalog,inspectBalance} from '../lib/model-catalog.mjs';
const provider={seat:'qianwen',base:'https://dashscope.aliyuncs.com/compatible-mode/v1',key:'fixture-secret',selected_model:'qwen-plus'};
test('each provider reads only its own key; disabled GPT/Claude native keys are never catalogued',()=>{
 const rows=catalogProviders({DASHSCOPE_API_KEY:'q',DEEPSEEK_API_KEY:'d',DOUBAO_API_KEY:'b',MOONSHOT_API_KEY_CN:'cn',KIMI_API_KEY:'global',MOONSHOT_API_KEY:'unclassified',XAI_API_KEY:'x',ANTHROPIC_API_KEY:'foreign',OPENAI_API_KEY:'foreign'});
 assert.deepEqual(rows.map(r=>r.key),['q','d','b','cn','global','x']);assert.ok(!rows.some(r=>r.key==='foreign'));
});
test('catalogue GET proves listing only, not generation or release chronology',async()=>{
 const r=await inspectCatalog(provider,{fetchImpl:async(url,init)=>{assert.ok(url.endsWith('/models'));assert.equal(init.method,undefined);assert.equal(init.redirect,'error');return Response.json({data:[{id:'qwen-plus'},{id:'qwen-new'}]});}});
 assert.equal(r.status,'catalogue_verified_no_generation');assert.equal(r.model_calls,0);assert.equal(r.generation_verified,false);assert.equal(r.selected_model_listed,true);assert.deepEqual(r.added_model_ids,[]);assert.equal(r.automatic_model_change,false);
});
test('only complete prior/current catalogues can imply removal, and no automatic upgrade occurs',async()=>{
 for(const has_more of [false,true]){const r=await inspectCatalog(provider,{previous:{model_ids:['old'],catalogue_complete:true},fetchImpl:async()=>Response.json({data:[{id:'new'}],has_more})});assert.deepEqual(r.added_model_ids,['new']);assert.deepEqual(r.removed_model_ids,has_more?[]:['old']);assert.equal(r.automatic_model_change,false);}
});
test('missing keys, HTTP failures, malformed data and timeout stay truthful and redact credentials',async()=>{
 assert.equal((await inspectCatalog({...provider,key:''},{fetchImpl:()=>{throw Error('must_not_call');}})).status,'missing_secret');
 for(const fetchImpl of [async()=>Response.json({error:provider.key},{status:401}),async()=>Response.json({unexpected:provider.key}),async()=>{throw Error(provider.key);}]){const r=await inspectCatalog(provider,{fetchImpl});assert.notEqual(r.status,'catalogue_verified_no_generation');assert.ok(!JSON.stringify(r).includes(provider.key));}
 const r=await inspectCatalog(provider,{fetchImpl:async()=>Response.json({data:[{id:provider.key}]})});assert.deepEqual(r.model_ids,[]);
});
test('balance probes preserve existing supported providers without exposing response strings',async()=>{
 const r=await inspectBalance({...provider,seat:'deepseek'},async url=>{assert.equal(url,'https://api.deepseek.com/user/balance');return Response.json({balance_infos:[{currency:'CNY',total_balance:'50.01',granted_balance:provider.key}]});});assert.equal(r.balance[0].total_balance,'50.01');assert.equal(r.balance[0].granted_balance,null);assert.ok(!JSON.stringify(r).includes(provider.key));
 assert.deepEqual(await inspectBalance(provider,()=>{throw Error('must_not_call');}),{});
});
test('monthly scheduler cannot enter the explicitly manual generation branch',()=>{
 const source=fs.readFileSync('.github/workflows/provider-readiness.yml','utf8');assert.match(source,/17 1 1 \* \*/);assert.match(source,/github\.event_name == 'workflow_dispatch' && inputs\.qwen_probe/);assert.doesNotMatch(source,/ANTHROPIC_API_KEY|OPENAI_API_KEY/);assert.match(source,/Persist probe reservation before generation/);
});
