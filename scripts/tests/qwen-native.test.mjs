import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {callAgent} from '../call-qwen.mjs';import {qwenConfig} from '../lib/qwen-config.mjs';
import {DAILY_CHANNELS,dailyAgents,qwenReviewContext} from '../lib/daily-channels.mjs';
import {seedTasks} from '../../workers/pulse-worker/tasks.js';
import {prepareDailyBoard,runReservedSeat} from '../lib/daily-task-board.mjs';
import {control} from '../../workers/pulse-worker/engine.js';
const key='sk-ws-FIXTURE.not-a-real-key',success={model:'qwen-provider-version',choices:[{finish_reason:'stop',message:{content:'真实测试输出【交付结束】'}}],usage:{total_tokens:32}};
test('workspace key uses an actual interpolated Bearer header and returns provider model provenance',async()=>{
 let calls=0;const r=await callAgent({apiKey:key,prompt:'fixture',fetchImpl:async(url,init)=>{
  calls++;assert.equal(url,'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');assert.equal(init.headers.Authorization,'Bearer '+key);assert.equal(init.redirect,'error');const b=JSON.parse(init.body);assert.equal(b.model,'qwen-plus');assert.equal(b.enable_thinking,false);return Response.json(success);
 }});assert.equal(calls,1);assert.equal(r.ok,true);assert.equal(r.model,'qwen-provider-version');assert.equal(r.model_source,'provider_response');assert.equal(r.executed_by,'qianwen');assert.equal(r.tokens_used,32);
});
test('missing dedicated key does not borrow foreign provider credentials',()=>{assert.equal(qwenConfig({OPENAI_API_KEY:'sk-foreign'}).key,'');assert.equal(qwenConfig({QWEN_API_KEY:key}).key,key);assert.equal(qwenConfig({DASHSCOPE_API_KEY:key,QWEN_API_KEY:'other'}).key,key);});
test('official workspace and regional endpoints are supported; arbitrary hosts and redirection inputs are rejected',()=>{
 for(const host of ['dashscope.aliyuncs.com','dashscope-intl.aliyuncs.com','ws-fixture.cn-beijing.maas.aliyuncs.com'])assert.equal(qwenConfig({DASHSCOPE_BASE_URL:'https://'+host+'/compatible-mode/v1/chat/completions'}).base,'https://'+host+'/compatible-mode/v1');
 for(const url of ['http://dashscope.aliyuncs.com/compatible-mode/v1','https://attacker.invalid/compatible-mode/v1','https://dashscope.aliyuncs.com:444/compatible-mode/v1','https://dashscope.aliyuncs.com/compatible-mode/v1?token=secret','https://user@dashscope.aliyuncs.com/compatible-mode/v1'])assert.throws(()=>qwenConfig({DASHSCOPE_BASE_URL:url}));
});
test('Anthropic, OpenAI project and Coding Plan keys are refused before any request',async()=>{
 for(const foreign of ['sk-ant-fixture','sk-proj-fixture','sk-sp-fixture'])assert.equal((await callAgent({apiKey:foreign,prompt:'fixture',fetchImpl:()=>{throw Error('must_not_send');}})).status,'configuration_error');
});
test('invalid input cannot trigger a provider request',async()=>{for(const options of [{prompt:''},{model:'deepseek-chat'},{maxTokens:0},{maxTokens:10000}])assert.equal((await callAgent({apiKey:key,prompt:'fixture',...options,fetchImpl:()=>{throw Error('must_not_send');}})).status,'configuration_error');});
test('authentication, billing, model, rate limit and network failures are distinct and never retried',async()=>{
 for(const [http,code,status]of [[401,'InvalidApiKey','authentication_error'],[403,'Arrearage','billing_or_quota_error'],[404,'ModelNotFound','model_or_endpoint_error'],[429,'Limit','rate_limited'],[500,'ServerError','api_error']]){
  let calls=0;const r=await callAgent({apiKey:key,prompt:'fixture',fetchImpl:async()=>{calls++;return Response.json({error:{code,message:'echo '+key}},{status:http,headers:{'x-request-id':key}});}});assert.equal(r.status,status);assert.equal(calls,1);assert.ok(!JSON.stringify(r).includes(key));
 }
 let calls=0;const r=await callAgent({apiKey:key,prompt:'fixture',fetchImpl:async()=>{calls++;throw Error('terminated '+key);}});assert.equal(r.status,'provider_incomplete_or_uncertain');assert.equal(calls,1);assert.ok(!JSON.stringify(r).includes(key));
});
test('length, empty and malformed output cannot be advertised as complete',async()=>{
 for(const data of [{...success,choices:[{finish_reason:'length',message:{content:'partial'}}]},{...success,choices:[{finish_reason:'stop',message:{content:''}}]},{}]){
  const r=await callAgent({apiKey:key,prompt:'fixture',fetchImpl:async()=>Response.json(data)});assert.equal(r.ok,false);
 }
 const data={...success};delete data.model;const r=await callAgent({apiKey:key,prompt:'fixture',fetchImpl:async()=>Response.json(data)});assert.equal(r.model_source,'requested_model');
});
test('native Qwen is last and reviews actual prior outputs; retired native seats remain absent',()=>{
 assert.deepEqual(dailyAgents(),['deepseek','doubao','grok','qianwen']);assert.equal(DAILY_CHANNELS.at(-1).key,'DASHSCOPE_API_KEY');
 const context=qwenReviewContext([{agent:'deepseek',status:'success',output:'real'},{agent:'qianwen',output:'self'}],{seats:{deepseek:{artifact:{path:'known',sha256:'hash'}}}},'2026-10-19');assert.ok(context.includes('real'));assert.ok(context.includes('hash'));assert.ok(!context.includes('self'));
});

test('Qwen has its own real daily claim before a single reserved call, rather than reusing another seat',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qwen-daily-')),date='2026-10-19',now=Date.parse(date+'T01:00:00Z');
 try{
  let state=seedTasks({ran_at:new Date(now).toISOString(),agents:{}},now),calls=0;
  const options={root,date,now,runKey:'fixture:1',sourceCommit:'fixture',agents:['qianwen'],snapshot:async()=>({available:true,...structuredClone(state)}),command:async body=>{state=control(state,{...body,reason:'fixture'},'qianwen',{targets:[{name:'qianwen'}],baseline_concurrency:1},now).state;}};
  const r=await prepareDailyBoard(options);assert.equal(r.seats.qianwen.claim_verified,true);assert.equal(r.seats.qianwen.assignment.id,'DAILY-'+date+'-qianwen');
  const generate=()=>runReservedSeat({...options,agent:'qianwen',call:async()=>{calls++;return {ok:true,status:'success',output:'audit【交付结束】',finish_reason:'stop',model:'qwen-test'};}});
  assert.equal((await generate()).ok,true);assert.equal((await generate()).status,'blocked_no_repurchase');assert.equal(calls,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('probe preparation is idempotent and does not import a key or invoke a model',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qwen-probe-'));try{
  spawnSync('git',['init','-q'],{cwd:root});spawnSync('git',['-c','user.name=fixture','-c','user.email=fixture@example.invalid','commit','--allow-empty','-qm','fixture'],{cwd:root});
  const script=path.resolve('scripts/qwen-acceptance.mjs'),env={PATH:process.env.PATH,GITHUB_RUN_ID:'fixture',QWEN_PROBE_ID:'QWEN-FIXTURE-0001'};
  for(let i=0;i<2;i++){const r=spawnSync(process.execPath,[script,'prepare'],{cwd:root,env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).execute,i===0);}
  const row=JSON.parse(fs.readFileSync(path.join(root,'knowledge/results/providers/probes/QWEN-FIXTURE-0001.json')));assert.equal(row.model_calls,0);assert.equal(row.generation_verified,false);
  const bad=spawnSync(process.execPath,[script,'prepare'],{cwd:root,env:{...env,QWEN_PROBE_ID:'../../secret'},encoding:'utf8'});assert.notEqual(bad.status,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('durable probe calls once; success, lost response and remote-hash mismatch cannot be repurchased',()=>{
 const script=path.resolve('scripts/qwen-acceptance.mjs');
 for(const mode of ['success','lost','hash_mismatch']){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'qwen-execute-'));try{
   spawnSync('git',['init','-q'],{cwd:root});spawnSync('git',['-c','user.name=fixture','-c','user.email=fixture@example.invalid','commit','--allow-empty','-qm','fixture'],{cwd:root});
   const env={PATH:process.env.PATH,GITHUB_RUN_ID:'fixture',QWEN_PROBE_ID:'QWEN-EXECUTE-0001',DASHSCOPE_API_KEY:key};
   const prepared=spawnSync(process.execPath,[script,'prepare'],{cwd:root,env,encoding:'utf8'});assert.equal(prepared.status,0,prepared.stderr);
   const shim=path.join(root,'mock.mjs');
   fs.writeFileSync(shim,`import fs from 'node:fs';globalThis.fetch=async(url,init)=>{if(url.startsWith('https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/'))return new Response(${mode==='hash_mismatch'?"'mismatch'":"fs.readFileSync('knowledge/results/providers/probes/QWEN-EXECUTE-0001.json')"});if(url!=='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')throw Error('wrong endpoint');const count=fs.existsSync('calls')?Number(fs.readFileSync('calls')):0;fs.writeFileSync('calls',String(count+1));if(JSON.parse(init.body).max_tokens!==128)throw Error('unbounded');${mode==='lost'?"throw Error('terminated');":"return Response.json({model:'qwen-test',choices:[{finish_reason:'stop',message:{content:'verified【交付结束】'}}],usage:{total_tokens:21}});"}};`);
   const first=spawnSync(process.execPath,['--import',shim,script,'execute'],{cwd:root,env,encoding:'utf8'});assert.equal(first.status,mode==='success'?0:1,first.stderr);
   const calls=()=>fs.existsSync(path.join(root,'calls'))?Number(fs.readFileSync(path.join(root,'calls'))):0;
   assert.equal(calls(),mode==='hash_mismatch'?0:1);
   if(mode!=='hash_mismatch'){
    const second=spawnSync(process.execPath,['--import',shim,script,'execute'],{cwd:root,env,encoding:'utf8'});assert.notEqual(second.status,0);assert.equal(calls(),1);
    const row=JSON.parse(fs.readFileSync(path.join(root,'knowledge/results/providers/probes/QWEN-EXECUTE-0001.json')));assert.equal(row.generation_verified,mode==='success');assert.equal(row.paid,false);assert.equal(row.tx_hash,null);
   }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 }
});
