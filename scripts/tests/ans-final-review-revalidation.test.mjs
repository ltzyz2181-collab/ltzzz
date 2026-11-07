// ANS P1-01 行为回归：已绑定最终评审的席位，在重新核验失败时
// 必须把「历史结论」与「当前核验状态」分开：瞬时不可用只标注待核、保留历史结论；
// 真实证据冲突则明确降级。两者都不得触发新的提交/生成/资金动作。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareDailyBoard,runReservedSeat,syncDailyBoard,readLedger,digest,hasUnverifiedBoard} from '../lib/daily-task-board.mjs';
import {taskCommand,seedTasks} from '../../workers/pulse-worker/tasks.js';
import {control as pulseControl} from '../../workers/pulse-worker/engine.js';

const date='2026-10-16',now=Date.parse(date+'T03:00:00Z'),agent='deepseek';
const verdictFor=(seat,patch={})=>({accepted:true,artifact_sha256:seat.artifact.sha256,task_id:seat.assignment.id,date,run_key:'run:1',source_commit:'source-sha',actual_provider:'doubao',...patch});

function plateau(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ans-reval-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 let state=seedTasks({ran_at:new Date(now).toISOString(),agents:{}},now),posts=0,calls=0,remote=new Map();
 const options={root,date,runKey:'run:1',sourceCommit:'source-sha',agents:[agent],now,
  snapshot:async()=>({available:true,...structuredClone(state)}),
  command:async body=>{posts++;state=pulseControl(state,{...body,id:body.id||'fixture-preclaim',reason:'No-funds test'},'qianwen',{targets:[{name:agent}],baseline_concurrency:1},now).state;},
  readRemote:async file=>{if(!remote.has(file))throw Error('not_committed');return remote.get(file);}};
 const generate=extra=>runReservedSeat({...options,agent,call:async()=>{calls++;return {ok:true,output:'Verified assertion draft【交付结束】',finish_reason:'stop',model:'actual-model',model_source:'provider_response',tokens_used:12,...extra};}});
 const commit=()=>{const a=readLedger(root,date).seats[agent].artifact;remote.set(a.path,fs.readFileSync(path.join(root,a.path)))};
 return {root,options,remote,generate,commit,
  get state(){return state},set state(v){state=v},
  get posts(){return posts},get calls(){return calls},
  seat:()=>readLedger(root,date).seats[agent],
  record:()=>readLedger(root,date)};
}

async function reachFinal(t,{accepted=true}={}){
 const f=plateau(t);
 await prepareDailyBoard(f.options);await f.generate();f.commit();await syncDailyBoard(f.options);
 const seat=f.seat();
 const reviewPath='knowledge/results/ans-reval-review.json';
 const reviewBytes=Buffer.from(JSON.stringify(verdictFor(seat,{accepted})));
 f.remote.set(reviewPath,reviewBytes);
 const reviewed=taskCommand(f.state,{action:'review_task',task_id:seat.assignment.id,agent:'doubao',accepted,reviewed_sha256:seat.artifact.sha256,scope:'engineering_draft_only',worker_actual_provider:'deepseek',reviewer_actual_provider:'doubao',review_evidence_path:reviewPath,review_evidence_sha256:digest(reviewBytes)},'qianwen',[agent,'doubao'],now).state;
 const sync=snap=>syncDailyBoard({...f.options,snapshot:async()=>({available:true,...structuredClone(snap??reviewed)})});
 await sync();
 f.state=reviewed;
 await sync();
 return {f,reviewed,reviewPath,reviewBytes,sync};
}

test('accepted final seat survives transient remote unavailability without losing its historical decision',async t=>{
 const {f,reviewed,sync}=await reachFinal(t);
 const before=f.seat();assert.equal(before.status,'completed_draft_review');assert.equal(before.review_verified,true);assert.equal(before.accepted,true);
 assert.equal(hasUnverifiedBoard(f.record()),false);
 const posts=f.posts,calls=f.calls;
 f.remote.delete(before.artifact.path);
 await sync(reviewed);
 const after=f.seat();
 assert.equal(after.status,'completed_draft_review');
 assert.equal(after.review_verified,true);
 assert.equal(after.accepted,true);
 assert.equal(after.review_receipt.evidence_sha256,before.review_receipt.evidence_sha256);
 assert.equal(after.revalidation,'unavailable');
 assert.equal(after.sync_reason,'final_review_revalidation_unavailable');
 // 不得把无法重新核验伪装成当前 fresh
 assert.equal(hasUnverifiedBoard(f.record()),true);
 assert.equal(f.posts,posts);assert.equal(f.calls,calls);
});

test('rejected final seat keeps its rejection reason when revalidation is unavailable',async t=>{
 const {f,reviewed,sync}=await reachFinal(t,{accepted:false});
 const before=f.seat();
 assert.equal(before.status,'rejected_draft_review');assert.equal(before.accepted,false);assert.equal(before.review_verified,true);
 const posts=f.posts,calls=f.calls;
 f.remote.delete(before.artifact.path);
 await sync(reviewed);
 const after=f.seat();
 assert.equal(after.status,'rejected_draft_review');
 assert.equal(after.accepted,false);
 assert.equal(after.review_verified,true);
 assert.equal(after.revalidation,'unavailable');
 assert.equal(hasUnverifiedBoard(f.record()),true);
 assert.equal(f.posts,posts);assert.equal(f.calls,calls);
});

test('stale snapshot during final revalidation is unavailable, not a conflict',async t=>{
 const {f,sync}=await reachFinal(t);
 const before=f.seat();const posts=f.posts,calls=f.calls;
 const stale={available:true,...structuredClone(f.state),ran_at:new Date(now-3600000).toISOString()};
 await sync(stale);
 const after=f.seat();
 assert.equal(after.status,'completed_draft_review');
 assert.equal(after.accepted,true);
 assert.equal(after.revalidation,'unavailable');
 assert.equal(after.sync_reason,'final_review_revalidation_unavailable');
 assert.equal(f.posts,posts);assert.equal(f.calls,calls);
});

test('remote work artifact hash conflict degrades explicitly and keeps the old receipt',async t=>{
 const {f,sync}=await reachFinal(t);
 const before=f.seat();const posts=f.posts,calls=f.calls;
 f.remote.set(before.artifact.path,Buffer.from('{"tampered":true}'));
 await sync();
 const after=f.seat();
 assert.equal(after.status,'review_unknown');
 assert.equal(after.review_verified,false);
 assert.equal(after.accepted,false);
 assert.equal(after.review_conflict,true);
 assert.equal(after.revalidation,'conflict');
 assert.match(after.sync_reason,/^final_review_evidence_conflict:/);
 assert.equal(after.review_receipt.evidence_sha256,before.review_receipt.evidence_sha256);
 assert.equal(f.posts,posts);assert.equal(f.calls,calls);
});

test('review evidence hash conflict is a conflict path, never a network-style swallow',async t=>{
 const {f,sync,reviewPath}=await reachFinal(t);
 const before=f.seat();const posts=f.posts,calls=f.calls;
 f.remote.set(reviewPath,Buffer.from('{"accepted":true}'));
 await sync();
 const after=f.seat();
 assert.equal(after.status,'review_unknown');
 assert.equal(after.review_conflict,true);
 assert.equal(after.revalidation,'conflict');
 assert.equal(after.sync_reason,'final_review_evidence_conflict:review_artifact_hash_mismatch');
 assert.equal(f.posts,posts);assert.equal(f.calls,calls);
});

test('review verdict semantic conflict is distinguished from unavailability',async t=>{
 const {f,sync,reviewPath}=await reachFinal(t);
 const before=f.seat();const posts=f.posts,calls=f.calls;
 const flipped=Buffer.from(JSON.stringify(verdictFor(before,{accepted:false})));
 f.remote.set(reviewPath,flipped);
 const reviewedFlip={...f.state,task_board:f.state.task_board.map(task=>task.id===before.assignment.id?{...task,review:{...task.review,evidence_sha256:digest(flipped),accepted:false}}:task)};
 await sync(reviewedFlip);
 const after=f.seat();
 assert.equal(after.status,'review_unknown');
 assert.equal(after.review_conflict,true);
 assert.equal(after.sync_reason,'final_review_evidence_conflict:review_artifact_semantic_mismatch');
 assert.equal(f.posts,posts);assert.equal(f.calls,calls);
});

test('task/seat semantic conflict degrades instead of deferring',async t=>{
 const {f,sync}=await reachFinal(t);
 const before=f.seat();const posts=f.posts,calls=f.calls;
 const hijacked={...f.state,task_board:f.state.task_board.map(task=>task.id===before.assignment.id?{...task,claimed_by:'grok'}:task)};
 await sync(hijacked);
 const after=f.seat();
 assert.equal(after.status,'review_unknown');
 assert.equal(after.review_conflict,true);
 assert.equal(after.sync_reason,'final_review_evidence_conflict:board_conflict');
 assert.equal(f.posts,posts);assert.equal(f.calls,calls);
});

test('restored remote returns to verified state idempotently and repeated sync stays stable',async t=>{
 const {f,sync}=await reachFinal(t);
 const before=f.seat();const posts=f.posts,calls=f.calls,receipt=before.review_receipt.evidence_sha256;
 f.remote.delete(before.artifact.path);
 await sync();
 assert.equal(f.seat().revalidation,'unavailable');
 f.remote.set(before.artifact.path,fs.readFileSync(path.join(f.root,before.artifact.path)));
 await sync();await sync();
 const after=f.seat();
 assert.equal(after.status,'completed_draft_review');
 assert.equal(after.review_verified,true);
 assert.equal(after.accepted,true);
 assert.equal(after.revalidation,'verified');
 assert.equal(after.sync_reason,'final_review_revalidated_stable');
 assert.equal(after.review_receipt.evidence_sha256,receipt);
 assert.equal(hasUnverifiedBoard(f.record()),false);
 assert.equal(f.posts,posts);assert.equal(f.calls,calls);
});
