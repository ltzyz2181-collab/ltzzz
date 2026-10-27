// Trusted cloud executor library. No HTTP routes, credentials, keys or live defaults.
import {createHash} from 'node:crypto';
import {evaluateSmallPayment} from './small-payment-policy.mjs';
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
export const initialSmallPaymentState=()=>({schema:KEY,switch_enabled:false,frozen:false,freeze_reason:null,operations:{},events:[]});
const safeError=e=>/^[a-z0-9_]+$/i.test(e?.message||'')?e.message:'executor_failure_details_not_exported';
const blocked=reason=>({status:'blocked_no_execution',reason,execution_attempted:false});

// All callbacks are deployment-owned capabilities, never requester-supplied functions.
// store.transaction must be serializable across workers and durable before returning.
export function createSmallPaymentService({policy,release_sha256,store,loadBudgetEvidence,authenticateController,authenticateAuditor,verifyPolicyActivation,execute,verifySettlement,verifyAudit,scheduleAudit,clock=Date.now}={}){
 policy=structuredClone(policy);
 let locallyHalted=false;
 const get=async tx=>{
  const s=await tx.get(KEY);
  if(!s||s.schema!==KEY||typeof s.switch_enabled!=='boolean'||typeof s.frozen!=='boolean'||!s.operations||Array.isArray(s.operations)||!Array.isArray(s.events))throw Error('durable_payment_state_required');
  for(const [id,o] of Object.entries(s.operations)){
   if(!o||o.request?.payment_id!==id||o.history?.payment_id!==id||!Number.isFinite(Date.parse(o.receipt_due_at))||!Number.isFinite(Date.parse(o.audit_due_at)))throw Error('durable_payment_operation_invalid');
  }
  return s;
 };
 const history=s=>Object.values(s.operations).map(o=>o.history);
 async function freeze(reason,paymentId){
  locallyHalted=true;
  return store.transaction(async tx=>{
   const s=await get(tx);s.switch_enabled=false;s.frozen=true;s.freeze_reason=reason;
   s.events.push({kind:'payment_switch_disabled',reason,payment_id:paymentId||null,at_utc:new Date(clock()).toISOString()});
   await tx.put(KEY,s);return {status:'payment_switch_disabled',reason,freeze_persisted:true};
  });
 }
 async function active(context){
  if(locallyHalted||policy?.enabled!==true||!HASH.test(release_sha256||'')||typeof verifyPolicyActivation!=='function')return false;
  const a=await verifyPolicyActivation({policy:structuredClone(policy),release_sha256,context});
  return a?.verified===true&&a.policy_sha256===smallPaymentDigest(policy)&&a.release_sha256===release_sha256&&Array.isArray(a.review_providers)&&a.review_providers.every(p=>PROVIDERS.has(p))&&a.review_providers.includes('anthropic')&&new Set(a.review_providers).size>=2;
 }
 function normalizedReceipt(receipt,op){
  if(!receipt||typeof receipt!=='object'||!Object.hasOwn(receipt,'paid')||typeof receipt.paid!=='boolean'||!Object.hasOwn(receipt,'tx_hash')||!Object.hasOwn(receipt,'provider_receipt_id')||receipt.payment_id!==op.request.payment_id||receipt.amount_raw!==op.request.amount_raw||receipt.currency!=='USDC'||receipt.recipient_key!==op.history.recipient_key||receipt.purpose_id!==op.request.purpose_id||!HASH.test(receipt.evidence_sha256||''))throw Error('payment_receipt_identity_or_explicit_fields_missing');
  if(receipt.paid!==true||receipt.status!=='confirmed'||!TX.test(receipt.tx_hash||'')||receipt.provider_receipt_id!==null)throw Error('payment_receipt_not_verified_confirmed');
  return receipt;
 }
 return {
  async submit({request,context}={}){
   let op,paymentId,permit,invoked=false;
   try{
    request=structuredClone(request); // freeze caller intent before the first await
    if(!await active(context))return blocked('payment_policy_disabled_or_two_independent_reviews_missing');
    if(!store||typeof store.transaction!=='function'||typeof authenticateController!=='function'||typeof loadBudgetEvidence!=='function'||typeof execute!=='function'||typeof verifySettlement!=='function'||typeof scheduleAudit!=='function')return blocked('required_authenticated_executor_capability_missing');
    const actor=await authenticateController(context);
    if(actor?.verified!==true||actor.controller_id!==request?.controller_id)return blocked('authenticated_controller_identity_required');
    const budgetProof=await loadBudgetEvidence({controller_id:actor.controller_id,rail:request?.rail,purpose_id:request?.purpose_id});
    // Strict schema validation occurs before indexing the durable operation map.
    const preflight=evaluateSmallPayment({request,policy,context:{now:clock(),budgetProof,history:[]}});
    if(!preflight.allow)return {status:'policy_rejected',decision:preflight,execution_attempted:false};
    paymentId=request.payment_id;
    const reserved=await store.transaction(async tx=>{
     const s=await get(tx);
     if(s.frozen||!s.switch_enabled)return {blocked:'payment_switch_disabled'};
     const old=Object.hasOwn(s.operations,paymentId)?s.operations[paymentId]:null;
     if(old){
      if(old.request_sha256!==smallPaymentDigest(request)){
       s.switch_enabled=false;s.frozen=true;s.freeze_reason='payment_id_reused_with_different_intent';
       s.events.push({kind:'payment_switch_disabled',reason:s.freeze_reason,payment_id:paymentId,at_utc:new Date(clock()).toISOString()});
       await tx.put(KEY,s);return {blocked:s.freeze_reason};
      }
      return {existing:old};
     }
     const now=clock(),decision=evaluateSmallPayment({request,policy,context:{now,budgetProof,history:history(s)}});
     if(!decision.allow)return {decision};
     const payee=policy.payees.find(p=>p.id===request.payee_id);
     const row={payment_id:paymentId,controller_id:request.controller_id,payee_id:request.payee_id,recipient_key:decision.recipient_key,purpose_group:decision.purpose_group,amount_raw:request.amount_raw,rail:request.rail,budget_id:budgetProof.budget_id,status:'reserved',at_utc:new Date(now).toISOString()};
     op={request,request_sha256:smallPaymentDigest(request),history:row,status:'reserved_before_execution',budget_source_ref:budgetProof.source_ref,budget_evidence_sha256:budgetProof.evidence_sha256,receipt_due_at:new Date(now+60000).toISOString(),audit_due_at:new Date(now+3600000).toISOString(),receipt:null,audit:null,execution_attempted:false};
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
     if(s.frozen||!s.switch_enabled||o.status!=='reserved_before_execution')return false;
     const decision=evaluateSmallPayment({request,policy,context:{now:clock(),budgetProof,history:history(s).filter(r=>r.payment_id!==paymentId)}});
     if(!decision.allow)throw Error('policy_changed_or_budget_proof_expired_before_execution');
     o.status='dispatched_outcome_unknown';o.history.status='submitted';o.execution_attempted=true;await tx.put(KEY,s);return true;
    });
    if(!ready)return blocked('payment_switch_changed_before_execution');
    permit=mintPermit(request,reserved.payee,clock());invoked=true;
    const result=await execute({request:structuredClone(request),recipient:reserved.payee.address,operation_id:paymentId,permit});
    const receipt=await verifySettlement({request:structuredClone(op.request),execution_result:result,expected_recipient_key:op.history.recipient_key});
    normalizedReceipt(receipt,op);
    await store.transaction(async tx=>{
     const s=await get(tx),o=s.operations[paymentId];o.receipt=structuredClone(receipt);o.status='paid_pending_independent_audit';o.history.status='paid';await tx.put(KEY,s);
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
     const s=await get(tx),o=s.operations[payment_id];o.audit=structuredClone(a);o.status=a.verdict==='approve'?'paid_audited':'paid_audit_anomaly';
     if(a.verdict==='anomaly'){
      s.switch_enabled=false;s.frozen=true;s.freeze_reason='independent_audit_anomaly';
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
    const overdue=Object.values(s.operations).filter(o=>(!o.receipt&&Date.parse(o.receipt_due_at)<=now)||(!o.audit&&Date.parse(o.audit_due_at)<=now));
    if(overdue.length){
     locallyHalted=true;s.switch_enabled=false;s.frozen=true;s.freeze_reason=overdue.some(o=>!o.receipt)?'receipt_deadline_missed':'post_payment_audit_deadline_missed';
     s.events.push({kind:'automatic_freeze',reason:s.freeze_reason,payment_ids:overdue.map(o=>o.request.payment_id),at_utc:new Date(now).toISOString()});await tx.put(KEY,s);
    }
    return {status:s.frozen?'payment_switch_disabled':'no_overdue_receipt_or_audit',frozen:s.frozen};
   });
  },
  async status(){return store.transaction(async tx=>{const s=await get(tx);return {switch_enabled:s.switch_enabled,frozen:s.frozen,freeze_reason:s.freeze_reason,operations:Object.values(s.operations).map(o=>({payment_id:o.request.payment_id,status:o.status,execution_attempted:o.execution_attempted}))};});}
 };
}
