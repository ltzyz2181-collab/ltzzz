// Trusted cloud executor library. No HTTP routes, credentials, keys or live defaults.
import {createHash} from 'node:crypto';
import {evaluateSmallPayment} from './small-payment-policy.mjs';
import {verifySmallPaymentActivation,verifySmallPaymentAnomaly,paymentPolicyDigest,paymentActivationSubject,paymentActivationMatches,PAYMENT_COOLDOWN_MS} from './small-payment-authorization.mjs';
import {freezePaymentState,paymentLifecycleCommand,activationRecord,publicActivationBytes,publicActivationReadback,lifecycleAllowsPayment} from './small-payment-lifecycle.mjs';
const KEY='ltzzz.small-payment-state.v1', HASH=/^[a-f0-9]{64}$/, TX=/^0x[a-fA-F0-9]{64}$/;
const PROVIDERS=new Set(['anthropic','aliyun_dashscope','volcengine_ark','deepseek','xai','openai','moonshot']);
const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
export const smallPaymentDigest=x=>createHash('sha256').update(canonical(x)).digest('hex');
const permits=new WeakMap();
function mintPermit(request,payee,now){
 const permit=Object.freeze({});
 permits.set(permit,{payment_id:request.payment_id,recipient:payee.address.toLowerCase(),amount_raw:request.amount_raw,purpose_id:request.purpose_id,rail:request.rail,issued:now,expires:now+30000});
 return permit;
}
export function consumeSmallPaymentPermit(permit,{recipient,amount_raw,purpose_id,rail,now=Date.now()}={}){
 const p=permit&&permits.get(permit);
 if(!p)throw Error('small_payment_runtime_permit_required');
 permits.delete(permit); // consumed even on mismatch; cannot replay or serialize this capability
 if(p.recipient!==String(recipient).toLowerCase()||p.amount_raw!==String(amount_raw)||p.purpose_id!==purpose_id||p.rail!==rail||!Number.isSafeInteger(now)||now<p.issued||now>=p.expires)throw Error('small_payment_runtime_permit_mismatch');
 return p.payment_id;
}
export const initialSmallPaymentState=()=>({schema:KEY,switch_enabled:false,frozen:false,freeze_reason:null,freeze_sequence:0,release_history:[],activation:null,pending_activation:null,operations:{},events:[]});
const safeError=e=>/^[a-z0-9_]+$/i.test(e?.message||'')?e.message:'executor_failure_details_not_exported';
const blocked=reason=>({status:'blocked_no_execution',reason,execution_attempted:false});

// All callbacks are deployment-owned capabilities, never requester-supplied functions.
// store.transaction must be serializable across workers and durable before returning.
export function createSmallPaymentService({policy,release_sha256,store,loadBudgetEvidence,authenticateController,authenticateAuditor,activationAuthority,loadActivationEvidence,publishActivation,readPublicActivation,execute,verifySettlement,verifyAudit,scheduleAudit,clock=Date.now}={}){
 policy=structuredClone(policy);activationAuthority=structuredClone(activationAuthority);
 let locallyHalted=false;
 const get=async tx=>{
  const s=await tx.get(KEY);
  if(!s||s.schema!==KEY||typeof s.switch_enabled!=='boolean'||typeof s.frozen!=='boolean'||!s.operations||Array.isArray(s.operations)||!Array.isArray(s.events)||!Number.isSafeInteger(s.freeze_sequence)||s.freeze_sequence<0||!Array.isArray(s.release_history)||s.release_history.some(h=>!HASH.test(h))||new Set(s.release_history).size!==s.release_history.length||!Object.hasOwn(s,'activation')||!Object.hasOwn(s,'pending_activation'))throw Error('durable_payment_state_required');
  const ordinals=new Set(),operationCount=Object.keys(s.operations).length;
  for(const [id,o] of Object.entries(s.operations)){
   if(!o||!Number.isSafeInteger(o.ordinal)||o.ordinal<1||o.ordinal>operationCount||ordinals.has(o.ordinal)||!HASH.test(o.activation_sha256||'')||o.request?.payment_id!==id||o.history?.payment_id!==id||!Number.isFinite(Date.parse(o.receipt_due_at))||!Number.isFinite(Date.parse(o.audit_due_at)))throw Error('durable_payment_operation_invalid');
   ordinals.add(o.ordinal);
  }
  return s;
 };
 const history=s=>Object.values(s.operations).map(o=>o.history);
 async function freeze(reason,paymentId){
  locallyHalted=true;
  return store.transaction(async tx=>{
   const s=await get(tx);freezePaymentState(s,reason,clock());
   s.events.push({kind:'payment_switch_disabled',reason,payment_id:paymentId||null,at_utc:new Date(clock()).toISOString()});
   await tx.put(KEY,s);return {status:'payment_switch_disabled',reason,freeze_persisted:true};
  });
 }
 function freezeOverdue(s,now,trigger){
  const overdue=Object.values(s.operations).filter(o=>(!o.receipt&&Date.parse(o.receipt_due_at)<=now)||(!o.audit&&Date.parse(o.audit_due_at)<=now));
  if(!overdue.length)return false;
  locallyHalted=true;freezePaymentState(s,overdue.some(o=>!o.receipt)?'receipt_deadline_missed':'post_payment_audit_deadline_missed',now);
  s.events.push({kind:'automatic_freeze',trigger,reason:s.freeze_reason,payment_ids:overdue.map(o=>o.request.payment_id),at_utc:new Date(now).toISOString()});return true;
 }
 async function active(context){
  if(locallyHalted||policy?.enabled!==true||!HASH.test(release_sha256||'')||typeof loadActivationEvidence!=='function')return null;
  try{const s=await store.transaction(async tx=>structuredClone(await get(tx)));if(!lifecycleAllowsPayment(s,{policy,release_sha256,authority:activationAuthority,now:clock()}))return null;const proof=verifySmallPaymentActivation({policy,release_sha256,authority:activationAuthority,command:s.activation.command,evidence:await loadActivationEvidence({...context,command:s.activation.command}),now:clock()});return {proof,command:s.activation.command,activation_sha256:s.activation.sha256};}catch{return null;}
 }
 function normalizedReceipt(receipt,op){
  if(!receipt||typeof receipt!=='object'||!Object.hasOwn(receipt,'paid')||typeof receipt.paid!=='boolean'||!Object.hasOwn(receipt,'tx_hash')||!Object.hasOwn(receipt,'provider_receipt_id')||receipt.payment_id!==op.request.payment_id||receipt.amount_raw!==op.request.amount_raw||receipt.currency!=='USDC'||receipt.recipient_key!==op.history.recipient_key||receipt.purpose_id!==op.request.purpose_id||!HASH.test(receipt.evidence_sha256||''))throw Error('payment_receipt_identity_or_explicit_fields_missing');
  if(receipt.paid!==true||receipt.status!=='confirmed'||!TX.test(receipt.tx_hash||'')||receipt.provider_receipt_id!==null)throw Error('payment_receipt_not_verified_confirmed');
  return receipt;
 }
 return {
  async lifecycleProposal({kind,target_stage}={}){
   const s=await store.transaction(async tx=>structuredClone(await get(tx)));
   if(s.pending_activation?.record.command.kind===kind&&s.pending_activation.record.command.target_stage===target_stage&&s.pending_activation.freeze_sequence===s.freeze_sequence)return structuredClone(s.pending_activation.record.command);
   return paymentLifecycleCommand(s,{kind,target_stage},{policy,release_sha256,authority:activationAuthority,now:clock()});
  },
  async activate({command,evidence}={}){
   let pending;
   try{
    command=structuredClone(command);evidence=structuredClone(evidence);
    if(policy?.enabled!==true||typeof publishActivation!=='function'||typeof readPublicActivation!=='function')return blocked('payment_disabled_or_publication_adapter_missing');
    const proof=verifySmallPaymentActivation({policy,release_sha256,authority:activationAuthority,command,evidence,now:clock()});
    const reserved=await store.transaction(async tx=>{
     const s=await get(tx);
     if(freezeOverdue(s,clock(),'activation')){await tx.put(KEY,s);return {blocked:s.freeze_reason};}
     if(s.activation?.release_sha256===release_sha256&&s.activation.policy_sha256===paymentPolicyDigest(policy)&&s.activation.authority_sha256===paymentPolicyDigest(activationAuthority)&&smallPaymentDigest(s.activation.command)===smallPaymentDigest(command)&&!s.frozen)return {existing:s.activation};
     if(s.pending_activation&&smallPaymentDigest(s.pending_activation.record.command)===smallPaymentDigest(command)){
      if(s.freeze_sequence!==command.freeze_sequence)throw Error('freeze_changed_during_activation');
      if(smallPaymentDigest(s.pending_activation.record.subject)!==smallPaymentDigest(paymentActivationSubject({policy,release_sha256,authority:activationAuthority,command})))throw Error('pending_activation_subject_changed');
      return {pending:s.pending_activation};
     }
     if(s.pending_activation&&!(s.frozen&&command.kind==='unfreeze'))throw Error('different_activation_already_reserved');
     const expected=paymentLifecycleCommand(s,command,{policy,release_sha256,authority:activationAuthority,now:clock()});
     if(smallPaymentDigest(command)!==smallPaymentDigest(expected))throw Error('exact_current_lifecycle_command_required');
     const record=activationRecord({policy,release_sha256,authority:activationAuthority,command,evidence,now:clock()});
     const p={record,sha256:paymentPolicyDigest(record),freeze_sequence:s.freeze_sequence};
     s.pending_activation=p;s.switch_enabled=false;await tx.put(KEY,s);return {pending:p};
    });
    if(reserved.blocked)return blocked(reserved.blocked);
    if(reserved.existing)return {status:'existing_public_activation_no_new_cooldown',activation_sha256:reserved.existing.sha256,ready_at:reserved.existing.ready_at,execution_attempted:false};
    pending=reserved.pending;
    const bytes=publicActivationBytes(pending.record),publication=await publishActivation({record:structuredClone(pending.record),content:bytes,record_sha256:pending.sha256});
    const readback=await readPublicActivation(publication);
    const confirmed=publicActivationReadback(publication,readback,bytes);
    const result=await store.transaction(async tx=>{
     const s=await get(tx),now=clock();
     if(s.pending_activation?.sha256!==pending.sha256||s.freeze_sequence!==command.freeze_sequence)throw Error('freeze_changed_during_activation');
     if(!paymentActivationMatches(proof,{policy,release_sha256,command,now}))throw Error('native_reviews_expired_during_publication');
     const a={record:pending.record,sha256:pending.sha256,command,release_sha256,
      policy_sha256:paymentPolicyDigest(policy),authority_sha256:paymentPolicyDigest(activationAuthority),
      publication:confirmed,public_confirmed_at:now,ready_at:now+PAYMENT_COOLDOWN_MS};
     s.activation=a;s.pending_activation=null;s.switch_enabled=true;s.frozen=false;s.freeze_reason=null;s.freeze_release_sha256=null;
     if(!s.release_history.includes(release_sha256))s.release_history.push(release_sha256);
     s.events.push({kind:'dual_signed_activation_publicly_confirmed',activation_sha256:a.sha256,release_sha256,stage:command.target_stage,
      freeze_sequence:s.freeze_sequence,at_utc:new Date(now).toISOString(),not_before_utc:new Date(a.ready_at).toISOString()});
     await tx.put(KEY,s);return a;
    });
    locallyHalted=false;
    return {status:'activation_published_cooling',activation_sha256:result.sha256,ready_at:result.ready_at,stage:command.target_stage,execution_attempted:false};
   }catch(e){
    if(pending)locallyHalted=true;
    return {status:pending?'activation_reserved_publication_pending':'blocked_no_execution',reason:safeError(e),execution_attempted:false};
   }
  },
  async reportAnomaly({report}={}){
   try{
    report=structuredClone(report);
    const snapshot=await store.transaction(async tx=>structuredClone(await get(tx)));
    const digest=snapshot.activation?.sha256??paymentPolicyDigest(null);
    const verified=verifySmallPaymentAnomaly({policy,release_sha256,authority:activationAuthority,activation_sha256:digest,freeze_sequence:snapshot.freeze_sequence,report,now:clock()});
    const result=await store.transaction(async tx=>{
     const s=await get(tx);
     if((s.activation?.sha256??paymentPolicyDigest(null))!==digest||s.freeze_sequence!==snapshot.freeze_sequence)throw Error('anomaly_state_changed_retry_verification');
     freezePaymentState(s,'signed_model_anomaly',clock());s.freeze_release_sha256=release_sha256;
     s.events.push({kind:'signed_model_anomaly',...verified,report,at_utc:new Date(clock()).toISOString()});
     await tx.put(KEY,s);return {status:'payment_switch_disabled',freeze_persisted:true,freeze_sequence:s.freeze_sequence};
    });
    locallyHalted=true;return result;
   }catch(e){return {...blocked(safeError(e)),freeze_persisted:false};}
  },
  async submit({request,context}={}){
   let op,paymentId,permit,invoked=false;
   try{
    request=structuredClone(request); // freeze caller intent before the first await
    const activation=await active(context);
    const activationProof=activation?.proof,activationCommand=activation?.command;
    if(!activationProof)return blocked('payment_disabled_cooling_unpublished_or_native_signatures_missing');
    if(!store||typeof store.transaction!=='function'||typeof authenticateController!=='function'||typeof loadBudgetEvidence!=='function'||typeof execute!=='function'||typeof verifySettlement!=='function'||typeof scheduleAudit!=='function')return blocked('required_authenticated_executor_capability_missing');
    const actor=await authenticateController(context);
    if(actor?.verified!==true||actor.controller_id!==request?.controller_id)return blocked('authenticated_controller_identity_required');
    const budgetProof=await loadBudgetEvidence({controller_id:actor.controller_id,rail:request?.rail,purpose_id:request?.purpose_id});
    // Strict schema validation occurs before indexing the durable operation map.
    const preflight=evaluateSmallPayment({request,policy,context:{now:clock(),budgetProof,history:[],activationProof,activationCommand,release_sha256}});
    if(!preflight.allow)return {status:'policy_rejected',decision:preflight,execution_attempted:false};
    paymentId=request.payment_id;
    const reserved=await store.transaction(async tx=>{
     const s=await get(tx);
     if(freezeOverdue(s,clock(),'reservation')){await tx.put(KEY,s);return {blocked:s.freeze_reason};}
     if(!lifecycleAllowsPayment(s,{policy,release_sha256,authority:activationAuthority,now:clock()})||s.activation.sha256!==activation.activation_sha256)return {blocked:'payment_switch_disabled'};
     const old=Object.hasOwn(s.operations,paymentId)?s.operations[paymentId]:null;
     if(old){
      if(old.request_sha256!==smallPaymentDigest(request)){
       freezePaymentState(s,'payment_id_reused_with_different_intent',clock());
       s.events.push({kind:'payment_switch_disabled',reason:s.freeze_reason,payment_id:paymentId,at_utc:new Date(clock()).toISOString()});
       await tx.put(KEY,s);return {blocked:s.freeze_reason};
      }
      return {existing:old};
     }
     const now=clock(),decision=evaluateSmallPayment({request,policy,context:{now,budgetProof,history:history(s),activationProof,activationCommand,release_sha256}});
     if(!decision.allow)return {decision};
     const payee=policy.payees.find(p=>p.id===request.payee_id);
     const row={payment_id:paymentId,controller_id:request.controller_id,payee_id:request.payee_id,recipient_key:decision.recipient_key,purpose_group:decision.purpose_group,amount_raw:request.amount_raw,rail:request.rail,budget_id:budgetProof.budget_id,status:'reserved',at_utc:new Date(now).toISOString()};
     op={ordinal:Object.keys(s.operations).length+1,activation_sha256:s.activation.sha256,request,request_sha256:smallPaymentDigest(request),history:row,status:'reserved_before_execution',budget_source_ref:budgetProof.source_ref,budget_evidence_sha256:budgetProof.evidence_sha256,receipt_due_at:new Date(now+60000).toISOString(),audit_due_at:new Date(now+3600000).toISOString(),receipt:null,audit:null,execution_attempted:false};
     s.operations[paymentId]=op;await tx.put(KEY,s);return {op,payee};
    });
    if(reserved.blocked)return blocked(reserved.blocked);
    if(reserved.existing)return {status:'existing_operation_reconcile_only',payment_id:paymentId,operation_status:reserved.existing.status,execution_attempted:false,automatic_retry:false};
    if(reserved.decision)return {status:'policy_rejected',decision:reserved.decision,execution_attempted:false};
    op=reserved.op;
    // Durable alarm acknowledgement must precede the external side effect.
    const alarm=await scheduleAudit({payment_id:paymentId,receipt_due_at:op.receipt_due_at,audit_due_at:op.audit_due_at});
    if(alarm?.durable!==true||alarm.payment_id!==paymentId||alarm.receipt_due_at!==op.receipt_due_at||alarm.audit_due_at!==op.audit_due_at)throw Error('durable_audit_alarm_not_acknowledged');
    const ready=await store.transaction(async tx=>{
     const s=await get(tx),o=s.operations[paymentId];
     if(freezeOverdue(s,clock(),'before_dispatch')){await tx.put(KEY,s);return false;}
     if(!lifecycleAllowsPayment(s,{policy,release_sha256,authority:activationAuthority,now:clock()})||s.activation.sha256!==activation.activation_sha256||o.status!=='reserved_before_execution')return false;
     const decision=evaluateSmallPayment({request,policy,context:{now:clock(),budgetProof,history:history(s).filter(r=>r.payment_id!==paymentId),activationProof,activationCommand,release_sha256}});
     if(!decision.allow)throw Error('policy_changed_or_budget_proof_expired_before_execution');
     o.status='dispatched_outcome_unknown';o.history.status='submitted';o.execution_attempted=true;await tx.put(KEY,s);return true;
    });
    if(!ready)return blocked('payment_switch_changed_before_execution');
    permit=mintPermit(request,reserved.payee,clock());invoked=true;
    const result=await execute({request:structuredClone(request),recipient:reserved.payee.address,operation_id:paymentId,permit});
    // Preserve the public submission hash even if independent settlement fails.
    // This is not a paid/confirmed claim and must never enable automatic retry.
    const submittedHash=result?.hash??result?.tx_hash;
    if(TX.test(submittedHash||''))await store.transaction(async tx=>{
     const s=await get(tx);s.operations[paymentId].submitted_tx_hash=submittedHash;await tx.put(KEY,s);
    });
    const receipt=await verifySettlement({request:structuredClone(op.request),execution_result:result,expected_recipient_key:op.history.recipient_key});
    normalizedReceipt(receipt,op);
    await store.transaction(async tx=>{
     const s=await get(tx),o=s.operations[paymentId];
     if(Object.values(s.operations).some(other=>other.request.payment_id!==paymentId&&other.receipt?.tx_hash?.toLowerCase()===receipt.tx_hash.toLowerCase()))throw Error('settlement_transaction_already_claimed');
     o.receipt=structuredClone(receipt);o.receipt_verified_at=new Date(clock()).toISOString();o.status='paid_pending_independent_audit';o.history.status='paid';
     // Late confirmations cannot inherit an expired reservation's old window.
     o.history.at_utc=new Date(clock()).toISOString();await tx.put(KEY,s);
    });
    return {status:'paid_pending_independent_audit',payment_id:paymentId,paid:receipt.paid,tx_hash:receipt.tx_hash,execution_attempted:true,automatic_retry:false};
   }catch(e){
    if(op){
     locallyHalted=true;
     try{
      await store.transaction(async tx=>{
       const s=await get(tx),o=s.operations[paymentId];
       if(o){o.status='unknown_reconcile_no_retry';o.history.status='unknown';o.error_code=safeError(e);}await tx.put(KEY,s);
      });
      await freeze('execution_or_receipt_missing_or_abnormal',paymentId);
     }catch{return {status:'durable_state_unavailable_reconcile_only',freeze_persisted:false,reason:safeError(e),execution_attempted:invoked,automatic_retry:false};}
    }
    return {status:op?'frozen_unknown_reconcile_no_retry':'blocked_no_execution',reason:safeError(e),execution_attempted:invoked,automatic_retry:false};
   }finally{if(permit)permits.delete(permit);}
  },
  async audit({payment_id,observation,context}={}){
   // Invalid or unauthenticated public input cannot freeze the service (DoS).
   if(typeof authenticateAuditor!=='function')return blocked('authenticated_auditor_required');
   let auditor;
   try{auditor=await authenticateAuditor(context);}catch{return blocked('authenticated_auditor_required');}
   if(auditor?.verified!==true)return blocked('authenticated_auditor_required');
   try{
    const snapshot=await store.transaction(async tx=>structuredClone(await get(tx)));
    const op=Object.hasOwn(snapshot.operations,payment_id)?snapshot.operations[payment_id]:null;
    if(!op)return blocked('existing_payment_required');
    if(!op.receipt)return await freeze('audit_payment_receipt_missing',payment_id);
    normalizedReceipt(op.receipt,op);
    if(typeof verifyAudit!=='function')return await freeze('independent_audit_verifier_missing',payment_id);
    const a=await verifyAudit({operation:op,observation,auditor});
    if(a?.verified!==true||a.payment_id!==payment_id||a.receipt_sha256!==smallPaymentDigest(op.receipt)||a.independent_of_controller!==true||a.independent_of_payee!==true||!PROVIDERS.has(a.actual_provider)||!['approve','anomaly'].includes(a.verdict)||!HASH.test(a.evidence_sha256||''))throw Error('bound_independent_audit_required');
    await store.transaction(async tx=>{
     const s=await get(tx),o=s.operations[payment_id];o.audit=structuredClone(a);o.audit_verified_at=new Date(clock()).toISOString();
     s.events.push({kind:'independent_payment_audit_recorded',payment_id,verdict:a.verdict,actual_provider:a.actual_provider,receipt_sha256:a.receipt_sha256,evidence_sha256:a.evidence_sha256,at_utc:o.audit_verified_at});if(a.verdict==='anomaly')o.audit_was_anomalous=true;o.status=a.verdict==='approve'?'paid_audited':'paid_audit_anomaly';
     if(a.verdict==='anomaly'){
      freezePaymentState(s,'independent_audit_anomaly',clock());
      s.events.push({kind:'payment_switch_disabled',reason:s.freeze_reason,payment_id,at_utc:new Date(clock()).toISOString()});
     }
     await tx.put(KEY,s);
    });
    return {status:a.verdict==='approve'?'paid_audited':'payment_switch_disabled',payment_id};
   }catch(e){
    try{await freeze('audit_missing_or_invalid',payment_id);return {status:'payment_switch_disabled',reason:safeError(e)};}
    catch{locallyHalted=true;return {status:'durable_state_unavailable_reconcile_only',freeze_persisted:false};}
   }
  },
  async alarm(){
   const now=clock();
   return store.transaction(async tx=>{
    const s=await get(tx);
    if(freezeOverdue(s,now,'alarm'))await tx.put(KEY,s);
    return {status:s.frozen?'payment_switch_disabled':'no_overdue_receipt_or_audit',frozen:s.frozen};
   });
  },
  async status(){return store.transaction(async tx=>{const s=await get(tx);return {switch_enabled:s.switch_enabled,frozen:s.frozen,freeze_reason:s.freeze_reason,freeze_sequence:s.freeze_sequence,activation_sha256:s.activation?.sha256??null,stage:s.activation?.command.target_stage??null,ready_at:s.activation?.ready_at??null,operations:Object.values(s.operations).map(o=>({payment_id:o.request.payment_id,status:o.status,execution_attempted:o.execution_attempted}))};});}
 };
}
