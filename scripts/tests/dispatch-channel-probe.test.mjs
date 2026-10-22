import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {CHANNEL_TARGETS,probeDispatchChannels,verifyPlan} from '../lib/dispatch-channel-probe.mjs';
import {control,dispatchNames,validateConfig} from '../../workers/pulse-worker/engine.js';
import {metaExecutorToken} from '../lib/meta-executor-auth.mjs';
const config=JSON.parse(fs.readFileSync('workers/pulse-worker/pulse.json','utf8'));
const at=Date.parse('2026-10-22T03:00:00Z');
function fixture(){let state={ran_at:new Date(at).toISOString(),stale:false,dispatches:[]},calls=0;const record={task_id:'DISPATCH-CHANNELS-ISSUE-999',nonce:'fixture-nonce',status:'reserved_before_remote_access'};const options={schema:async()=>({controllers:['gpt','qianwen'],dispatch_targets:dispatchNames(config),health_targets:config.targets.map(t=>t.name)}),status:async()=>structuredClone(state),control:async body=>{const r=control(state,body,'qianwen',config,at);state={...r.state,ran_at:new Date(at).toISOString(),stale:false};return {http:200,data:{ok:true,actor:'qianwen',duplicate:r.duplicate}};},save:async()=>{},now:()=>at,callQwen:async()=>{calls++;return {ok:true,status:'success',native_qwen_call:true,model_source:'provider_response',model:'qwen-plus',provider:'aliyun_dashscope',finish_reason:'stop',output:JSON.stringify({nonce:record.nonce,targets:CHANNEL_TARGETS}),tokens_used:100};},runMeta:async({taskId,nonce})=>({task_id:taskId,nonce,generation_verified:true,model_calls:1,provider:'cloudflare-workers-ai'}),workbuddyInspect:async({taskId,nonce})=>({task_id:taskId,nonce,inspection_verified:true,model_calls:0,native_workbuddy_client:false})};return {record,options,get state(){return state;},get calls(){return calls;}};}
test('all active seats are dispatchable by deputy without inventing health endpoints or reinstating Microsoft',()=>{
 assert.doesNotThrow(()=>validateConfig(config));for(const target of CHANNEL_TARGETS)assert.ok(dispatchNames(config).includes(target));assert.equal(config.targets.length,6);for(const target of ['claude','meta','workbuddy'])assert.equal(config.targets.some(t=>t.name===target),false);assert.equal(dispatchNames(config).includes('microsoft'),false);
 assert.throws(()=>validateConfig({...config,dispatch_targets:['claude','claude']}));
});
test('native Qwen plan and real deputy permissions remain separate from external native acceptance',async()=>{
 const f=fixture();const r=await probeDispatchChannels(f.record,f.options);assert.equal(f.calls,1);assert.equal(r.channels.length,11);assert.ok(r.channels.every(c=>c.dispatch_verified));assert.equal(r.native_plan.verified,true);assert.equal(r.channels.find(c=>c.target==='claude').consumer_verified,false);assert.equal(r.channels.find(c=>c.target==='workbuddy').native_client_verified,false);assert.equal(r.channels.find(c=>c.target==='meta').consumer_verified,true);assert.equal(r.model_calls,2);assert.equal(r.paid,false);assert.equal(r.financial_execution,false);assert.equal(r.native_anthropic_calls,0);
 assert.ok(f.state.dispatches.every(d=>d.probe_only&&d.status!=='queued'));assert.ok(r.channels.filter(c=>['claude','meta','workbuddy'].includes(c.target)).every(c=>c.idempotency_verified));
 await assert.rejects(()=>probeDispatchChannels(f.record,f.options),/fresh_committed_reservation/);assert.equal(f.calls,1);
});
test('missing target registration is a blocker, never a successful fake external handoff',async()=>{
 const f=fixture();f.options.schema=async()=>({controllers:['qianwen'],dispatch_targets:['deepseek']});const r=await probeDispatchChannels(f.record,f.options);assert.equal(r.status,'partial_dispatch_blocked');assert.equal(r.channels.find(c=>c.target==='claude').status,'blocked_target_not_registered');
});
test('lost response does not cause an automatic resend or native model repurchase',async()=>{
 const f=fixture();let sends=0;f.options.control=async()=>{sends++;throw Error('timeout');};const r=await probeDispatchChannels(f.record,f.options);assert.equal(sends,11);assert.equal(f.calls,1);assert.ok(r.channels.every(c=>!c.dispatch_verified));assert.equal(r.channels.find(c=>c.target==='claude').status,'blocked_transport_or_uncertain_no_retry');
});
test('forged actor or mismatched queue payload cannot pass exact readback',async()=>{
 const f=fixture(),original=f.options.control;f.options.control=async body=>{const result=await original(body);result.data.actor='gpt';return result;};const r=await probeDispatchChannels(f.record,f.options);assert.ok(r.channels.every(c=>!c.dispatch_verified));
});
test('generic acknowledgements cannot consume a probe, wrong consumer/hash cannot claim native work',()=>{
 const command={id:'probe',action:'dispatch',target:'claude',instruction:'nonce fixture',probe_only:true,reason:'owner test'};let state=control({},command,'qianwen',config,at).state;
 state=control(state,{id:'ack',action:'ack_dispatch',ids:['probe'],reason:'generic'},'gpt',config,at).state;assert.equal(state.dispatches[0].status,'probe_waiting_consumer');
 state=control(state,{id:'ack-2',action:'ack_dispatch',ids:['probe'],probe_only:true,consumer_kind:'workbuddy_rules',consumer_agent:'workbuddy',evidence_sha256:'a'.repeat(64),reason:'wrong consumer'},'qianwen',config,at).state;assert.equal(state.dispatches[0].status,'probe_waiting_consumer');assert.equal(state.dispatches[0].native_consumer_verified,false);
});
test('new probes preserve existing business dispatches; capacity fails instead of silently dropping queued work',()=>{
 const previous={dispatches:Array.from({length:250},(_,i)=>({id:'old-'+i,agent:'deepseek',status:'queued'}))};assert.throws(()=>control(previous,{id:'new',action:'dispatch',target:'meta',instruction:'inspect',probe_only:true,reason:'probe'},'qianwen',config),/capacity/);assert.equal(previous.dispatches.length,250);
 const result=control(previous,{id:'old-0',action:'dispatch',target:'deepseek',instruction:'inspect',reason:'retry'},'qianwen',config);assert.equal(result.duplicate,true);
});
test('truncated plan, wrong nonce, duplicate targets or requested-model fallback cannot prove native Qwen plan',()=>{
 const record={nonce:'x'},valid={ok:true,native_qwen_call:true,model_source:'provider_response',finish_reason:'stop',output:JSON.stringify({nonce:'x',targets:CHANNEL_TARGETS})};assert.equal(verifyPlan(valid,record),true);for(const patch of [{finish_reason:'length'},{model_source:'requested_model'},{output:JSON.stringify({nonce:'wrong',targets:CHANNEL_TARGETS})},{output:JSON.stringify({nonce:'x',targets:CHANNEL_TARGETS.map(()=> 'meta')})}])assert.equal(verifyPlan({...valid,...patch},record),false);
});
test('managed Meta token is stable per configured credential and does not equal or expose its source',()=>{
 const env={CLOUDFLARE_API_TOKEN:'fake-managed-test-key'};const a=metaExecutorToken(env);assert.equal(a,metaExecutorToken(env));assert.notEqual(a,env.CLOUDFLARE_API_TOKEN);assert.equal(a.length,64);assert.equal(metaExecutorToken({META_WORKER_TOKEN:'explicit-test'}),'explicit-test');assert.throws(()=>metaExecutorToken({}));
});
test('Meta auth readiness never calls inference and rejects anonymous or incorrect credentials',async()=>{
 const source=fs.readFileSync('workers/meta-worker/index.ts','utf8'),worker=(await import('data:text/javascript,'+encodeURIComponent(source))).default;let calls=0;const env={META_WORKER_TOKEN:'fixture-token',AI:{run:async()=>{calls++;return {response:'must-not-run'};}}};
 const req=token=>new Request('https://meta.test/auth-check',{method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{})},body:'{}'});
 assert.equal((await worker.fetch(req(),env)).status,401);assert.equal((await worker.fetch(req('wrong'),env)).status,401);const response=await worker.fetch(req('fixture-token'),env);assert.equal(response.status,200);assert.equal((await response.json()).model_calls,0);assert.equal(calls,0);
});
