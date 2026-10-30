// One explicit learning purchase through the existing order-scoped treasury Worker.
// No private key, arbitrary payee, wallet RPC, scheduler or legacy-exit override.
import {createHash} from 'node:crypto';
import {canonical} from './patchgate.mjs';
import {PROVIDER} from './external-procurement-preflight.mjs';
import {dailyHireBody,dailyHireId} from '../../wep3-procurement-contract.js';
import {paymentQuote} from '../../wep3-procurement.js';
import {TREASURY} from './funded-invest-runtime.mjs';
import {externalAIRelay} from './external-ai-relay.mjs';
import {executeDailyHire} from './daily-external-hire.mjs';
import {assertOwnerOrderContext,assertOwnerPayment} from './owner-external-hire.mjs';
export const practiceDigest=b=>createHash('sha256').update(b).digest('hex');
export const PRACTICE_INPUTS=Object.freeze(['wep3-market.js','wep3-aave.js','wep3-procurement-contract.js','wep3-procurement-novelty.js']);
export function practiceIdentity({command_id,task_id}={}){
 if(typeof command_id!=='string'||!/^CTRL-[A-Z0-9][A-Z0-9_-]{5,79}$/.test(command_id)||typeof task_id!=='string'||!/^[A-Z][A-Z0-9_-]{6,100}$/.test(task_id))throw Error('strict_controller_practice_identity_required');
 return {command_id,task_id};
}
export const practicePath=id=>'knowledge/results/controller-practice/'+practiceIdentity(id).command_id+'.json';
export function validatePracticeBridgeClaim(record,{claim,run,childSource}={}){
 practiceIdentity(record);
 const repo='ltzyz2181-collab/ltzzz';
 if(claim?.schema!=='ltzzz.controller-workflow-dispatch.v1'||claim.command_id!==record.command_id||claim.task_id!==record.task_id||claim.workflow!=='controller-paid-practice.yml'
  ||claim.dispatched!==true||claim.status!=='dispatch_accepted_child_result_pending'||claim.source_commit!==childSource||!/^[a-f0-9]{40}$/.test(childSource||'')
  ||!/^[a-f0-9]{64}$/.test(claim.command_sha256||'')||String(run?.id)!==claim.run_id||run.actor?.id!==261544579||run.repository?.full_name!==repo||run.head_repository?.full_name!==repo
  ||run.head_branch!=='main'||run.head_sha!==childSource||!['push','issue_comment'].includes(run.event)||run.path!=='.github/workflows/controller-workflow-command.yml')throw Error('authenticated_controller_bridge_claim_required');
 return true;
}
export function validatePracticeRecord(record){
 practiceIdentity(record);
 if(record.schema!=='ltzzz.controller-paid-practice.v1'||record.mode!=='external'||record.max_usdc!=='0.05'||record.max_new_orders!==1
  ||record.external_runtime_order_id!==dailyHireId(record.date)||record.source_commit!==record.context?.source_commit
  ||canonical(record.inputs?.map(x=>x.path))!==canonical(PRACTICE_INPUTS)||record.inputs.some(x=>!/^[a-f0-9]{64}$/.test(x.sha256||''))
  ||record.context.input_sha256!==practiceDigest(canonical(record.inputs)))throw Error('bound_public_practice_record_required');
 return record;
}
export function preparePractice({command_id,task_id,date,sourceCommit,runId,read,existing=null}){
 practiceIdentity({command_id,task_id});
 if(existing){if(existing.command_id!==command_id||existing.task_id!==task_id)throw Error('practice_claim_identity_mismatch');return validatePracticeRecord(existing);}
 if(!/^[a-f0-9]{40}$/.test(sourceCommit||'')||!/^\d+$/.test(String(runId||'')))throw Error('real_runner_source_and_run_required');
 const external_runtime_order_id=dailyHireId(date),inputs=PRACTICE_INPUTS.map(path=>({path,sha256:practiceDigest(read(path))}));
 return {schema:'ltzzz.controller-paid-practice.v1',command_id,task_id,date,mode:'external',source_commit:sourceCommit,run_id:String(runId),
  status:'claimed_before_external_execution',purpose:'learn_public_API_boundary_regression_and_independent_quality_review',
  context:{source_commit:sourceCommit,input_sha256:practiceDigest(canonical(inputs)),ans_status:'controller_learning_practice'},inputs,external_runtime_order_id,
  max_usdc:'0.05',max_new_orders:1,paid:false,tx_hash:null,financial_execution:false,delivery_accepted:false,
  external_generation_attempts_this_run:0,review_generation_attempts_this_run:0,new_payments_this_run:0,
  native_openai_calls:0,native_anthropic_calls:0,independent_model_quorum_required:false,
  author_provider_verification:'external_provider_report_only_not_native_model_attestation'};
}
function decode(value){
 if(typeof value!=='string'||value.length>60000||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('bounded_x402_payload_required');
 return JSON.parse(Buffer.from(value,'base64').toString('utf8'));
}
// A deployment-owned adapter; the caller cannot choose another destination/body.
export function createPracticeFetch({date,context,fetcher=fetch,beforePaidAttempt=async()=>{},clock=Date.now}={}){
 const body=dailyHireBody(date,context),id=dailyHireId(date);let quoted=false,paid=false,accepted;
 return async(url,options={})=>{
  const h=new Headers(options.headers),signature=h.get('PAYMENT-SIGNATURE');
  if(url!==PROVIDER.url||options.method!=='POST'||options.redirect!=='error'||options.body!==body||h.get('Content-Type')!=='application/json')throw Error('fixed_practice_provider_request_required');
  const allowed=signature?['content-type','payment-signature','idempotency-key']:['content-type'];
  if([...h.keys()].some(k=>!allowed.includes(k)))throw Error('unexpected_practice_request_header');
  if(!signature){
   if(quoted||paid)throw Error('practice_quote_already_attempted');quoted=true;
   const response=await fetcher(url,options),quote=decode(response.headers.get('PAYMENT-REQUIRED'));
   accepted=paymentQuote(response.status,quote);return response;
  }
  if(!accepted||paid||h.get('Idempotency-Key')!==id)throw Error('one_bound_practice_payment_only');
  const payload=decode(signature),a=payload.payload?.authorization,now=Math.floor(clock()/1000);
  paymentQuote(402,{x402Version:payload.x402Version,accepts:[payload.accepted]});
  if(canonical(payload.accepted)!==canonical(accepted)||a?.from?.toLowerCase()!==TREASURY.toLowerCase()||a?.to?.toLowerCase()!==PROVIDER.payTo
    ||a.value!==accepted.amount||!/^0x[a-fA-F0-9]{64}$/.test(a.nonce||'')||!/^0x[a-fA-F0-9]{130}$/.test(payload.payload?.signature||'')
    ||!/^\d+$/.test(a.validAfter||'')||!/^\d+$/.test(a.validBefore||'')||Number(a.validAfter)>now||Number(a.validBefore)<=now||Number(a.validBefore)>now+120)throw Error('bound_short_lived_practice_authorization_required');
  paid=true;await beforePaidAttempt();return fetcher(url,options);
 };
}
export async function executePractice(record,{api,fetcher=fetch,callReviewer,reviewerConfigured,pulseReady,read,save,clock=Date.now,acceptedInputs=[]}={}){
 validatePracticeRecord(record);record.new_payments_this_run=0;record.external_generation_attempts_this_run=0;record.review_generation_attempts_this_run=0;
 const checkpoint=async()=>save(record),stop=async status=>{record.status=status;await checkpoint();return record;};
 // Reconcile the real remote slot first; no new quote/model/paid request yet.
 let remote;try{remote=await api('/market/procurement/daily?date='+record.date);}catch{return stop('blocked_remote_reconciliation_no_paid_attempt');}
 if(remote.order){
  try{assertOwnerOrderContext(remote.order,record);assertOwnerPayment(remote.order);}catch{
   record.existing_remote_order={id:remote.order.id||null,status:remote.order.status||null,paid:remote.order.paid===true,tx_hash:remote.order.tx_hash||null};
   return stop('existing_remote_order_not_reallocated_no_purchase');
  }
  record.order=remote.order;record.paid=remote.order.paid===true;record.tx_hash=remote.order.tx_hash||null;record.financial_execution=record.paid;await checkpoint();
 }else{
  // A previously started paid call with a missing remote reservation is unknown,
  // never permission to purchase again or mint a different nonce.
  if(record.paid_request_started_at||record.order||record.status==='paid_request_started_completion_unknown')return stop('blocked_original_reservation_missing_no_repurchase');
  if(acceptedInputs.includes(record.context.input_sha256))return stop('same_input_already_accepted_no_repurchase');
  if(record.inputs.some(x=>practiceDigest(read(x.path))!==x.sha256))return stop('blocked_practice_inputs_changed_no_payment');
 }
 const restricted=createPracticeFetch({date:record.date,context:record.context,fetcher,clock,beforePaidAttempt:async()=>{
  if(record.paid_request_started_at)throw Error('practice_paid_request_already_started');
  record.paid_request_started_at=new Date(clock()).toISOString();record.status='paid_request_started_completion_unknown';await checkpoint();
 }});
 try{
  await executeDailyHire(record,{api,reviewerConfigured,pulseReady,save:checkpoint,callReviewer,relay:async()=>{
   const r=await externalAIRelay('',{date:record.date,context:record.context,existingOnly:!!record.order,fetcher:restricted,
    api:(path,{body}={})=>api(path,body)});
   if(r.order){assertOwnerOrderContext(r.order,record);assertOwnerPayment(r.order);}return r;
  }});
  if(record.order)assertOwnerPayment(record.order);
  record.financial_execution=record.paid===true;record.delivery_accepted=record.order?.delivery_accepted===true;
  record.reviewer_provider=record.order?.independent_review?.executed_by||null;
  record.reviewer_model=record.order?.independent_review?.model||null;
  record.author_provider_reported=record.order?.model_reported||null;
  // This is a learning artifact; no claim that a candidate defect was reproduced.
  record.production_deployment_verified=false;record.independently_reproduced_new_issues=0;
  await checkpoint();return record;
 }catch(e){record.last_error=/^[A-Za-z0-9_]+$/.test(e.message)?e.message:'practice_executor_error_not_exported';return stop('blocked_practice_reconcile_no_retry');}
}
