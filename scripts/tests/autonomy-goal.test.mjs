import test from 'node:test';import assert from 'node:assert/strict';
import {GOAL_ID,evaluateGoal,digest,safeEvidence} from '../lib/autonomy-goal.mjs';
const ref={path:'knowledge/results/actual.json',source_commit:'a'.repeat(40),sha256:digest('actual pinned receipt')};
const goal={schema:'ltzzz.autonomy.goal.v1',goal_id:GOAL_ID,planning_window:{start:'2026-11-06',target_review:'2026-11-20'},tracks:[{id:'market_delivery',acceptance_checks:['order','cash_settlement']}]};
const state={goal_id:GOAL_ID,tracks:{market_delivery:{checks:{order:{verified:true,evidence_refs:[ref]}}}}};
const run=(s=state,now='2026-11-06T12:00:00Z',readPinned=()=>Buffer.from('actual pinned receipt'))=>evaluateGoal(goal,s,{now,readPinned});
test('elapsed target date, one order or a completed label cannot declare goal or cash success',()=>{
 const r=run({...state,status:'completed'},'2026-12-01T00:00:00Z');assert.equal(r.goal_completed,false);assert.ok(r.errors.includes('completion_claim_not_supported'));assert.equal(r.active_phase,'P0');assert.equal(r.auto_expire,false);
});
test('all pinned acceptance receipts and actual GPT closeout are separate requirements',()=>{
 const all={...state,tracks:{market_delivery:{checks:{order:{verified:true,evidence_refs:[ref]},cash_settlement:{verified:true,evidence_refs:[ref]}}}}};
 assert.equal(run(all).status,'awaiting_GPT_closeout');assert.equal(run({...all,controller_closeout:{seat:'gpt',evidence_ref:ref}}).goal_completed,false);
 const bytes=Buffer.from(JSON.stringify({schema:'ltzzz.autonomy.goal-closeout.v1',goal_id:GOAL_ID,controller:'gpt',decision:'all_acceptance_evidenced',verified_checks:['market_delivery:order','market_delivery:cash_settlement']}));
 const closeRef={...ref,path:'knowledge/results/goal-closeout.json',sha256:digest(bytes)};
 assert.equal(run({...all,controller_closeout:{seat:'gpt',evidence_ref:closeRef}},undefined,r=>r.path===closeRef.path?bytes:Buffer.from('actual pinned receipt')).goal_completed,true);
});
test('stale hashes, rolling refs, path escapes or absent receipts remain unverified',()=>{
 for(const bad of [{...ref,sha256:'b'.repeat(64)},{...ref,source_commit:'main'},{...ref,path:'knowledge/results/../secret.json'}]){
  const r=run({goal_id:GOAL_ID,tracks:{market_delivery:{checks:{order:{verified:true,evidence_refs:[bad]}}}}});assert.equal(r.tracks[0].verified_checks,0);
 }
 assert.equal(run(state,undefined,()=>{throw Error('missing');}).tracks[0].verified_checks,0);assert.equal(safeEvidence({...ref,path:'private/secret.json'}),false);
});
test('same input does not create progress merely because the observation time changed',()=>{
 assert.equal(run().progress_fingerprint,run(state,'2026-11-10T00:00:00Z').progress_fingerprint);assert.equal(run().model_calls,0);assert.equal(run().transactions,0);
});
test('an empty goal cannot satisfy acceptance vacuously',()=>{
 assert.throws(()=>evaluateGoal({...goal,tracks:[]},state,{readPinned:()=>Buffer.from('')}),/goal_tracks_required/);
});
