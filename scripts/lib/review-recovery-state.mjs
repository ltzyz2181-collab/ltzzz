export function recoveryRoute(record,order){
 const claim=order.owner_review_recovery,review=order.independent_review;
 if(claim){
  if(claim.claim_id!==record.claim_id||review?.claim_id!==record.claim_id)return 'foreign_claim';
  if(review.status!=='started_completion_unknown')return 'readback_only';
  return record.response?'submit_saved_response':'unknown_no_generation';
 }
 return record.model_calls===0?'preflight':'unknown_no_generation';
}
export async function submitSavedReview(record,{api,date}){
 const r=record.response;
 const complete=r?.ok&&r.model_source==='provider_response'&&['stop','end_turn'].includes(r.finish_reason)&&Number.isSafeInteger(r.tokens_used)&&r.tokens_used>0&&typeof r.output==='string';
 if(!complete){await api('/market/procurement/daily-review',{date,phase:'failed',claim_id:record.claim_id,failure_kind:'incomplete'});return;}
 try{
  await api('/market/procurement/daily-review',{date,phase:'submit',claim_id:record.claim_id,artifact_sha256:record.artifact_sha256,executed_by:'Doubao',model:r.model,model_source:r.model_source,finish_reason:r.finish_reason,tokens_used:r.tokens_used,output:r.output});
 }catch(error){
  if(/^wep3_http_422_/.test(error.message)){await api('/market/procurement/daily-review',{date,phase:'failed',claim_id:record.claim_id,failure_kind:'invalid_verdict'});return;}
  throw Error('review_submission_unknown_reconcile_saved_response');
 }
}
