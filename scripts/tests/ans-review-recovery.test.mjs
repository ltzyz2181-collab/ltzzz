import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digest} from '../lib/ans-cycle.mjs';
import {materializeAnsReview,pendingAnsReviewSync,cycleClosure} from '../lib/ans-review-recovery.mjs';
const date='2026-10-24',receiptPath='knowledge/results/qwen-dispatch/ANS-REVIEW-RECOVERY-FIXTURE.json';
const write=(root,p,v)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),typeof v==='string'?v:JSON.stringify(v,null,2)+'\n');};
function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ans-review-recovery-'));try{
 const workerPath=`knowledge/results/ans-cycle/${date}-worker.json`,bytes=JSON.stringify({finding:'Existing unimplemented response persistence specification'})+'\n';write(root,workerPath,bytes);
 const record={date,status:'blocked_provider_or_incomplete',tasks:[{id:`ANS-${date}-deepseek`,agent:'deepseek'},{id:`ANS-${date}-doubao`,agent:'doubao'}],calls:[{requested_agent:'DeepSeek',status:'success'},{requested_agent:'Doubao',status:'provider_incomplete_or_uncertain'}],artifacts:[{role:'worker',task_id:`ANS-${date}-deepseek`,path:workerPath,sha256:digest(bytes),executed_by:'DeepSeek'}],paid:false,tx_hash:null};
 const verdict={task_id:`ANS-${date}-deepseek`,reviewer_task_id:`ANS-${date}-doubao`,artifact_sha256:digest(bytes),accepted:false,reasons:['Specification remains incomplete'],unverified:['Runtime not executed']};
 const output=JSON.stringify({reviews:[verdict]});
 const receipt={status:'draft_delivered_pending_independent_review',native_qwen_call:true,model_source:'provider_response',model:'qwen-plus',finish_reason:'stop',run_id:'123',output,output_sha256:digest(output)};
 write(root,`knowledge/results/ans-cycle/${date}.json`,record);write(root,receiptPath,receipt);return fn({root,record,receipt,verdict});
 }finally{fs.rmSync(root,{recursive:true,force:true});}}
test('supplementary native review preserves original uncertain attempt, worker bytes and original IDs',()=>fixture(({root,record})=>{
 const before=fs.readFileSync(path.join(root,`knowledge/results/ans-cycle/${date}.json`)),r=materializeAnsReview({root,date,receiptPath});
 assert.equal(r.status,'draft_rejected');assert.equal(r.artifacts[1].task_id,`ANS-${date}-doubao`);assert.equal(r.artifacts[1].executed_by,'Qianwen');assert.deepEqual(r.calls.slice(0,record.calls.length),record.calls);assert.equal(r.calls.at(-1).source_run_id,'123');assert.equal(r.calls.at(-1).executed_by,'Qianwen');assert.deepEqual(r.artifacts[0],record.artifacts[0]);assert.equal(r.review_recovery.author_model_replays,0);assert.equal(r.paid,false);assert.equal(r.tx_hash,null);
 assert.deepEqual(fs.readFileSync(path.join(root,r.review_recovery.original.path)),before);assert.throws(()=>materializeAnsReview({root,date,receiptPath}),/already_materialized/);
}));
test('unknown completion, nonnative metadata, changed output and wrong task/hash cannot materialize',()=>{
 for(const change of [r=>r.finish_reason='length',r=>r.native_qwen_call=false,r=>r.model_source='requested_model',r=>r.output+=' ',r=>{const v=JSON.parse(r.output);v.reviews[0].task_id='OTHER';r.output=JSON.stringify(v);r.output_sha256=digest(r.output);},r=>{const v=JSON.parse(r.output);v.reviews[0].artifact_sha256='0'.repeat(64);r.output=JSON.stringify(v);r.output_sha256=digest(r.output);}])fixture(({root,receipt})=>{change(receipt);write(root,receiptPath,receipt);assert.throws(()=>materializeAnsReview({root,date,receiptPath}));assert.equal(fs.existsSync(path.join(root,`knowledge/results/ans-cycle/${date}-reviewer.json`)),false);});
});
test('reconciliation selects only exact hash-bound supplementary reviews and skips closed readbacks',()=>fixture(({root})=>{
 assert.deepEqual(pendingAnsReviewSync(root),[]);const r=materializeAnsReview({root,date,receiptPath});assert.deepEqual(pendingAnsReviewSync(root),[date]);
 Object.assign(r,{remote_review_status:'rejected_draft_review',sync_status:'hashed_artifacts_submitted',board_verification:{verified:true,worker_status:'rejected_draft_review'}});write(root,`knowledge/results/ans-cycle/${date}.json`,r);
 assert.equal(cycleClosure(r,{root}),true);assert.deepEqual(pendingAnsReviewSync(root),[]);
}));
test('local review generation never claims remote closure and accepted/rejected states must agree',()=>fixture(({root})=>{
 const r=materializeAnsReview({root,date,receiptPath});assert.equal(cycleClosure(r,{root}),false);
 Object.assign(r,{remote_review_status:'completed_draft_review',sync_status:'hashed_artifacts_submitted',board_verification:{verified:true,worker_status:'completed_draft_review'}});assert.equal(cycleClosure(r,{root}),false);
}));
test('archive or provider receipt tampering blocks backlog selection without replaying a model',()=>{
 for(const target of ['original','receipt'])fixture(({root})=>{const r=materializeAnsReview({root,date,receiptPath});fs.appendFileSync(path.join(root,r.review_recovery[target].path),' ');assert.throws(()=>pendingAnsReviewSync(root),/invalid_pending_review_recovery/);});
});
test('symlinked source and path traversal are rejected before artifact creation',()=>fixture(({root})=>{
 assert.throws(()=>materializeAnsReview({root,date:'../../wrong',receiptPath}),/invalid_recovery_subject/);
 const p=path.join(root,receiptPath),bytes=fs.readFileSync(p);fs.unlinkSync(p);write(root,'receipt-target.json',bytes.toString());fs.symlinkSync(path.join(root,'receipt-target.json'),p);assert.throws(()=>materializeAnsReview({root,date,receiptPath}),/recovery_evidence_path_invalid/);
}));
test('actual verification CLI fails on a skipped blocked cycle and makes zero provider calls',()=>fixture(({root})=>{
 const script=fileURLToPath(new URL('../run-ans-cycle.mjs',import.meta.url)),r=spawnSync(process.execPath,[script,'verify'],{cwd:root,env:{...process.env,ANS_DATE:date},encoding:'utf8'});
 assert.equal(r.status,1);assert.deepEqual(JSON.parse(r.stdout),{date,status:'blocked_provider_or_incomplete',draft_review_closure_verified:false,deployed:false,model_calls:0,financial_execution:false});
}));
test('workflow selects authenticated proxy before new requests, does not retry old uncertain outputs, and verifies final closure',()=>{
 const yml=fs.readFileSync(new URL('../../.github/workflows/execute-task-queue.yml',import.meta.url),'utf8');
 assert.match(yml,/DOUBAO_USE_PROXY: 'true'/);assert.match(yml,/LTZZZ_AGENT_TOKEN: \$\{\{ secrets.LTZZZ_AGENT_TOKEN \}\}/);assert.match(yml,/if: steps.prepare.outputs.execute == 'true'/);assert.match(yml,/node scripts\/sync-ans-review-backlog.mjs/);assert.match(yml,/node scripts\/run-ans-cycle.mjs verify/);
});
