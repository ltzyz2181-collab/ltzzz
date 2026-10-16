import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareDailyBoard,runReservedSeat,syncDailyBoard,readLedger,saveLedger} from '../lib/daily-task-board.mjs';
import {taskCommand,seedTasks} from '../../workers/pulse-worker/tasks.js';
const date='2026-10-16',now=Date.parse(date+'T03:00:00Z'),agent='deepseek';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'daily-board-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 let state=seedTasks({ran_at:new Date(now).toISOString(),agents:{}},now),posts=0,calls=0,remote=new Map();
 const options={root,date,runKey:'run:1',sourceCommit:'source-sha',agents:[agent],now,
  snapshot:async()=>({available:true,...structuredClone(state)}),
  command:async body=>{posts++;state=taskCommand(state,body,'qianwen',[agent],now).state;},
  readRemote:async file=>{if(!remote.has(file))throw Error('not_committed');return remote.get(file);}};
 const generate=extra=>runReservedSeat({...options,agent,call:async()=>{calls++;return {ok:true,output:'Verified assertion draft【交付结束】',finish_reason:'stop',model:'actual-model',tokens_used:12,...extra};}});
 const commit=()=>{const a=readLedger(root,date).seats[agent].artifact;remote.set(a.path,fs.readFileSync(path.join(root,a.path)));};
 return {options,generate,commit,get state(){return state},get posts(){return posts},get calls(){return calls},remote};
}
test('claim, immutable full output, commit/readback, submit and pending/unpaid verification',async t=>{
 const f=fixture(t);await prepareDailyBoard(f.options);assert.equal(readLedger(f.options.root,date).seats[agent].claim_verified,true);
 await f.generate();f.commit();await syncDailyBoard(f.options);
 const r=readLedger(f.options.root,date),s=r.seats[agent];assert.equal(s.status,'submitted_pending_review');assert.equal(s.accepted,false);assert.equal(s.paid,false);
 const artifact=JSON.parse(fs.readFileSync(path.join(f.options.root,s.artifact.path)));assert.equal(artifact.actual_model,'actual-model');assert.equal(artifact.tokens_used,12);assert.equal(artifact.output,'Verified assertion draft【交付结束】');
 assert.equal(f.state.task_board.find(t=>t.id===s.assignment.id).evidence_sha256,s.artifact.sha256);
 await syncDailyBoard(f.options);assert.equal(f.posts,2);assert.equal(f.calls,1);
});
test('missing/stale/paused snapshots and rejected claims never purchase output',async t=>{
 for(const snapshot of [{available:false},{available:true,ran_at:'2020-01-01'}, {available:true,ran_at:new Date(now).toISOString(),manual:{global:true}}]){
  const f=fixture(t);await prepareDailyBoard({...f.options,snapshot:async()=>snapshot});await f.generate();assert.equal(f.calls,0);
 }
 const f=fixture(t);await prepareDailyBoard({...f.options,command:async()=>{throw Error('auth secret must not persist')}});await f.generate();assert.equal(f.calls,0);assert.ok(!JSON.stringify(readLedger(f.options.root,date)).includes('secret'));
});
test('POST success without a verified live claim cannot trigger generation',async t=>{
 const f=fixture(t);await prepareDailyBoard({...f.options,command:async()=>({ok:true})});await f.generate();assert.equal(f.calls,0);
});
test('unavailable coordinator assignment is blocked instead of pretending to claim locally',async t=>{
 const f=fixture(t);await prepareDailyBoard({...f.options,control:{date,dispatches:[{id:'not-on-board',agent,instruction:'custom task'}]}});await f.generate();assert.equal(f.calls,0);
});
test('already claimed by this logical seat is not adopted by another executor',async t=>{
 const f=fixture(t);await f.options.command({action:'claim_task',agent,task_id:`ANS-${date}-${agent}`});await prepareDailyBoard(f.options);await f.generate();assert.equal(f.calls,0);
});
test('empty, truncated, unknown finish and out-of-scope output persist but are not submitted',async t=>{
 for(const extra of [{output:''},{finish_reason:'length'},{finish_reason:null},{output:'SPEND_PROPOSAL: pay【交付结束】'},{ok:false,status:'not_configured'}]){
  const f=fixture(t);await prepareDailyBoard(f.options);await f.generate(extra);f.commit();await syncDailyBoard(f.options);assert.equal(f.posts,1);assert.equal(readLedger(f.options.root,date).seats[agent].status,'generation_failed_no_repurchase');await f.generate();assert.equal(f.calls,1);
 }
});
test('same-day replay, different attempt and ambiguous generation cannot spend twice',async t=>{
 const f=fixture(t);await prepareDailyBoard(f.options);
 await prepareDailyBoard({...f.options,runKey:'other:1'});
 await runReservedSeat({...f.options,runKey:'other:1',agent,call:()=>{throw Error('must not run')}});
 const r=readLedger(f.options.root,date);assert.equal(r.run_key,'run:1');
 await runReservedSeat({...f.options,agent,call:async()=>{throw Error('unknown')}});await f.generate();assert.equal(f.calls,0);assert.equal(readLedger(f.options.root,date).seats[agent].status,'generation_failed_no_repurchase');
});
test('uncommitted artifact never submits and sync recovery does not regenerate',async t=>{
 const f=fixture(t);await prepareDailyBoard(f.options);await f.generate();await syncDailyBoard(f.options);assert.equal(f.posts,1);assert.equal(readLedger(f.options.root,date).seats[agent].status,'sync_unknown');f.commit();await syncDailyBoard(f.options);assert.equal(f.posts,2);assert.equal(f.calls,1);
});
test('local byte tampering, remote mismatch, path escape and task binding mismatch block submission',async t=>{
 for(const mode of ['bytes','remote','path','binding']){
  const f=fixture(t);await prepareDailyBoard(f.options);await f.generate();f.commit();const r=readLedger(f.options.root,date),s=r.seats[agent];
  if(mode==='bytes')fs.appendFileSync(path.join(f.options.root,s.artifact.path),' ');
  if(mode==='remote')f.remote.set(s.artifact.path,Buffer.from('different'));
  if(mode==='path'){s.artifact.path='data/memory/deepseek.json';saveLedger(f.options.root,r);}
  if(mode==='binding'){s.assignment.id='wrong';saveLedger(f.options.root,r);}
  await syncDailyBoard(f.options);assert.equal(f.posts,1);assert.equal(readLedger(f.options.root,date).seats[agent].status,'sync_unknown');
 }
});
test('lost submit response is reconciled by board readback without another submit or model call',async t=>{
 const f=fixture(t);await prepareDailyBoard(f.options);await f.generate();f.commit();
 await syncDailyBoard({...f.options,command:async b=>{await f.options.command(b);throw Error('timeout after accepted')}});
 assert.equal(readLedger(f.options.root,date).seats[agent].status,'sync_unknown');await syncDailyBoard(f.options);assert.equal(f.posts,2);assert.equal(f.calls,1);assert.equal(readLedger(f.options.root,date).seats[agent].status,'submitted_pending_review');
});
test('mismatched board hashes/status do not pass and paused sync does not post',async t=>{
 const f=fixture(t);await prepareDailyBoard(f.options);await f.generate();f.commit();
 await syncDailyBoard({...f.options,snapshot:async()=>({available:true,...f.state,manual:{global:true}})});assert.equal(f.posts,1);
 await syncDailyBoard({...f.options,command:async b=>{await f.options.command({...b,evidence_sha256:'a'.repeat(64)})}});assert.equal(readLedger(f.options.root,date).seats[agent].status,'sync_unknown');
});
