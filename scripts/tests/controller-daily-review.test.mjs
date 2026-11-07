import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {publishControllerDailyReview} from '../lib/controller-daily-review.mjs';
import {assignDailyReviewers} from '../lib/daily-review-assignment.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(){
 const date='2026-11-06',task_id='DAILY-'+date+'-qianwen',source_commit='a'.repeat(40),run_key='123:1';
 const worker=Buffer.from(JSON.stringify({actual_provider:'qianwen',actual_model:'qwen-max',model_source:'provider_response',finish_reason:'stop',output:'actual output',integrity:{status:'structurally_complete'},execution:{executed_by:'qianwen',actual_model:'qwen-max',model_source:'provider_response',generation_verified:true,task_id}}));
 const artifact={path:'knowledge/results/daily-board/artifacts/worker.json',sha256:hash(worker)};
 const verdict={actual_provider:'gpt',actual_provider_company:'OpenAI',actual_model:null,reviewer_kind:'current_Codex_AI_controller',native_API_generation:false,task_id,artifact_sha256:artifact.sha256,date,source_commit,run_key,accepted:false,reasons:['Unsupported global assurance is not an execution receipt.']};
 const raw=Buffer.from(JSON.stringify(verdict)),reviewRef={path:`knowledge/results/daily-board/reviews/${date}-qianwen-${hash(raw)}.json`,sha256:hash(raw)};
 const record={date,source_commit,run_key,seats:{qianwen:{claim_verified:true,submission_verified:true,assignment:{id:task_id},artifact}}};
 let current={id:task_id,date,claimed_by:'qianwen',evidence_path:artifact.path,evidence_sha256:artifact.sha256,status:'submitted_pending_review'},calls=0,reservation=null;
 const opts={record,reviewRef,read:async p=>p===artifact.path?worker:raw,observe:async()=>current,latch:{read:async()=>reservation,compareAndSwap:async(k,p,s)=>{if(reservation)return false;reservation={state:s};return true;}},command:async c=>{calls++;current={...current,status:c.accepted?'completed_draft_review':'rejected_draft_review',review:{scope:c.scope,worker_actual_provider:c.worker_actual_provider,reviewer_actual_provider:c.reviewer_actual_provider,accepted:c.accepted,reviewed_sha256:c.reviewed_sha256,evidence_path:c.review_evidence_path,evidence_sha256:c.review_evidence_sha256}};}};
 return {opts,calls:()=>calls,setCurrent:v=>{current=v;},getCurrent:()=>current};
}
test('actual GPT review is published once and reconciled without buying a native API call',async()=>{
 const f=fixture();assert.equal((await publishControllerDailyReview(f.opts)).status,'review_recorded_verified');assert.equal((await publishControllerDailyReview(f.opts)).status,'review_existing_verified');assert.equal(f.calls(),1);
});
test('lost POST result with durable reservation never causes another review POST',async()=>{
 const f=fixture();let calls=0;f.opts.command=async()=>{calls++;throw Error('transport');};
 assert.equal((await publishControllerDailyReview(f.opts)).status,'review_publication_unknown_no_retry');await publishControllerDailyReview(f.opts);assert.equal(calls,1);
});
test('another final review and altered hashes are preserved or rejected before publication',async()=>{
 const f=fixture();f.setCurrent({...f.getCurrent(),status:'completed_draft_review',review:{}});await assert.rejects(()=>publishControllerDailyReview(f.opts),/another_final_review_preserved/);assert.equal(f.calls(),0);
 const g=fixture();g.opts.read=async()=>Buffer.from('tampered');await assert.rejects(()=>publishControllerDailyReview(g.opts),/review_bytes_not_bound/);assert.equal(g.calls(),0);
});
test('every seat has an explicit route or review_unassigned; planned bindings do not confer acceptance',()=>{
 const r={date:'2026-11-06',seats:Object.fromEntries(['deepseek','doubao','grok','qianwen','unknown'].map(agent=>[agent,{assignment:{id:'TASK-'+agent},artifact:{path:'x',sha256:'a'.repeat(64)},accepted:agent==='unknown'}]))};assignDailyReviewers(r);
 assert.equal(r.seats.qianwen.review_assignment.reviewer,'gpt');assert.equal(r.seats.qianwen.review_assignment.native_fallback,'deepseek');assert.equal(r.seats.qianwen.review_assignment.reviewer_execution_verified,false);assert.equal(r.seats.unknown.review_assignment.status,'review_unassigned');assert.equal(r.seats.unknown.status,'review_unassigned');assert.equal(r.seats.unknown.review_verified,false);assert.equal(r.seats.unknown.accepted,false);
});
