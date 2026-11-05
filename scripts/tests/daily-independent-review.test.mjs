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

test('owner-authorized Qianwen reviews Doubao and Grok in its existing fourth call without self-review',async t=>{
 const {dailyReviewPromptsForSeat,materializeAllDailyReviews,syncAllDailyReviews,recordAllDailyReviewReadbacks}=await import('../lib/daily-independent-review.mjs');
 const {syncReviewedSeats}=await import('../lib/daily-task-board.mjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qwen-multi-review-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const agents=['deepseek','doubao','grok','qianwen'];let state=seedTasks({ran_at:new Date(now).toISOString(),agents:{}},now),calls=0;const commands=[],remote=new Map();
 const options={root,date,now,runKey:'run:multi',sourceCommit:'source-sha',agents,snapshot:async()=>({available:true,...structuredClone(state)}),command:async body=>{commands.push(body);state=control(state,{...body,reason:'test'},'qianwen',{targets:agents.map(name=>({name})),baseline_concurrency:1},now).state;},readRemote:async file=>{if(!remote.has(file))throw Error('not_committed');return remote.get(file);}};
 await prepareDailyBoard(options);
 const generate=async(agent,output)=>runReservedSeat({...options,agent,call:async()=>{calls++;return {ok:true,status:'success',output,finish_reason:'stop',model:agent==='qianwen'?'qwen-max':agent+'-native',model_source:'provider_response'};}});
 await generate('deepseek','Own public draft【交付结束】');
 const dp=dailyReviewPromptsForSeat(options,'doubao'),dh=readLedger(root,date).seats.deepseek.artifact.sha256;assert.match(dp,/DeepSeek|deepseek/);
 await generate('doubao','【日课独立审核JSON】\n```json\n'+JSON.stringify({accepted:true,artifact_sha256:dh,reasons:['Bound draft'],unverified:['No deployment']})+'\n```\n【日课独立审核结束】\n【交付结束】');
 await generate('grok','A public measurable suggestion【交付结束】');
 const qp=dailyReviewPromptsForSeat(options,'qianwen');assert.match(qp,/日课独立审核JSON:doubao/);assert.match(qp,/日课独立审核JSON:grok/);assert.doesNotMatch(qp,/日课独立审核JSON:qianwen/);
 const ledger=readLedger(root,date),blocks=['doubao','grok'].map(w=>'【日课独立审核JSON:'+w+'】\n```json\n'+JSON.stringify({accepted:w==='doubao',artifact_sha256:ledger.seats[w].artifact.sha256,reasons:[w==='doubao'?'The supplied draft is scoped':'Suggested claim lacks supplied evidence'],unverified:['No deployment']})+'\n```\n【日课独立审核结束:'+w+'】');
 await generate('qianwen','【读后感】读了当日记忆。\n【观】观察到两条待审工件。\n【行深】逐项核对工件哈希。\n【派单监督】逐项审阅已提供工件，未执行命令。\n'+blocks.join('\n')+'\n【交付结束】');
 materializeAllDailyReviews(options);
 const commit=()=>{const visit=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())visit(f);else remote.set(path.relative(root,f).split(path.sep).join('/'),fs.readFileSync(f));}};visit(root);};
 commit();await syncDailyBoard(options);await syncAllDailyReviews(options);await syncReviewedSeats(options);const result=recordAllDailyReviewReadbacks(options);
 assert.equal(calls,4);assert.equal(commands.filter(c=>c.action==='review_task').length,3);
 assert.equal(result.seats.deepseek.status,'completed_draft_review');assert.equal(result.seats.doubao.status,'completed_draft_review');assert.equal(result.seats.grok.status,'rejected_draft_review');
 assert.equal(commands.find(c=>c.action==='review_task'&&c.worker_actual_provider==='grok').task_id,ledger.seats.grok.assignment.id);
 assert.equal(result.seats.qianwen.status,'submitted_pending_review');assert.equal(result.seats.qianwen.accepted,false);assert.equal(result.independent_reviews.doubao.verified,true);assert.equal(result.independent_reviews.grok.verified,true);
 for(const c of commands.filter(c=>c.action==='review_task'&&c.agent==='qianwen')){assert.notEqual(c.worker_actual_provider,c.reviewer_actual_provider);assert.equal(c.scope,'engineering_draft_only');}
 await syncAllDailyReviews(options);await syncReviewedSeats(options);assert.equal(commands.filter(c=>c.action==='review_task').length,3);assert.equal(calls,4);
});

test('unregistered and self-review pairs are rejected before evidence or provider IO',()=>{
 assert.throws(()=>dailyReviewPrompt({root:'not-read',date,runKey:'x',workerAgent:'qianwen',reviewerAgent:'qianwen'}),/self_review/);
 assert.throws(()=>dailyReviewPrompt({root:'not-read',date,runKey:'x',workerAgent:'grok',reviewerAgent:'grok'}),/self_review/);
});

test('actual sync CLI wires the new review functions and stays read-only for an absent ledger',async t=>{
 const {spawnSync}=await import('node:child_process');const root=fs.mkdtempSync(path.join(os.tmpdir(),'review-sync-cli-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const r=spawnSync(process.execPath,[path.resolve('scripts/daily-task-board.mjs'),'sync'],{cwd:root,env:{PATH:process.env.PATH,DAILY_DATE:date},encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/"model_calls":0/);assert.equal(fs.readdirSync(root).length,0);
});
