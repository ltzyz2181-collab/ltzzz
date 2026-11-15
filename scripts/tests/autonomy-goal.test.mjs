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

const correctionPath='knowledge/results/goals/corrections/20261113-source-ancestry-correction.json';
const releasePath='knowledge/results/products/delivery-check-0.1.0-release-20261108.json';
const packagePath='products/releases/ltzzz-delivery-check-0.1.0.zip';
const oldCommit='a'.repeat(40),correctionCommit='b'.repeat(40),replacementCommit='c'.repeat(40);
const recordedAt='2026-11-13T00:00:00.000Z';
const releaseBytes=Buffer.from('byte-identical release receipt');
const packageBytes=Buffer.from('byte-identical release package');
const originalRef={path:releasePath,source_commit:oldCommit,sha256:digest(releaseBytes)};
const correctionBody={schema:'ltzzz.goal.evidence-correction.v1',goal_id:GOAL_ID,kind:'append_only_source_ancestry_correction',recorded_at_utc:recordedAt,state_path:'ops/goals/'+GOAL_ID+'.state.json',evidence_path:releasePath,old_source_commit:oldCommit,old_sha256:originalRef.sha256,receipt_internal_source_commit:'d'.repeat(40),current_main_source_commit:replacementCommit,same_bytes_verified:true,observed_sha256:originalRef.sha256,package_path:packagePath,expected_package_sha256:digest(packageBytes),observed_package_sha256:digest(packageBytes),package_same_bytes_verified:true,ancestry:{exit_code:1,common_ancestor:null,finding:'no_common_ancestor_history_rewritten'}};
const correctionBytes=Buffer.from(JSON.stringify(correctionBody));
const correctionRef={path:correctionPath,source_commit:correctionCommit,sha256:digest(correctionBytes),kind:'append_only_source_ancestry_correction',corrects:oldCommit};
const correctionGoal={schema:'ltzzz.autonomy.goal.v1',goal_id:GOAL_ID,planning_window:{start:'2026-11-06',target_review:'2026-11-20'},tracks:[{id:'core_product',acceptance_checks:['prototype_and_negative_cases','permitted_customer_delivery']}]};
const correctionState={goal_id:GOAL_ID,status:'active',tracks:{core_product:{checks:{prototype_and_negative_cases:{verified:true,evidence_refs:[originalRef,correctionRef]}}}},evidence_corrections:[{path:correctionPath,source_commit:correctionCommit,sha256:correctionRef.sha256,applied_at_utc:recordedAt}]};
const correctionRead=ref=>{if(ref.path===correctionPath&&ref.source_commit===correctionCommit)return correctionBytes;if(ref.path===releasePath&&ref.source_commit===replacementCommit)return releaseBytes;if(ref.path===packagePath&&ref.source_commit===correctionCommit)return packageBytes;throw Error('pinned_object_unavailable');};
test('append-only source ancestry correction verifies the pinned correction, replacement receipt and package bytes',()=>{
 const result=evaluateGoal(correctionGoal,correctionState,{now:'2026-11-14T00:00:00Z',readPinned:correctionRead});
 assert.equal(result.status,'active_acceptance_pending');assert.equal(result.goal_completed,false);assert.equal(result.errors.length,0);
 assert.equal(result.tracks[0].verified_checks,1);assert.equal(result.tracks[0].checks[0].verified,true);
 assert.equal(result.tracks[0].checks[0].verification_method,'append_only_source_ancestry_correction');
 assert.equal(result.tracks[0].checks[0].correction_refs[0].replacement_source_commit,replacementCommit);
 assert.equal(result.tracks[0].checks[0].correction_refs[0].package_sha256,digest(packageBytes));
});
test('append-only correction fails closed on missing state pin, wrong package bytes or an unrelated track',()=>{
 const missingPin={...correctionState,evidence_corrections:[]};
 const a=evaluateGoal(correctionGoal,missingPin,{readPinned:correctionRead});
 assert.equal(a.tracks[0].verified_checks,0);assert.ok(a.errors.includes('unverified_evidence:core_product:prototype_and_negative_cases'));
 const badPackage=ref=>ref.path===packagePath?Buffer.from('different package bytes'):correctionRead(ref);
 const b=evaluateGoal(correctionGoal,correctionState,{readPinned:badPackage});
 assert.equal(b.tracks[0].verified_checks,0);
 const otherGoal={...correctionGoal,tracks:[{id:'market_delivery',acceptance_checks:['prototype_and_negative_cases']}]};
 const c=evaluateGoal(otherGoal,correctionState,{readPinned:correctionRead});
 assert.equal(c.tracks[0].verified_checks,0);
});
test('append-only correction cannot be reduced to the correction file alone or a mutable hash',()=>{
 const onlyCorrection={...correctionState,tracks:{core_product:{checks:{prototype_and_negative_cases:{verified:true,evidence_refs:[correctionRef]}}}}};
 const a=evaluateGoal(correctionGoal,onlyCorrection,{readPinned:correctionRead});
 assert.equal(a.tracks[0].verified_checks,0);
 const badRef={...correctionRef,sha256:'f'.repeat(64)};
 const badHash={...correctionState,tracks:{core_product:{checks:{prototype_and_negative_cases:{verified:true,evidence_refs:[originalRef,badRef]}}}},evidence_corrections:[{path:correctionPath,source_commit:correctionCommit,sha256:badRef.sha256,applied_at_utc:recordedAt}]};
 const b=evaluateGoal(correctionGoal,badHash,{readPinned:correctionRead});
 assert.equal(b.tracks[0].verified_checks,0);
});
