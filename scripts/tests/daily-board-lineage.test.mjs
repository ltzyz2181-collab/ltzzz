import test from 'node:test';
import assert from 'node:assert/strict';
import {projectDailyBoard} from '../lib/daily-board-lineage.mjs';
const date='2026-10-16',id=`DAILY-${date}-deepseek`,hash='a'.repeat(64),artifactPath='knowledge/results/daily-board/artifacts/fixture.json';
function fixture(){
 const result={date,execution_id:'gha-run-attempt-1',tasks:[{agent:'deepseek',status:'success',output_preview:'Actual generation',assignment:{task_id:id,claim_verified:true}}]};
 const seat={assignment:{id,source_task_id:'ANS-2026-10-15-deepseek'},status:'submitted_pending_review',claim_verified:true,claim_receipt:{task_id:id,task_date:date,run_key:'run:1'},artifact:{path:artifactPath,sha256:hash},submission_verified:true,submission_receipt:{task_id:id,evidence_path:artifactPath,evidence_sha256:hash},review_verified:false,accepted:false};
 return {result,record:{date,run_key:'run:1',source_commit:'sha',seats:{deepseek:seat}},seat};
}
test('generation and submission remain pending review, not a completed or deployed task',()=>{
 const {result,record}=fixture(),projected=projectDailyBoard(result,record),task=projected.tasks[0];
 assert.equal(task.status,'success');assert.equal(task.board_lifecycle.board_status,'submitted_pending_review');
 assert.equal(task.board_lifecycle.lifecycle_complete,false);assert.equal(task.board_lifecycle.production_deployment_accepted,false);
 assert.equal(result.tasks[0].board_lifecycle,undefined);
});
test('only exact worker/hash scoped independent review completes the draft chain, never deployment',()=>{
 const {result,record,seat}=fixture();seat.status='completed_draft_review';seat.review_verified=true;seat.accepted=true;seat.review_receipt={task_id:id,reviewed_sha256:hash,scope:'engineering_draft_only'};
 const lifecycle=projectDailyBoard(result,record).tasks[0].board_lifecycle;
 assert.equal(lifecycle.lifecycle_complete,true);assert.equal(lifecycle.draft_accepted,true);assert.equal(lifecycle.deployed,false);assert.equal(lifecycle.paid,false);
 seat.review_receipt.reviewed_sha256='b'.repeat(64);assert.equal(projectDailyBoard(result,record).tasks[0].board_lifecycle.lifecycle_complete,false);
});
test('historical unclaimed output is not upgraded by another date, run or independent ANS chain',()=>{
 for(const mismatch of ['date','run','task']){
  const {result,record}=fixture();result.tasks[0].assignment.claim_verified=false;
  if(mismatch==='date')record.date='2026-10-17';
  if(mismatch==='run')record.run_key='independent-ans:1';
  if(mismatch==='task')record.seats.deepseek.assignment.id='ANS-2026-10-15-deepseek';
  const projected=projectDailyBoard(result,record);
  assert.equal(projected.tasks[0].assignment.claim_verified,false);assert.equal(projected.tasks[0].board_lifecycle,undefined);
 }
});
test('missing ledger cannot manufacture claims, and differing evidence paths cannot prove submission',()=>{
 const {result,record,seat}=fixture();assert.equal(projectDailyBoard(result,null),result);
 seat.submission_receipt.evidence_path='data/memory/deepseek.json';
 assert.equal(projectDailyBoard(result,record).tasks[0].board_lifecycle.submission_verified,false);
});
