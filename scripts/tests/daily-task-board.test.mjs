import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareDailyBoard,runReservedSeat,syncDailyBoard,readLedger,saveLedger,hasUnverifiedBoard} from '../lib/daily-task-board.mjs';
import {taskCommand,seedTasks} from '../../workers/pulse-worker/tasks.js';
import {control as pulseControl} from '../../workers/pulse-worker/engine.js';
import {spawnSync} from 'node:child_process';
import {recoverArtifact} from '../lib/daily-task-board.mjs';
const date='2026-10-16',now=Date.parse(date+'T03:00:00Z'),agent='deepseek';
function fixture(t,agent='deepseek'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'daily-board-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 let state=seedTasks({ran_at:new Date(now).toISOString(),agents:{}},now),posts=0,calls=0,remote=new Map();
 const options={root,date,runKey:'run:1',sourceCommit:'source-sha',agents:[agent],now,
  snapshot:async()=>({available:true,...structuredClone(state)}),
  command:async body=>{posts++;state=pulseControl(state,{...body,id:body.id||'fixture-preclaim',reason:'No-funds test'},'qianwen',{targets:[{name:agent}],baseline_concurrency:1},now).state;},
  readRemote:async file=>{if(!remote.has(file))throw Error('not_committed');return remote.get(file);}};
 const generate=extra=>runReservedSeat({...options,agent,call:async()=>{calls++;return {ok:true,output:'Verified assertion draft【交付结束】',finish_reason:'stop',model:'actual-model',model_source:'provider_response',tokens_used:12,...extra};}});
 const commit=()=>{const a=readLedger(root,date).seats[agent].artifact;remote.set(a.path,fs.readFileSync(path.join(root,a.path)));};
 return {options,generate,commit,get state(){return state},get posts(){return posts},get calls(){return calls},remote};
}
const verdictFor=(seat,patch={})=>({accepted:true,artifact_sha256:seat.artifact.sha256,task_id:seat.assignment.id,date,run_key:'run:1',source_commit:'source-sha',actual_provider:'doubao',...patch});
test('missing qianwen section reconciles the claimed task as failure without another generation',async t=>{
 const f=fixture(t,'qianwen');await prepareDailyBoard(f.options);await f.generate();
 assert.equal(readLedger(f.options.root,date).seats.qianwen.status,'missing_required_section');
 assert.equal(hasUnverifiedBoard(readLedger(f.options.root,date)),true);
 f.commit();await syncDailyBoard(f.options);const seat=readLedger(f.options.root,date).seats.qianwen;
 assert.equal(seat.status,'failed_no_repurchase');assert.equal(seat.failure_verified,true);
 assert.equal(seat.integrity.status,'missing_required_section');assert.equal(seat.accepted,false);
 assert.equal(f.state.task_board.find(task=>task.id===seat.assignment.id).status,'failed_no_repurchase');
 await f.generate();assert.equal(f.calls,1);assert.equal(hasUnverifiedBoard(readLedger(f.options.root,date)),false);
});
test('a legacy submitted artifact missing supervision reports validation failure without replay or rewriting evidence',async t=>{
 const f=fixture(t,'qianwen');await prepareDailyBoard(f.options);
 await f.generate({output:'【派单监督】\n责任席：千问；未核查。\n【交付结束】'});
 const record=readLedger(f.options.root,date),seat=record.seats.qianwen;
 const body=JSON.parse(fs.readFileSync(path.join(f.options.root,seat.artifact.path)));
 body.output='【观】旧日课未交监督段。\n【交付结束】';delete body.required_sections;
 const bytes=Buffer.from(JSON.stringify(body,null,2)+'\n'),hash=(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
 seat.artifact={path:`knowledge/results/daily-board/artifacts/${date}-qianwen-${hash}.json`,sha256:hash};
 fs.writeFileSync(path.join(f.options.root,seat.artifact.path),bytes);seat.status='sync_unknown';saveLedger(f.options.root,record);
 let remoteReads=0;const posts=f.posts;
 await syncDailyBoard({...f.options,readRemote:async()=>{remoteReads++;return bytes;}});
 const after=readLedger(f.options.root,date).seats.qianwen;
 assert.equal(after.status,'sync_unknown');assert.equal(after.sync_reason,'artifact_delivery_missing_required_section');
 assert.equal(after.submission_verified,false);assert.equal(after.accepted,false);assert.equal(remoteReads,0);assert.equal(f.posts,posts);
 assert.deepEqual(fs.readFileSync(path.join(f.options.root,seat.artifact.path)),bytes);
 await f.generate();assert.equal(f.calls,1);
});
test('a real inline section crosses generation and submission gates without becoming accepted',async t=>{
 const f=fixture(t,'qianwen');await prepareDailyBoard(f.options);
 await f.generate({output:'【派单监督】责任席：千问；未核查。\n【交付结束】'});f.commit();await syncDailyBoard(f.options);
 const seat=readLedger(f.options.root,date).seats.qianwen;
 assert.equal(seat.status,'submitted_pending_review');assert.equal(seat.accepted,false);assert.equal(f.calls,1);
});
test('required supervision failure is persisted and never buys a second daily call',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'required-daily-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 saveLedger(root,{date,run_key:'run:1',source_commit:'fixture',seats:{qianwen:{status:'reserved'}},paid:false,tx_hash:null});
 let calls=0;const options={root,date,runKey:'run:1',agent:'qianwen',call:async()=>{calls++;return {ok:true,output:'普通读后感\n【交付结束】',finish_reason:'stop'};}};
 await runReservedSeat(options);const seat=readLedger(root,date).seats.qianwen;
 assert.equal(seat.status,'missing_required_section');assert.equal(seat.integrity.status,'missing_required_section');
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,seat.artifact.path))).status,'incomplete_or_failed');
 assert.equal((await runReservedSeat(options)).status,'blocked_no_repurchase');assert.equal(calls,1);
});
test('real SIGKILL after immutable artifact write recovers and submits the exact output without a provider replay',async t=>{
 const f=fixture(t);await prepareDailyBoard(f.options);const root=f.options.root;
 const moduleURL=new URL('../lib/daily-task-board.mjs',import.meta.url).href;
 const child=`import fs from 'node:fs';import path from 'node:path';import {runReservedSeat} from ${JSON.stringify(moduleURL)};
 const root=process.env.ANS_CRASH_FIXTURE_ROOT,original=fs.writeFileSync;
 fs.writeFileSync=function(file,...args){const result=original.call(this,file,...args);if(String(file).includes('/artifacts/'))process.kill(process.pid,'SIGKILL');return result;};
 await runReservedSeat({root,date:${JSON.stringify(date)},runKey:'run:1',agent:'deepseek',call:async()=>{fs.writeFileSync(path.join(root,'fixture-provider-calls'),'1');return {ok:true,output:'Fixture evidence only【交付结束】',finish_reason:'stop',model:'synthetic-fixture',model_source:'provider_response'};}});`;
 const killed=spawnSync(process.execPath,['--input-type=module','-e',child],{env:{PATH:process.env.PATH,ANS_CRASH_FIXTURE_ROOT:root},encoding:'utf8',timeout:10000});
 assert.equal(killed.signal,'SIGKILL',killed.stderr);
 const after=readLedger(root,date),seat=after.seats.deepseek;assert.equal(seat.status,'generation_started');assert.equal(seat.artifact,undefined);
 assert.equal(recoverArtifact(root,after,'deepseek',seat),true);assert.equal(seat.status,'generated_pending_sync');
 assert.equal(fs.readFileSync(path.join(root,'fixture-provider-calls'),'utf8'),'1');
 f.commit();await syncDailyBoard(f.options);assert.equal(readLedger(root,date).seats.deepseek.status,'submitted_pending_review');assert.equal(f.posts,2);
 assert.equal((await runReservedSeat({root,date,runKey:'run:1',agent:'deepseek',call:()=>{throw Error('provider_must_not_be_replayed');}})).status,'blocked_no_repurchase');
 console.log(JSON.stringify({test:'SIGKILL_after_immutable_write_before_ledger_pointer',signal:killed.signal,recovered:true,sync_status:readLedger(root,date).seats.deepseek.status,fixture_provider_calls:1,native_model_calls:0,financial_execution:false}));
});
test('failed provider attempt is hash-bound terminal board feedback; lost response reconciles and cannot buy again',async t=>{
 const f=fixture(t);await prepareDailyBoard(f.options);await f.generate({ok:false,status:'provider_transport_unknown',output:'',finish_reason:null});f.commit();
 await syncDailyBoard({...f.options,command:async body=>{await f.options.command(body);throw Error('lost response');}});
 assert.equal(readLedger(f.options.root,date).seats[agent].status,'failure_sync_unknown');
 await syncDailyBoard(f.options);const seat=readLedger(f.options.root,date).seats[agent];assert.equal(seat.status,'failed_no_repurchase');assert.equal(seat.failure_verified,true);
 assert.equal(f.state.task_board.find(task=>task.id===seat.assignment.id).failure.evidence_sha256,seat.artifact.sha256);assert.equal(seat.accepted,false);await f.generate();assert.equal(f.calls,1);assert.equal(f.posts,2);
});
test('uncommitted failed output cannot finalize the live task, and tomorrow has a distinct task',async t=>{
 const f=fixture(t);await prepareDailyBoard(f.options);await f.generate({finish_reason:'length'});await syncDailyBoard(f.options);assert.equal(f.posts,1);assert.equal(readLedger(f.options.root,date).seats[agent].status,'failure_sync_unknown');
 f.commit();await syncDailyBoard(f.options);const next=seedTasks(f.state,now+86400000);assert.equal(next.task_board.find(task=>task.id==='DAILY-2026-10-17-deepseek').status,'assigned');assert.equal(next.task_board.find(task=>task.id==='DAILY-2026-10-16-deepseek').status,'failed_no_repurchase');
});
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
 const f=fixture(t);await f.options.command({action:'claim_task',agent,task_id:`DAILY-${date}-${agent}`});await prepareDailyBoard(f.options);await f.generate();assert.equal(f.calls,0);
});
test('empty, truncated, unknown finish and out-of-scope output persist but are not submitted',async t=>{
 for(const extra of [{output:''},{finish_reason:'length'},{finish_reason:null},{output:'SPEND_PROPOSAL: pay【交付结束】'},{ok:false,status:'not_configured'}]){
  const f=fixture(t);await prepareDailyBoard(f.options);await f.generate(extra);f.commit();await syncDailyBoard(f.options);assert.equal(f.posts,2);assert.equal(readLedger(f.options.root,date).seats[agent].status,'failed_no_repurchase');assert.equal(readLedger(f.options.root,date).seats[agent].failure_verified,true);await f.generate();assert.equal(f.calls,1);
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

test('previous-day board state is never accepted as this day claim',async t=>{
 const f=fixture(t);f.state.task_board.find(task=>task.id===`DAILY-${date}-${agent}`).date='2026-10-15';
 await prepareDailyBoard(f.options);await f.generate();assert.equal(f.calls,0);assert.equal(f.posts,0);
});
test('lost claim response recovers only the persisted request and event, never another claimant',async t=>{
 const f=fixture(t);let reads=0;
 await prepareDailyBoard({...f.options,command:async body=>{await f.options.command(body);throw Error('response lost');},snapshot:async()=>++reads===2?{available:false}:f.options.snapshot()});
 assert.equal(readLedger(f.options.root,date).seats[agent].claim_verified,false);
 await prepareDailyBoard(f.options);await f.generate();assert.equal(f.posts,1);assert.equal(f.calls,1);
 const g=fixture(t);await prepareDailyBoard({...g.options,command:async()=>{throw Error('not accepted');}});
 await prepareDailyBoard(g.options);await g.generate();assert.equal(g.calls,0);assert.equal(g.posts,0);
});
test('missing request event cannot turn a same-seat declaration into a verified claim',async t=>{
 const f=fixture(t);await prepareDailyBoard({...f.options,command:async body=>{await f.options.command(body);f.state.events=[];}});
 await f.generate();assert.equal(f.calls,0);assert.equal(readLedger(f.options.root,date).seats[agent].claim_verified,false);
});
test('submit timeout before acceptance retries the same immutable submission without another model',async t=>{
 const f=fixture(t);await prepareDailyBoard(f.options);await f.generate();f.commit();let attempted;
 await syncDailyBoard({...f.options,command:async body=>{attempted=body;throw Error('not accepted');}});
 const retained=readLedger(f.options.root,date).seats[agent].artifact;
 await syncDailyBoard({...f.options,command:async body=>{assert.equal(body.id,attempted.id);await f.options.command(body);}});
 assert.deepEqual(readLedger(f.options.root,date).seats[agent].artifact,retained);assert.equal(f.calls,1);assert.equal(f.posts,2);
});
test('orphan immutable artifact recovery is read-only and cannot regenerate',async t=>{
 const f=fixture(t);await prepareDailyBoard(f.options);await f.generate();f.commit();
 const record=readLedger(f.options.root,date);delete record.seats[agent].artifact;record.seats[agent].status='generation_started';saveLedger(f.options.root,record);
 await syncDailyBoard(f.options);await f.generate();const seat=readLedger(f.options.root,date).seats[agent];
 assert.equal(seat.status,'submitted_pending_review');assert.equal(seat.recovery,'immutable_artifact_verified_no_model_replay');assert.equal(f.calls,1);
});
test('artifact date and run key are bound even when attacker recomputes the file hash',async t=>{
 for(const field of ['date','run_key']){
  const f=fixture(t);await prepareDailyBoard(f.options);await f.generate();
  const record=readLedger(f.options.root,date),seat=record.seats[agent],body=JSON.parse(fs.readFileSync(path.join(f.options.root,seat.artifact.path)));
  body[field]='other';const bytes=Buffer.from(JSON.stringify(body));const {digest}=await import('../lib/daily-task-board.mjs');const hash=digest(bytes);
  seat.artifact={path:`knowledge/results/daily-board/artifacts/${date}-${agent}-${hash}.json`,sha256:hash};fs.writeFileSync(path.join(f.options.root,seat.artifact.path),bytes);saveLedger(f.options.root,record);f.commit();
  await syncDailyBoard(f.options);assert.equal(f.posts,1);assert.equal(readLedger(f.options.root,date).seats[agent].status,'sync_unknown');
 }
});
test('independent remote review verifies exact reviewer bytes and bound worker hash, never deployment',async t=>{
 const f=fixture(t);await prepareDailyBoard(f.options);await f.generate();f.commit();await syncDailyBoard(f.options);
 const seat=readLedger(f.options.root,date).seats[agent];const reviewBytes=Buffer.from(JSON.stringify(verdictFor(seat)));
 const {digest}=await import('../lib/daily-task-board.mjs');const reviewPath='knowledge/results/reviewer.json';f.remote.set(reviewPath,reviewBytes);
 const reviewed=taskCommand(f.state,{action:'review_task',task_id:seat.assignment.id,agent:'doubao',accepted:true,reviewed_sha256:seat.artifact.sha256,scope:'engineering_draft_only',worker_actual_provider:'deepseek',reviewer_actual_provider:'doubao',review_evidence_path:reviewPath,review_evidence_sha256:digest(reviewBytes)},'qianwen',[agent,'doubao'],now).state;
 await syncDailyBoard({...f.options,snapshot:async()=>({available:true,...reviewed})});
 const final=readLedger(f.options.root,date).seats[agent];assert.equal(final.status,'completed_draft_review');assert.equal(final.review_verified,true);assert.equal(final.deployed,false);assert.equal(f.calls,1);
 f.remote.set(reviewPath,Buffer.from('{}'));await syncDailyBoard({...f.options,snapshot:async()=>({available:true,...reviewed})});
 assert.equal(readLedger(f.options.root,date).seats[agent].status,'review_unknown');assert.equal(readLedger(f.options.root,date).seats[agent].review_verified,false);
});
test('another ANS chain cannot complete the daily artifact merely by sharing the logical worker',async t=>{
 const f=fixture(t);await prepareDailyBoard(f.options);await f.generate();f.commit();await syncDailyBoard(f.options);
 const seat=readLedger(f.options.root,date).seats[agent],task=f.state.task_board.find(task=>task.id===seat.assignment.id);
 task.status='completed_draft_review';task.evidence_path='knowledge/results/ans-cycle/2026-10-16-worker.json';task.evidence_sha256='b'.repeat(64);
 await syncDailyBoard(f.options);assert.equal(readLedger(f.options.root,date).seats[agent].status,'sync_unknown');assert.equal(f.calls,1);
});

test('duplicate submission hash with another path is rejected by the live state machine',async t=>{
 const f=fixture(t);await prepareDailyBoard(f.options);await f.generate();f.commit();await syncDailyBoard(f.options);
 const seat=readLedger(f.options.root,date).seats[agent];
 await assert.rejects(f.options.command({id:'path-swap',action:'submit_task',agent,task_id:seat.assignment.id,evidence_path:'data/memory/deepseek.json',evidence_sha256:seat.artifact.sha256}));
 await assert.rejects(f.options.command({id:'allowed-path-swap',action:'submit_task',agent,task_id:seat.assignment.id,evidence_path:'knowledge/results/other.json',evidence_sha256:seat.artifact.sha256}));
 assert.equal(f.state.task_board.find(task=>task.id===seat.assignment.id).evidence_path,seat.artifact.path);
});

test('review bytes with valid hash but wrong task, worker hash, acceptance or provider cannot complete',async t=>{
 for(const patch of [{task_id:'another-task'},{artifact_sha256:'c'.repeat(64)},{accepted:false},{actual_provider:'deepseek'},{task_id:undefined},{actual_provider:undefined},{date:undefined},{run_key:undefined},{source_commit:undefined},{run_key:'other:1'}]){
  const f=fixture(t);await prepareDailyBoard(f.options);await f.generate();f.commit();await syncDailyBoard(f.options);
  const seat=readLedger(f.options.root,date).seats[agent],reviewPath='knowledge/results/semantic-review.json';
  const bytes=Buffer.from(JSON.stringify(verdictFor(seat,patch)));
  const {digest}=await import('../lib/daily-task-board.mjs');f.remote.set(reviewPath,bytes);
  const reviewed=taskCommand(f.state,{action:'review_task',task_id:seat.assignment.id,agent:'doubao',accepted:true,reviewed_sha256:seat.artifact.sha256,scope:'engineering_draft_only',worker_actual_provider:'deepseek',reviewer_actual_provider:'doubao',review_evidence_path:reviewPath,review_evidence_sha256:digest(bytes)},'qianwen',[agent,'doubao'],now).state;
  await syncDailyBoard({...f.options,snapshot:async()=>({available:true,...reviewed})});
  const final=readLedger(f.options.root,date).seats[agent];assert.equal(final.status,'review_unknown');assert.equal(final.accepted,false);assert.equal(final.review_verified,false);assert.equal(f.calls,1);
 }
});
test('a new readback failure clears verified flags instead of advertising a previous successful sync',async t=>{
 const f=fixture(t);await prepareDailyBoard(f.options);await f.generate();f.commit();await syncDailyBoard(f.options);
 assert.equal(readLedger(f.options.root,date).seats[agent].submission_verified,true);
 f.remote.clear();await syncDailyBoard(f.options);
 assert.equal(readLedger(f.options.root,date).seats[agent].submission_verified,false);
});

test('independent ANS and formal DAILY claims coexist without adopting each other artifacts',async t=>{
 const f=fixture(t);await f.options.command({id:'independent-ans-claim',action:'claim_task',agent,task_id:`ANS-${date}-${agent}`});
 await prepareDailyBoard(f.options);await f.generate();f.commit();await syncDailyBoard(f.options);
 const seat=readLedger(f.options.root,date).seats[agent];
 assert.equal(seat.assignment.id,`DAILY-${date}-${agent}`);assert.equal(seat.status,'submitted_pending_review');assert.equal(f.calls,1);
 assert.equal(f.state.task_board.find(task=>task.id===`ANS-${date}-${agent}`).status,'claimed');
 assert.equal(f.state.task_board.find(task=>task.id===`DAILY-${date}-${agent}`).evidence_sha256,seat.artifact.sha256);
});
test('generation crash without a unique artifact remains an explicit failure and never repurchases',async t=>{
 const f=fixture(t);await prepareDailyBoard(f.options);
 const record=readLedger(f.options.root,date);record.seats[agent].status='generation_started';saveLedger(f.options.root,record);
 await syncDailyBoard(f.options);await f.generate();const final=readLedger(f.options.root,date);
 assert.equal(final.seats[agent].status,'generation_unknown_no_repurchase');assert.equal(hasUnverifiedBoard(final),true);
 assert.equal(f.calls,0);assert.equal(f.posts,1);assert.equal(final.seats[agent].claim_verified,true);
});

test('CONTROL assignment without an eligible DAILY sibling blocks claim (no model call)', async t => {
  const f = fixture(t);
  // A same-id row owned by another seat is not permission to claim it.
  f.state.task_board.find(task=>task.id===`DAILY-${date}-${agent}`).assigned_to='doubao';
  f.options.control = {
    date,
    dispatch_source: 'actual_model_review',
    dispatches: [{
      agent,
      id: `CONTROL-${date}-${agent}`,
      instruction: 'Fix claim path without buying models',
      status: 'queued',
      execute_on: date,
    }],
  };
  await prepareDailyBoard(f.options);
  const seat = readLedger(f.options.root, date).seats[agent];
  assert.equal(seat.assignment?.id, `CONTROL-${date}-${agent}`);
  assert.equal(seat.claim_verified, false);
  assert.equal(seat.status, 'blocked');
  assert.equal(seat.reason, 'claim_or_snapshot_blocked');
  assert.equal(f.posts, 0);
  assert.equal(f.calls, 0);
});

test('blocked seat without reserved claim cannot repurchase generation', async t => {
  const f = fixture(t);
  f.state.task_board.find(task=>task.id===`DAILY-${date}-${agent}`).status='completed_draft_review';
  f.options.control = {
    date,
    dispatches: [{
      agent,
      id: `CONTROL-${date}-${agent}`,
      instruction: 'Must not spend',
      status: 'queued',
      execute_on: date,
    }],
  };
  await prepareDailyBoard(f.options);
  const out = await f.generate();
  assert.equal(out.ok, false);
  assert.equal(out.status, 'blocked_no_repurchase');
  assert.equal(f.calls, 0);
  const seat = readLedger(f.options.root, date).seats[agent];
  assert.equal(seat.claim_verified, false);
  assert.notEqual(seat.status, 'reserved');
});

test('CONTROL alias claims the authenticated DAILY identity once without generating', async t => {
  const f = fixture(t), sourceId=`CONTROL-${date}-${agent}`;
  f.options.control={date,dispatches:[{agent,id:sourceId,instruction:'Repair handover',status:'queued',execute_on:date}]};
  await prepareDailyBoard(f.options);
  const seat=readLedger(f.options.root,date).seats[agent];
  assert.equal(seat.assignment.id,`DAILY-${date}-${agent}`);
  assert.equal(seat.assignment.source_task_id,sourceId);
  assert.equal(seat.claim_receipt.task_id,seat.assignment.id);
  assert.equal(seat.claim_verified,true);
  assert.equal(f.posts,1);assert.equal(f.calls,0);
  await prepareDailyBoard(f.options);
  assert.equal(f.posts,1);assert.equal(f.calls,0);
});

test('existing blocked CONTROL reservations are not rewritten or repurchased after alias repair', async t => {
  const f = fixture(t), sourceId=`CONTROL-${date}-${agent}`;
  const prior={schema_version:2,date,run_key:'old:1',source_commit:'old-source',seats:{[agent]:{agent,status:'blocked',reason:'claim_or_snapshot_blocked',claim_verified:false,assignment:{id:sourceId,execution_date:date}}},paid:false,tx_hash:null};
  saveLedger(f.options.root,prior);
  f.options.control={date,dispatches:[{agent,id:sourceId,instruction:'Repair handover',status:'queued',execute_on:date}]};
  await prepareDailyBoard(f.options);await f.generate();
  assert.deepEqual(readLedger(f.options.root,date),prior);
  assert.equal(f.posts,0);assert.equal(f.calls,0);
});

test('matching DAILY id on board can still reserve after ANS→DAILY rewrite path', async t => {
  // Default fixture uses baseline ANS→DAILY assignment; seedTasks places DAILY on board.
  const f = fixture(t);
  await prepareDailyBoard(f.options);
  const seat = readLedger(f.options.root, date).seats[agent];
  assert.equal(seat.claim_verified, true);
  assert.equal(seat.status, 'reserved');
  assert.equal(seat.assignment.id, `DAILY-${date}-${agent}`);
  assert.equal(f.posts, 1);
});
