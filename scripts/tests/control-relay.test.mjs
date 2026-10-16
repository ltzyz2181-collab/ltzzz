import test from 'node:test';import assert from 'node:assert/strict';
import {relayBody,relayRequest,executeRelay,REPOSITORY} from '../lib/control-relay.mjs';import {ghArguments} from '../ltzzz-relay.mjs';
import {control} from '../../workers/pulse-worker/engine.js';import config from '../../workers/pulse-worker/pulse.json' with {type:'json'};
const context={actor:'ltzyz2181-collab',repository:REPOSITORY};
const event=()=>({action:'opened',repository:{full_name:REPOSITORY},issue:{number:99,title:'[LTZZZ接力] readonly',user:{login:context.actor},body:relayBody('qianwen_inspect','核对真实回执，不投资、不调用模型。')}});
test('relay admits only repository owner opened events and enumerated actions',()=>{
 assert.equal(relayRequest(event(),context).action,'qianwen_inspect');
 for(const ctx of [{...context,actor:'other'},{...context,repository:'other/repo'}])assert.throws(()=>relayRequest(event(),ctx));
 for(const mutate of [e=>e.action='edited',e=>e.issue.user.login='other',e=>e.issue.number=-1,e=>e.issue.body=relayBody('inspect','x')+'\n\n### 接力动作\n\nanything',e=>e.issue.body=e.issue.body.replace('（零模型）','（任意付款）')]){const e=event();mutate(e);assert.throws(()=>relayRequest(e,context));}
 assert.throws(()=>relayBody('invest','execute'));assert.throws(()=>relayBody('inspect','x'.repeat(2501)));
});
test('desktop CLI uses exact repository, argv and stdin, never evaluates shell-like task content',()=>{
 const task='$(cat sensitive) `run-this`\n原样作为任务数据，不运行。';const args=ghArguments(['submit','qianwen_inspect','task.txt'],()=>task);
 assert.deepEqual(args.slice(0,4),['issue','create','--repo',REPOSITORY]);assert.equal(args.at(-1).stdin,relayBody('qianwen_inspect',task));assert.ok(args.includes('--body-file'));assert.deepEqual(ghArguments(['status','99']),['api','--method','GET',`repos/${REPOSITORY}/issues/99`]);
 assert.throws(()=>ghArguments(['status','99;cmd']));assert.throws(()=>ghArguments(['submit','anything','task.txt'],()=>task));
});
function fixture(action='qianwen_inspect'){
 const record={id:'issue-99',action,task:'Inspect committed evidence only',status:'claimed_before_remote_access',operations:[],model_calls:0,native_qianwen_calls:0,paid:false,tx_hash:null};
 let state={ran_at:new Date().toISOString(),stale:false,controls:{dispatch_paused:false},agents:{qianwen:{dispatch_allowed:true}}};const calls=[],saved=[];
 return {record,calls,saved,options:{readStatus:async()=>state,control:async(role,body)=>{calls.push({role,body});assert.ok(saved.some(s=>s.operations.some(o=>o.id===body.id&&o.status==='request_started')),'intent saved before request');state=control(state,body,role,config).state;return {ok:true,actor:role,duplicate:false};},evidence:{sources:[{path:'knowledge/results/fixture.json',sha256:'a'.repeat(64)}]},save:async r=>saved.push(structuredClone(r))}};
}
test('real control engine receives coordinator dispatch then deputy ack and verifies persisted handover',async()=>{
 const f=fixture();await executeRelay(f.record,f.options);assert.equal(f.record.status,'completed_readonly_pending_review');assert.deepEqual(f.calls.map(c=>c.role),['gpt','qianwen']);assert.deepEqual(f.calls.map(c=>c.body.action),['dispatch','ack_dispatch']);assert.equal(f.record.board_verification.verified,true);assert.equal(f.record.native_qianwen_calls,0);assert.equal(f.record.paid,false);assert.equal(f.record.tx_hash,null);assert.equal(f.record.execution_kind,'qianwen_authorized_rules_executor_not_native_model');await assert.rejects(()=>executeRelay(f.record,f.options),/fresh_durable_claim/);assert.equal(f.calls.length,2);
});
test('general task stays queued for actual external acceptance, inspection makes no control calls',async()=>{
 for(const action of ['dispatch','inspect']){const f=fixture(action);await executeRelay(f.record,f.options);assert.equal(f.record.status,action==='dispatch'?'assigned_waiting_external_acceptance':'completed_readonly');assert.equal(f.calls.length,action==='dispatch'?1:0);assert.equal(f.record.evidence,undefined);}
});
test('unknown request stops without retry or false completion; stale, invalid or paused sensors cannot dispatch',async()=>{
 const f=fixture();let calls=0;f.options.control=async()=>{calls++;throw Error('connection lost after dispatch')};await executeRelay(f.record,f.options);assert.equal(calls,1);assert.equal(f.record.status,'blocked_or_remote_uncertain');assert.equal(f.record.automatic_retry_allowed,false);assert.equal(f.record.operations[0].status,'request_started');
 for(const snapshot of [{ran_at:'not-a-date',stale:false},{ran_at:new Date(0).toISOString(),stale:false},{ran_at:new Date().toISOString(),stale:false,controls:{dispatch_paused:true}}]){const g=fixture();g.options.readStatus=async()=>snapshot;await executeRelay(g.record,g.options);assert.equal(g.record.status,'blocked_or_remote_uncertain');assert.equal(g.calls.length,0);}
});
test('a different authenticated role or an absent remote dispatch cannot prove handover',async()=>{
 for(const kind of ['role','board']){const f=fixture();if(kind==='role')f.options.control=async()=>({ok:true,actor:'other'});else{let count=0;const read=f.options.readStatus;f.options.readStatus=async()=>++count===1?read():{dispatches:[]};}await executeRelay(f.record,f.options);assert.equal(f.record.status,'blocked_or_remote_uncertain');assert.equal(f.record.board_verification,undefined);}
});
