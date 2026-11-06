export const DAILY_REVIEW_ASSIGNMENTS=Object.freeze({
 deepseek:{reviewer:'doubao',mode:'embedded_daily_call'},
 doubao:{reviewer:'qianwen',mode:'embedded_daily_call'},
 grok:{reviewer:'qianwen',mode:'embedded_daily_call'},
 qianwen:{reviewer:'gpt',fallback:'deepseek',mode:'separate_controller_review_no_automatic_model_purchase'}
});
// Planned routing is not evidence that a reviewer generated, claimed or accepted.
export function assignDailyReviewers(record){
 for(const [agent,seat] of Object.entries(record.seats||{})){
  const completed=seat.review_verified===true&&seat.review_receipt?.reviewed_sha256===seat.artifact?.sha256;
  const route=DAILY_REVIEW_ASSIGNMENTS[agent];
  const reviewer=completed?seat.review_receipt.reviewer_actual_provider:route?.reviewer;
  if(!reviewer||reviewer===agent){seat.review_assignment={status:'review_unassigned',reviewer:null};seat.status='review_unassigned';seat.review_verified=false;seat.accepted=false;continue;}
  const task=route?.mode==='embedded_daily_call'?record.seats[reviewer]?.assignment?.id:`REVIEW-${record.date}-${agent}-by-${reviewer}`;
  seat.review_assignment={status:completed?'review_verified':seat.artifact?'assigned_pending_execution':'assigned_waiting_subject',reviewer,native_fallback:route?.fallback||null,mode:route?.mode||'bound_existing_review',reviewer_task_id:task||null,reviewer_execution_verified:completed};
  if(seat.artifact&&seat.assignment?.id)seat.review_binding={date:record.date,run_key:record.run_key,source_commit:record.source_commit,task_id:seat.assignment.id,worker_artifact:{...seat.artifact},reviewer,reviewer_task_id:task||null,binding_scope:completed?'board_review_verified':'subject_bound_not_reviewer_execution'};
 }
 return record;
}
