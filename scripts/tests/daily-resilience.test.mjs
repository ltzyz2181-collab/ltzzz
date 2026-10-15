import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {callAI,default as worker} from '../../ltzzz-daily-automation-worker.js';
import {runDeepseekDaily} from '../lib/deepseek-daily.mjs';
const env={DEEPSEEK_API_KEY:'fixture-secret'};
const invoke=(extra={})=>callAI({channel:'deepseek',env,taskName:'test',prompt:'fixture',...extra});
test('manual Worker run rejects GET, absent identity and wrong identity before any model request',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected network')};
  try{
    for(const [method,identity,authorization,http] of [['GET','token','Bearer token',405],['POST',null,null,503],['POST','token','Bearer wrong',401]]){
      const r=await worker.fetch(new Request('https://example.invalid/run?task=deepseek-daily',{method,headers:authorization?{Authorization:authorization}:{}}),identity?{LTZZZ_AGENT_TOKEN:identity}:{});
      assert.equal(r.status,http);
    }
    assert.equal(calls,0);
  }finally{globalThis.fetch=original;}
});
test('body stalled after HTTP headers still hits the generation deadline with only one request',async()=>{
  const original=globalThis.fetch;let calls=0;const keeper=setTimeout(()=>{},1000);
  globalThis.fetch=async(_,options)=>{calls++;return new Response(new ReadableStream({start(controller){options.signal.addEventListener('abort',()=>controller.error(new Error('body aborted')),{once:true});}}),{headers:{'Content-Type':'application/json'}})};
  try{const r=await invoke({timeoutMs:25});assert.equal(r.ok,false);assert.equal(r.status,'exception');assert.equal(calls,1);assert.equal(r.error,'provider_transport_or_timeout');}
  finally{globalThis.fetch=original;clearTimeout(keeper);}
});
test('reasoning-only and truncated generation cannot count as accepted content',async()=>{
  const original=globalThis.fetch;
  try{for(const [message,finish,status] of [[{content:'',reasoning_content:'private reasoning'},'stop','empty_output'],[{content:'unfinished'},'length','incomplete_output']]){
    globalThis.fetch=async()=>Response.json({choices:[{message,finish_reason:finish}]});
    const r=await invoke();assert.equal(r.ok,false);assert.equal(r.status,status);assert.equal(JSON.stringify(r).includes('private reasoning'),false);
  }}finally{globalThis.fetch=original;}
});
test('a complete Worker response retains actual model and usage; HTTP rejection never echoes arbitrary upstream secrets',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>Response.json({model:'actual-model',choices:[{message:{content:'complete'},finish_reason:'stop'}],usage:{total_tokens:7}});
    const r=await invoke();assert.equal(r.ok,true);assert.equal(r.model,'actual-model');assert.equal(r.tokens_used,7);
    globalThis.fetch=async()=>new Response('upstream fixture-secret',{status:429});
    const rejected=await invoke();assert.equal(rejected.ok,false);assert.equal(JSON.stringify(rejected).includes('fixture-secret'),false);
  }finally{globalThis.fetch=original;}
});
test('DeepSeek task records a real generation failure as top-level failure while retaining the error artifact',async()=>{
  const original=globalThis.fetch;let generation=0,stored=0;
  globalThis.fetch=async(url)=>{
    if(String(url).startsWith('https://raw.githubusercontent.com/'))return new Response('# 真实读取的文件');
    generation++;return new Response('rejected',{status:429});
  };
  try{
    const response=await worker.fetch(new Request('https://example.invalid/run?task=deepseek-daily',{method:'POST',headers:{Authorization:'Bearer fixture'}}),{...env,LTZZZ_AGENT_TOKEN:'fixture',LTZZZ_ARTIFACTS:{put:async()=>{stored++;}}});
    const result=await response.json();assert.equal(result.ok,false);assert.equal(result.ai.status,'api_error');assert.equal(result.artifact_recorded,true);assert.equal(generation,1);assert.equal(stored,1);
  }finally{globalThis.fetch=original;}
});
test('artifact storage failure after generation does not replay a paid task',async()=>{
  const original=globalThis.fetch;let generation=0;
  globalThis.fetch=async(url)=>{
    if(String(url).startsWith('https://raw.githubusercontent.com/'))return new Response('# fixture memory');
    generation++;return Response.json({choices:[{message:{content:'complete text'},finish_reason:'stop'}]});
  };
  try{
    const response=await worker.fetch(new Request('https://example.invalid/run?task=deepseek-daily',{method:'POST',headers:{Authorization:'Bearer fixture'}}),{...env,LTZZZ_AGENT_TOKEN:'fixture',LTZZZ_ARTIFACTS:{put:async()=>{throw Error('storage failed')}}});
    const result=await response.json();assert.equal(result.ok,false);assert.equal(result.status,'task_failed_no_replay');assert.equal(generation,1);
  }finally{globalThis.fetch=original;}
});
function fixture(){
  fs.mkdirSync('work',{recursive:true});const root=fs.mkdtempSync(path.resolve('work/deepseek-daily-test-'));fs.mkdirSync(path.join(root,'ltzzz-memory'));
  for(const name of ['魄','识神','梦境数据库','文明研究','项目历史','重要事件','装备论'])fs.writeFileSync(path.join(root,'ltzzz-memory',name+'.md'),'# '+name+'\n'+'正文'.repeat(2500)+'\n'+name+'-END');
  return root;
}
test('interrupted daily stream persists partial evidence and a rerun cannot buy a second request',async()=>{
  const root=fixture();let calls=0;
  try{
    const call=async({prompt,onProgress})=>{calls++;assert.ok(prompt.includes('装备论-END'));await onProgress({partial_output:'half',request_id:'req-1'});return {ok:false,status:'stream_interrupted',partial_output:'half',request_id:'req-1'}};
    const first=await runDeepseekDaily({root,env,call,date:'2026-10-15'});assert.equal(first.ok,false);assert.equal(first.partial_output,'half');assert.equal(first.memory_files.length,7);
    const again=await runDeepseekDaily({root,env,call,date:'2026-10-15'});assert.equal(again.reused,true);assert.equal(calls,1);
    assert.ok(fs.readFileSync(path.join(root,'knowledge/daily/deepseek/2026-10-15.md'),'utf8').includes('没有通过完整性验收'));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('legacy daily files prevent duplicate recovery; incomplete end markers cannot pass delivery',async()=>{
  const root=fixture();let calls=0;const call=async()=>{calls++;return {ok:true,output:'unfinished',finish_reason:'stop'}};
  try{
    const first=await runDeepseekDaily({root,env,call,date:'2026-10-15'});assert.equal(first.ok,false);assert.equal(first.status,'incomplete_output');
    fs.writeFileSync(path.join(root,'knowledge/daily/deepseek/2026-10-16.md'),'historical failed attempt');
    const legacy=await runDeepseekDaily({root,env,call,date:'2026-10-16'});assert.equal(legacy.status,'legacy_record_exists_no_repurchase');assert.equal(calls,1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('accepted daily delivery records actual model identity and survives same-day rerun without generation',async()=>{
  const root=fixture();let calls=0;
  try{
    const call=async()=>{calls++;return {ok:true,output:'complete【交付结束】',finish_reason:'stop',model:'actual-model',tokens_used:19}};
    const r=await runDeepseekDaily({root,env,call,date:'2026-10-15'});assert.equal(r.ok,true);assert.equal(r.tokens_used,19);assert.equal(r.model,'actual-model');
    assert.equal((await runDeepseekDaily({root,env,call,date:'2026-10-15'})).reused,true);assert.equal(calls,1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
