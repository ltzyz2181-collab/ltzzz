import test from 'node:test';import assert from 'node:assert/strict';
import {recoveryRoute,submitSavedReview} from '../lib/review-recovery-state.mjs';
const record=()=>({claim_id:'owner-review',artifact_sha256:'a'.repeat(64),model_calls:0,status:'blocked_catalogue_timeout'});
const order=status=>({owner_review_recovery:{claim_id:'owner-review'},independent_review:{claim_id:'owner-review',status}});
test('zero-call preflight failures can retry only after readback proves no remote recovery claim',()=>{
 assert.equal(recoveryRoute(record(),{}),'preflight');assert.equal(recoveryRoute({...record(),model_calls:1},{}),'unknown_no_generation');
 assert.equal(recoveryRoute(record(),order('started_completion_unknown')),'unknown_no_generation');
 assert.equal(recoveryRoute({...record(),response:{ok:true}},order('started_completion_unknown')),'submit_saved_response');
});
test('interruption after remote success reconciles through readback without another generation',()=>{
 for(const status of ['accepted_engineering_artifact','rejected_engineering_artifact','blocked_review_generation'])assert.equal(recoveryRoute(record(),order(status)),'readback_only');
 const other=order('accepted_engineering_artifact');other.owner_review_recovery.claim_id='other';assert.equal(recoveryRoute(record(),other),'foreign_claim');
});
const response=()=>({ok:true,model_source:'provider_response',finish_reason:'stop',model:'doubao-test',tokens_used:42,output:'not actually JSON'});
test('definitive verdict rejection closes the remote review as failed and preserves raw response',async()=>{
 const r={...record(),response:response()},phases=[];const raw=r.response.output;
 await submitSavedReview(r,{date:'2026-10-20',api:async(_,b)=>{phases.push(b.phase);if(b.phase==='submit')throw Error('wep3_http_422_invalid_review_json');return {ok:true};}});
 assert.deepEqual(phases,['submit','failed']);assert.equal(r.response.output,raw);
});
test('uncertain submit outcomes retain evidence and never mark a possibly accepted verdict failed',async()=>{
 const r={...record(),response:response()},phases=[];
 await assert.rejects(submitSavedReview(r,{date:'2026-10-20',api:async(_,b)=>{phases.push(b.phase);throw Error('network timeout')}}),/reconcile_saved_response/);assert.deepEqual(phases,['submit']);assert.equal(r.response.output,'not actually JSON');
});
test('an incomplete or unmetered model response becomes failed without submitting acceptance',async()=>{
 const r={...record(),response:{...response(),tokens_used:0}},phases=[];await submitSavedReview(r,{date:'2026-10-20',api:async(_,b)=>{phases.push(b.phase);return {ok:true};}});assert.deepEqual(phases,['failed']);
});
