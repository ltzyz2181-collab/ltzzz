import {digest} from './daily-external-hire.mjs';
export function internalHireEvidence(record,{ans,read,sourcePath}){
 if(record.mode!=='internal')throw Error('internal_mode_required');
 const result={...record,author_provider:null,reviewer_provider:null,author_provider_verified:false,paid:false,tx_hash:null,new_payments_this_run:0,new_model_calls_this_run:0,
  money:{kind:'internal_non_cash_collaboration',paid:false,amount_raw:'0',tx_hash:null,internal_credit_settlement:'not_performed'},
  original_task_ids:ans?.tasks?.map(t=>t.id)||[],upstream_model_usage:[],evidence:[],action_taken:null,follow_up_receipt:null,rejection_reasons:[],delivery_accepted:false,deployed:false,
  model_execution_source_commit:ans?.source_commit||null};
 if(!ans||ans.date!==record.date){result.status='waiting_same_day_ANS_assignment';return result;}
 const worker=ans.artifacts?.find(a=>a.role==='worker'),reviewer=ans.artifacts?.find(a=>a.role==='reviewer');
 if(!worker||!reviewer){result.status='waiting_existing_ANS_delivery_no_extra_generation';result.upstream_status=ans.status;return result;}
 try{
  const paths=[sourcePath,worker.path,reviewer.path];
  const expected=['knowledge/results/ans-cycle/'+record.date+'.json','knowledge/results/ans-cycle/'+record.date+'-worker.json','knowledge/results/ans-cycle/'+record.date+'-reviewer.json'];
  if(paths.some((p,i)=>p!==expected[i]))throw Error('same_day_artifact_paths_required');
  if(paths.some(p=>typeof p!=='string'||!/^knowledge\/results\/ans-cycle\/\d{4}-\d{2}-\d{2}(?:-(?:worker|reviewer))?\.json$/.test(p)))throw Error('artifact_path_invalid');
  const bytes=paths.map(p=>read(p)),hashes=bytes.map(digest);
  if(hashes[1]!==worker.sha256||hashes[2]!==reviewer.sha256)throw Error('artifact_hash_mismatch');
  if(!ans.remote_claims||worker.task_id!==ans.tasks?.find(t=>t.role==='worker')?.id||reviewer.task_id!==ans.tasks?.find(t=>t.role==='independent_reviewer')?.id)throw Error('source_task_claim_required');
  const calls=[worker,reviewer].map(a=>ans.calls?.find(c=>c.executed_by===a.executed_by&&c.model===a.model&&c.status==='success'&&['stop','end_turn'].includes(c.finish_reason)&&c.tokens_used>0));
  if(calls.some(c=>!c)||!worker.executed_by||!reviewer.executed_by||worker.executed_by.toLowerCase()===reviewer.executed_by.toLowerCase())throw Error('actual_independent_provider_generation_required');
  const verdict=JSON.parse(bytes[2]);
  if(typeof verdict.accepted!=='boolean'||verdict.artifact_sha256!==worker.sha256||ans.audit?.artifact_sha256!==worker.sha256||ans.audit?.accepted!==verdict.accepted)throw Error('bound_audit_required');
  const submitted=[worker,reviewer].every(a=>ans.submissions?.some(s=>s.task_id===a.task_id&&s.sha256===a.sha256));
  const boardVerified=submitted&&ans.board_verification?.verified===true&&ans.board_verification.worker_status===(verdict.accepted?'completed_draft_review':'rejected_draft_review');
  // Retain exact public evidence bytes: a receipt rebase or later board sync must
  // not make this audit depend on mutable main paths.
  result.evidence=paths.map((path,i)=>({path,sha256:hashes[i],utf8:bytes[i].toString('utf8')}));
  result.upstream_model_usage=calls.map(c=>({executed_by:c.executed_by,model:c.model,finish_reason:c.finish_reason,tokens_used:c.tokens_used,source_run_id:c.source_run_id||ans.run_id,...(c.shared_request_id?{shared_request_id:c.shared_request_id,usage_scope:c.usage_scope}:{} )}));
  result.status=!boardVerified?'internal_reviewed_pending_board_verification':verdict.accepted?'internal_engineering_artifact_accepted':'internal_delivery_rejected';
  result.delivery_accepted=boardVerified&&verdict.accepted;
  result.action_taken={type:'existing_ANS_worker_and_independent_review',source_run_id:ans.run_id,source_tasks:result.original_task_ids,reused_existing_model_calls:true};
  result.author_provider=worker.executed_by;result.reviewer_provider=reviewer.executed_by;result.author_provider_verified=true;
  result.follow_up_receipt={artifact_sha256:worker.sha256,review_artifact_sha256:reviewer.sha256,author_provider:worker.executed_by,reviewer_provider:reviewer.executed_by,accepted:verdict.accepted,board_verified:boardVerified,scope:'engineering_draft_only_not_deployment_or_USDC_wages'};
  result.rejection_reasons=verdict.accepted?[]:verdict.reasons;
  // Top-level one-line rejection_reason: required on every rejected receipt so a
  // human never has to reopen Actions logs to know why delivery was refused.
  result.rejection_reason=verdict.accepted?null:(verdict.reasons||[]).join(' | ');
  if(!verdict.accepted && !result.rejection_reason) throw Error('rejection_reason_required');
 }catch(error){result.status='blocked_internal_evidence';result.evidence_error=error.message;}
 return result;
}
