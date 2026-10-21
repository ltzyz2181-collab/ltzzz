import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {dailyHireAssignment,digest,executeDailyHire} from '../lib/daily-external-hire.mjs';
import {internalHireEvidence} from '../lib/internal-daily-hire.mjs';
import {prepareDailyHire,saveDailyHire,dailyHirePath} from '../lib/daily-hire-files.mjs';
const date='2026-10-20',sourcePath='knowledge/results/ans-cycle/'+date+'.json';
function fixture(accepted=true){
 const workerPath='knowledge/results/ans-cycle/'+date+'-worker.json',reviewPath='knowledge/results/ans-cycle/'+date+'-reviewer.json';
 const workerText=JSON.stringify({finding:'A concrete engineering defect',minimal_patch:'draft only'}),hash=digest(workerText);
 const reviewText=JSON.stringify({accepted,artifact_sha256:hash,reasons:['Specific independent review reason'],unverified:['No production deployment.']});
 const artifacts=[{role:'worker',task_id:'ANS-'+date+'-deepseek',executed_by:'DeepSeek',model:'deepseek-test',path:workerPath,sha256:hash},{role:'reviewer',task_id:'ANS-'+date+'-doubao',executed_by:'Doubao',model:'doubao-test',path:reviewPath,sha256:digest(reviewText)}];
 const ans={date,run_id:'source-run',source_commit:'a'.repeat(40),status:accepted?'draft_independently_reviewed':'draft_rejected',remote_claims:true,
  tasks:[{id:artifacts[0].task_id,role:'worker'},{id:artifacts[1].task_id,role:'independent_reviewer'}],artifacts,
  calls:artifacts.map(a=>({executed_by:a.executed_by,model:a.model,status:'success',finish_reason:'stop',tokens_used:100})),
  submissions:artifacts.map(a=>({task_id:a.task_id,sha256:a.sha256})),audit:{accepted,artifact_sha256:hash},
  board_verification:{verified:true,worker_status:accepted?'completed_draft_review':'rejected_draft_review'}};
 const record=dailyHireAssignment({date,sourceCommit:ans.source_commit,context:{},runId:'current-run'});
 const read=p=>p===sourcePath?Buffer.from(JSON.stringify(ans)):p===workerPath?Buffer.from(workerText):p===reviewPath?Buffer.from(reviewText):assert.fail('unexpected path');
 return {record,ans,read,sourcePath};
}
test('internal collaboration records real provider usage and hash-bound acceptance without spending',()=>{
 const f=fixture(),r=internalHireEvidence(f.record,f);assert.equal(r.mode,'internal');assert.equal(r.status,'internal_engineering_artifact_accepted');assert.equal(r.paid,false);assert.equal(r.tx_hash,null);assert.equal(r.new_model_calls_this_run,0);assert.equal(r.upstream_model_usage.length,2);assert.equal(r.follow_up_receipt.board_verified,true);assert.equal(r.deployed,false);
});
test('a real rejection is data and never promoted to acceptance, payment or deployment',()=>{
 const f=fixture(false),r=internalHireEvidence(f.record,f);assert.equal(r.status,'internal_delivery_rejected');assert.equal(r.author_provider,'DeepSeek');assert.equal(r.reviewer_provider,'Doubao');assert.equal(r.author_provider_verified,true);assert.equal(r.delivery_accepted,false);assert.equal(r.paid,false);assert.equal(r.rejection_reasons.length,1);
});
test('missing board confirmation, model completion or independent providers cannot pass',()=>{
 for(const mutate of [f=>f.ans.remote_claims=false,f=>f.ans.calls[0].finish_reason='length',f=>f.ans.calls[1].executed_by='DeepSeek',f=>f.ans.audit.artifact_sha256='wrong']){const f=fixture();mutate(f);assert.equal(internalHireEvidence(f.record,f).status,'blocked_internal_evidence');}
 const f=fixture();f.ans.board_verification.verified=false;assert.equal(internalHireEvidence(f.record,f).status,'internal_reviewed_pending_board_verification');
});
test('modified bytes, previous-day artifacts and outside paths are rejected before attribution',()=>{
 for(const mutate of [f=>f.read=()=>Buffer.from('tampered'),f=>f.ans.artifacts[0].path='knowledge/results/ans-cycle/2026-10-19-worker.json',f=>f.ans.artifacts[0].path='.secrets-local/key']){const f=fixture();mutate(f);assert.equal(internalHireEvidence(f.record,f).status,'blocked_internal_evidence');}
});
test('a missing same-day task waits and never repeats prior generation',()=>{
 const f=fixture();assert.equal(internalHireEvidence(f.record,{...f,ans:null}).status,'waiting_same_day_ANS_assignment');f.ans.artifacts=[];assert.equal(internalHireEvidence(f.record,f).status,'waiting_existing_ANS_delivery_no_extra_generation');
});
test('internal mode cannot enter the cash executor',async()=>{const f=fixture();await assert.rejects(executeDailyHire(f.record,{}),/external_mode_required/);});
test('daily assignment and metrics remain one row on retries; mode cannot silently change',()=>{
 const cwd=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ltzzz-internal-hire-'));
 try{process.chdir(dir);fs.mkdirSync('ops/dispatch',{recursive:true});for(const p of ['wep3-market.js','wep3-aave.js','wep3-procurement-contract.js'])fs.writeFileSync(p,'fixed input');
  const first=prepareDailyHire({date,sourceCommit:'a'.repeat(40),runId:'first'}),again=prepareDailyHire({date,sourceCommit:'b'.repeat(40),runId:'again'});assert.equal(first.task_id,again.task_id);assert.equal(again.run_id,'first');assert.equal(again.mode,'internal');assert.equal(again.max_usdc,'0');
  assert.throws(()=>prepareDailyHire({date,mode:'external'}),/daily_mode_already_assigned/);
  saveDailyHire({...first,status:'internal_delivery_rejected'});saveDailyHire({...first,status:'internal_delivery_rejected'});
  const metrics=JSON.parse(fs.readFileSync('knowledge/results/claude-team/daily-hire-metrics.json'));assert.equal(metrics.orders,1);assert.equal(metrics.rejected,1);assert.equal(metrics.external_usdc_paid_raw,'0');assert.ok(fs.existsSync(dailyHirePath(date)));
 }finally{process.chdir(cwd);fs.rmSync(dir,{recursive:true,force:true});}
});
test('scheduled workflow defaults to internal and exposes secrets only to explicit external selection',()=>{
 const source=fs.readFileSync('.github/workflows/daily-external-hire.yml','utf8');assert.match(source,/default: internal/);assert.match(source,/env.HIRE_MODE == 'external' && github.event_name == 'workflow_dispatch'/);assert.match(source,/Execute LTZZZ AI task queue/);
});
