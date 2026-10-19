import {dailyHireId} from './wep3-procurement-contract.js';
export async function dailyHireReview(m,book,input){
 const order=book.procurement?.[dailyHireId(input.date)];
 if(!order?.paid||!order.semantic_valid||order.model_reported!=='deepseek/deepseek-chat')return {ok:false,error:'paid_semantic_delivery_and_reported_author_required'};
 if(!/^[A-Za-z0-9_.:-]{1,120}$/.test(input.claim_id||''))return {ok:false,error:'review_claim_required'};
 if(input.phase==='claim'){
  if(order.independent_review)return {ok:true,claimed:false,review:order.independent_review};
  order.independent_review={status:'started_completion_unknown',claim_id:input.claim_id,artifact_sha256:order.deliverable_sha256,author_provider:'DeepSeek',reviewer_provider:'Doubao',at:new Date().toISOString()};
  await m.save(book);return {ok:true,claimed:true,review:order.independent_review};
 }
 const prior=order.independent_review;
 if(!prior||prior.claim_id!==input.claim_id)return {ok:false,error:'review_claim_mismatch'};
 if(prior.status!=='started_completion_unknown')return {ok:true,duplicate:true,review:prior};
 if(input.phase==='failed'){
  prior.status='blocked_review_generation';prior.failure_kind=['incomplete','unavailable','invalid_verdict'].includes(input.failure_kind)?input.failure_kind:'unavailable';
  await m.save(book);return {ok:true,review:prior};
 }
 if(input.phase!=='submit'||input.artifact_sha256!==order.deliverable_sha256||input.executed_by!=='Doubao'||!/^doubao[-/a-zA-Z0-9_.]*$/.test(input.model||'')||!['stop','end_turn'].includes(input.finish_reason)||!Number.isSafeInteger(input.tokens_used)||input.tokens_used<1||typeof input.output!=='string'||input.output.length>12000)return {ok:false,error:'complete_independent_provider_evidence_required'};
 let verdict;try{verdict=JSON.parse(input.output.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{return {ok:false,error:'invalid_review_json'};}
 if(typeof verdict.accepted!=='boolean'||verdict.artifact_sha256!==order.deliverable_sha256||!Array.isArray(verdict.reasons)||!verdict.reasons.length||verdict.reasons.some(v=>typeof v!=='string'||!v.trim())||!Array.isArray(verdict.unverified))return {ok:false,error:'hash_bound_verdict_required'};
 Object.assign(prior,{status:verdict.accepted?'accepted_engineering_artifact':'rejected_engineering_artifact',...verdict,executed_by:input.executed_by,model:input.model,finish_reason:input.finish_reason,tokens_used:input.tokens_used,output:input.output,provenance:'authenticated_runner_provider_response_not_model_identity_attestation',completed_at:new Date().toISOString()});
 order.independent_review_status=prior.status;order.delivery_accepted=verdict.accepted;
 order.status=verdict.accepted?'paid_delivery_accepted':'paid_delivery_rejected';
 book.ledger||=[];
 if(!book.ledger.some(e=>e.type==='external_AI_delivery_review'&&e.order_id===order.id))book.ledger.push({type:'external_AI_delivery_review',order_id:order.id,accepted:verdict.accepted,deliverable_sha256:order.deliverable_sha256,author_provider:'DeepSeek',reviewer_provider:'Doubao',paid:false,new_cash_payment:false,at:prior.completed_at});
 await m.save(book);return {ok:true,review:prior,delivery_accepted:order.delivery_accepted};
}
