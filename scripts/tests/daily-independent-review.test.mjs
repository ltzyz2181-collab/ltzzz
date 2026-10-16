import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareDailyBoard,runReservedSeat,syncDailyBoard,readLedger} from '../lib/daily-task-board.mjs';
import {dailyReviewPrompt,materializeDailyReview,syncDailyReview,recordDailyReviewReadback} from '../lib/daily-independent-review.mjs';
import {control} from '../../workers/pulse-worker/engine.js';
import {seedTasks} from '../../workers/pulse-worker/tasks.js';
const date='2026-10-16',now=Date.parse(date+'T03:00:00Z');
function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'daily-review-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 let state=seedTasks({ran_at:new Date(now).toISOString(),agents:{}},now),calls=0,commands=[];
 const remote=new Map();
 const options={root,date,now,runKey:'run:1',sourceCommit:'source-sha',agents:['deepseek','doubao'],snapshot:async()=>({available:true,...structuredClone(state)}),command:async body=>{commands.push(body);state=control(state,{...body,reason:'Public test artifact'},'qianwen',{targets:[{name:'deepseek'},{name:'doubao'}],baseline_concurrency:1},now).state;},readRemote:async file=>{if(!remote.has(file))throw Error('not_committed');return remote.get(file);}};
 const generate=async (patch={},workerPatch={})=>{
  await prepareDailyBoard(options);
  await runReservedSeat({...options,agent:'deepseek',call:async()=>{calls++;return {ok:true,status:'success',output:'Worker draft with falsifiable check【交付结束】',finish_reason:'stop',model:'deepseek-v4-pro',model_source:'provider_response',...workerPatch};}});
  const prompt=dailyReviewPrompt(options),seat=readLedger(root,date).seats.deepseek;
  const verdict={accepted:true,artifact_sha256:seat.artifact.sha256,reasons:['The proposed check is scoped to a draft.'],unverified:['Not deployed'],...patch};
  await runReservedSeat({...options,agent:'doubao',call:async()=>{calls++;return {ok:true,status:'success',output:'Daily reflection\n【日课独立审核JSON】\n```json\n'+JSON.stringify(verdict)+'\n```\n【日课独立审核结束】\n【交付结束】',finish_reason:'stop',model:'doubao-seed-2-1-pro',model_source:'provider_response'};}});
  materializeDailyReview(options);return prompt;
 };
 const commit=()=>{const visit=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,entry.name);if(entry.isDirectory())visit(f);else remote.set(path.relative(root,f).split(path.sep).join('/'),fs.readFileSync(f));}};visit(root);};
 const sync=async(extra={})=>{const opts={...options,...extra};await syncDailyBoard(opts);materializeDailyReview(options);await syncDailyReview(opts);await syncDailyBoard(opts);return recordDailyReviewReadback(options);};
 return {options,generate,commit,sync,remote,get calls(){return calls},get commands(){return commands},get state(){return state}};
}
test('existing two provider calls yield committed independent review without another model or deployment',async t=>{
 const f=fixture(t),prompt=await f.generate();assert.ok(prompt.includes('worker_artifact'));assert.ok(prompt.includes('待审数据'));
 f.commit();const r=await f.sync(),seat=r.seats.deepseek;
 assert.equal(f.calls,2);assert.equal(f.commands.filter(c=>c.action==='review_task').length,1);
 assert.equal(seat.status,'completed_draft_review');assert.equal(seat.review_verified,true);assert.equal(r.independent_review.verified,true);
 assert.equal(seat.paid,false);assert.equal(seat.deployed,false);assert.equal(r.seats.doubao.status,'submitted_pending_review');
 await f.sync();assert.equal(f.calls,2);assert.equal(f.commands.filter(c=>c.action==='review_task').length,1);
});
test('review rejection is a final draft verdict and never becomes acceptance or deployment',async t=>{
 const f=fixture(t);await f.generate({accepted:false,reasons:['Unsupported deployment claim']});f.commit();const r=await f.sync();
 assert.equal(r.seats.deepseek.status,'rejected_draft_review');assert.equal(r.seats.deepseek.accepted,false);assert.equal(r.seats.deepseek.deployed,false);assert.equal(f.calls,2);
});
test('wrong hash, nonboolean verdict and empty reasons cannot be sent as a review',async t=>{
 for(const patch of [{artifact_sha256:'a'.repeat(64)},{accepted:'true'},{reasons:[]}]){
  const f=fixture(t);await f.generate(patch);f.commit();const r=await f.sync();
  assert.equal(f.commands.filter(c=>c.action==='review_task').length,0);assert.equal(r.seats.deepseek.status,'submitted_pending_review');assert.equal(r.independent_review.verified,false);
 }
});
test('truncated worker or unverified actual model cannot establish a prompt subject or review',async t=>{
 for(const patch of [{finish_reason:'length'},{model_source:'requested_model'}]){
  const f=fixture(t),prompt=await f.generate({},patch);assert.ok(prompt.includes('不得声称已经审核'));f.commit();const r=await f.sync();
  assert.equal(r.independent_review,undefined);assert.equal(f.commands.filter(c=>c.action==='review_task').length,0);assert.equal(f.calls,2);
 }
});
test('review and both raw provider artifacts must be committed before posting the verdict',async t=>{
 for(const mode of ['review','reviewer']){
  const f=fixture(t);await f.generate();f.commit();let r=readLedger(f.options.root,date);
  f.remote.delete(mode==='review'?r.independent_review.artifact.path:r.seats.doubao.artifact.path);
  await f.sync();assert.equal(f.commands.filter(c=>c.action==='review_task').length,0);
  f.commit();r=await f.sync();assert.equal(r.independent_review.verified,true);assert.equal(f.calls,2);
 }
});
test('review response loss is recovered by exact readback, without a second verdict or provider call',async t=>{
 const f=fixture(t);await f.generate();f.commit();
 const r=await f.sync({command:async body=>{await f.options.command(body);if(body.action==='review_task')throw Error('response lost');}});
 assert.equal(r.independent_review.verified,true);await f.sync();assert.equal(f.commands.filter(c=>c.action==='review_task').length,1);assert.equal(f.calls,2);
});
test('a review request not accepted by the server reuses its saved id, never regenerates',async t=>{
 const f=fixture(t);await f.generate();f.commit();let attempted;
 await f.sync({command:async body=>{if(body.action==='review_task'){attempted=body;throw Error('not accepted');}await f.options.command(body);}});
 await f.sync({command:async body=>{if(body.action==='review_task')assert.equal(body.id,attempted.id);await f.options.command(body);}});
 assert.equal(f.calls,2);assert.equal(readLedger(f.options.root,date).independent_review.verified,true);
});
test('paused task board blocks review even with complete and committed provider outputs',async t=>{
 const f=fixture(t);await f.generate();f.commit();
 await f.sync({snapshot:async()=>({available:true,...f.state,manual:{global:true}})});
 assert.equal(f.commands.filter(c=>c.action==='review_task').length,0);assert.equal(f.calls,2);
});
