import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const final=new Set(['completed_draft_review','rejected_draft_review']);
export async function publishControllerDailyReview({record,reviewRef,read,observe,command,latch,reconciledLegacyRejection=null}){
 const worker=record.seats?.qianwen;
 if(!worker?.submission_verified||!worker.claim_verified||!worker.artifact||!worker.assignment?.id)throw Error('submitted_qianwen_subject_required');
 if(!reviewRef||!/^[a-f0-9]{64}$/.test(reviewRef.sha256||'')||reviewRef.path!==`knowledge/results/daily-board/reviews/${record.date}-qianwen-${reviewRef.sha256}.json`)throw Error('fixed_review_reference_required');
 const bytes=await read(reviewRef.path);if(sha(bytes)!==reviewRef.sha256)throw Error('review_bytes_not_bound');
 const verdict=JSON.parse(bytes),subject=await read(worker.artifact.path);
 if(sha(subject)!==worker.artifact.sha256)throw Error('worker_bytes_not_bound');
 const body=JSON.parse(subject);
 if(body.actual_provider!=='qianwen'||body.model_source!=='provider_response'||body.finish_reason!=='stop'||typeof body.output!=='string'||!body.output.trim()||body.integrity?.status!=='structurally_complete'||!body.actual_model||body.execution?.executed_by!=='qianwen'||body.execution?.generation_verified!==true||body.execution?.model_source!=='provider_response'||body.execution?.task_id!==worker.assignment.id||body.execution?.actual_model!==body.actual_model)throw Error('native_worker_required');
 if(verdict.actual_provider!=='gpt'||verdict.reviewer_kind!=='current_Codex_AI_controller'||verdict.actual_provider_company!=='OpenAI'||verdict.native_API_generation!==false||verdict.actual_model!==null||verdict.task_id!==worker.assignment.id||verdict.artifact_sha256!==worker.artifact.sha256||verdict.date!==record.date||verdict.run_key!==record.run_key||verdict.source_commit!==record.source_commit||typeof verdict.accepted!=='boolean'||!Array.isArray(verdict.reasons)||!verdict.reasons.length)throw Error('explicit_controller_review_required');
 const target=verdict.accepted?'completed_draft_review':'rejected_draft_review';
 const bound=task=>task?.id===worker.assignment.id&&task.date===record.date&&task.claimed_by==='qianwen'&&task.evidence_path===worker.artifact.path&&task.evidence_sha256===worker.artifact.sha256;
 const matches=task=>bound(task)&&task.status===target&&task.review?.scope==='engineering_draft_only'&&task.review?.worker_actual_provider==='qianwen'&&task.review?.reviewed_sha256===worker.artifact.sha256&&task.review?.evidence_path===reviewRef.path&&task.review?.evidence_sha256===reviewRef.sha256&&task.review?.reviewer_actual_provider==='gpt'&&task.review?.accepted===verdict.accepted;
 const task=await observe();if(!bound(task))throw Error('live_task_subject_conflict');
 if(matches(task))return {status:'review_existing_verified',verified:true,accepted:verdict.accepted,model_api_calls:0};
 if(final.has(task.status))throw Error('another_final_review_preserved');
 if(task.status!=='submitted_pending_review')throw Error('live_task_not_pending');
 const originalKey=sha(JSON.stringify(['controller-daily-review',worker.assignment.id,worker.artifact.sha256]));
 let key=originalKey;const original=await latch.read(originalKey),proof=reconciledLegacyRejection;
 // One incident-specific migration; the old reservation remains untouched.
 if(original&&original.state?.request_schema===undefined&&original.state?.task_id===worker.assignment.id&&original.state?.subject_sha256===worker.artifact.sha256&&original.state?.review_sha256===reviewRef.sha256&&proof?.verified===true&&proof.task_id===worker.assignment.id&&proof.review_sha256===reviewRef.sha256&&['42348121504','42348185493'].includes(proof.prior_run_id)&&proof.failure==='missing_required_reason_before_mutation')key=sha(JSON.stringify(['controller-daily-review-required-reason-recovery-v1',worker.assignment.id,worker.artifact.sha256,proof.prior_run_id]));
 let reserved=false;const prior=key===originalKey?original:await latch.read(key);
 if(!prior)reserved=await latch.compareAndSwap(key,null,{request_schema:'pulse-required-reason-v1',status:'review_post_reserved_no_replay',task_id:worker.assignment.id,subject_sha256:worker.artifact.sha256,review_sha256:reviewRef.sha256});
 if(reserved){try{await command({id:'gpt-review-'+key,action:'review_task',reason:'Bound current GPT draft review; no model purchase or settlement',agent:'gpt',task_id:worker.assignment.id,accepted:verdict.accepted,reviewed_sha256:worker.artifact.sha256,scope:'engineering_draft_only',worker_actual_provider:'qianwen',reviewer_actual_provider:'gpt',review_evidence_path:reviewRef.path,review_evidence_sha256:reviewRef.sha256});}catch{/* Unknown POST outcome is reconciled once by GET, never replayed. */}}
 const after=await observe();return {status:matches(after)?'review_recorded_verified':'review_publication_unknown_no_retry',verified:matches(after),accepted:matches(after)?verdict.accepted:null,post_attempted:reserved,legacy_rejection_reconciled:key!==originalKey,model_api_calls:0};
}
