// SYNTHETIC offline fixtures. Not a real budget, payee, review, payment or signature.
import {initialSmallPaymentState,consumeSmallPaymentPermit,smallPaymentDigest,createSmallPaymentService} from '../lib/small-payment-runtime.mjs';
import {activationRecord,publicActivationReadback,publicActivationBytes,activationPath} from '../lib/small-payment-lifecycle.mjs';
import {paymentPolicyDigest,PAYMENT_COOLDOWN_MS} from '../lib/small-payment-authorization.mjs';
import {signatureFixture} from './small-payment-signature-fixture.mjs';
export const NOW=Date.parse('2026-10-27T03:00:00Z');
export const ADDRESS_A='0x1111111111111111111111111111111111111111';
export const ADDRESS_B='0x2222222222222222222222222222222222222222';
export const H='a'.repeat(64), RELEASE='b'.repeat(64), TX='0x'+'c'.repeat(64);
export function fixture(){
 const policy={schema:'ltzzz.small-payment.policy.v1',enabled:true,currency:'USDC',decimals:6,timezone:'Asia/Shanghai',
  controllers:[{id:'gpt',operator_id:'owner-a',verified:true,control_verified:true,rails:['base_usdc']},{id:'backup',operator_id:'owner-b',verified:true,control_verified:true,rails:['base_usdc']}],
  payees:[{id:'vendor-a',operator_id:'vendor-independent-a',address:ADDRESS_A,verified:true,control_verified:true,controlled_by:[],rails:['base_usdc'],purpose_ids:['software','software-alias']},{id:'vendor-alias',operator_id:'vendor-independent-a',address:ADDRESS_A.toUpperCase().replace('0X','0x'),verified:true,control_verified:true,controlled_by:[],rails:['base_usdc'],purpose_ids:['software','software-alias']},{id:'vendor-b',operator_id:'vendor-independent-b',address:ADDRESS_B,verified:true,control_verified:true,controlled_by:[],rails:['base_usdc'],purpose_ids:['software']}],
  purposes:[{id:'software',group:'software',verified:true},{id:'software-alias',group:'software',verified:true}],
  registered_budget_ids:['test-budget'],independent_reviews:{required_providers:['aliyun_dashscope','volcengine_ark']}};
 const budgetProof={schema:'ltzzz.small-payment.budget-proof.v1',status:'registered',budget_id:'test-budget',currency:'USDC',decimals:6,controller_ids:['gpt','backup'],rails:['base_usdc'],purpose_groups:['software'],verification_kind:'authenticated_budget_limits',source_ref:'fixture:registered-budget-not-real',evidence_sha256:H,verified_at:'2026-10-26T00:00:00Z',valid_until:'2026-11-03T00:00:00Z',limits_single_raw:'19999999',limits_daily_raw:'50000000',limits_weekly_raw:'100000000',verified_single_raw:'10000000',verified_daily_raw:'30000000',verified_weekly_raw:'60000000',owner_absolute_single_raw:'20000000',owner_absolute_daily_raw:'50000000',owner_absolute_weekly_raw:'100000000'};
 return {policy,budgetProof,request:{payment_id:'PAY-TEST-1',controller_id:'gpt',payee_id:'vendor-a',purpose_id:'software',amount_raw:'1000000',rail:'base_usdc'},context:{now:NOW,history:[]}};
}
export function history(overrides={}){return {payment_id:'PAY-OLD-1',controller_id:'backup',payee_id:'vendor-alias',recipient_key:'base_usdc:'+ADDRESS_A,purpose_group:'software',amount_raw:'10000000',rail:'base_usdc',budget_id:'test-budget',status:'paid',at_utc:'2026-10-27T02:00:00Z',...overrides};}
export function memoryStore(state){
 let saved=structuredClone(state),tail=Promise.resolve();
 return {read:()=>structuredClone(saved),transaction(fn){const p=tail.then(async()=>{let draft=structuredClone(saved);const result=await fn({get:async()=>draft,put:async(_k,v)=>{draft=structuredClone(v);}});saved=draft;return result;});tail=p.catch(()=>{});return p;}};
}
export function runtimeFixture(overrides={}){
 const f=fixture(),state=initialSmallPaymentState();state.switch_enabled=true;
 const signatures=signatureFixture({policy:f.policy,release_sha256:RELEASE,now:NOW});
 // Older payment-behavior regressions seed an already cooled, full-stage SYNTHETIC state.
 // Lifecycle tests separately exercise all real transitions from a default-off store.
 const command={schema:'ltzzz.small-payment.lifecycle-command.v1',kind:'promote',target_stage:3,previous_activation_sha256:H,freeze_sequence:0,qualification_sha256:H};
 const record=activationRecord({policy:f.policy,release_sha256:RELEASE,authority:signatures.authority,command,evidence:signatures.makeEvidence(NOW-2*86400000,command),now:NOW-2*86400000});
 const digest=paymentPolicyDigest(record),bytes=publicActivationBytes(record);
 const publication={repository:'ltzyz2181-collab/ltzzz',path:activationPath(digest),source_commit:'e'.repeat(40)};
 state.release_history=[RELEASE];
 state.activation={record,sha256:digest,command,release_sha256:RELEASE,policy_sha256:paymentPolicyDigest(f.policy),authority_sha256:paymentPolicyDigest(signatures.authority),public_confirmed_at:NOW-2*86400000,ready_at:NOW-86400000,publication:publicActivationReadback(publication,{...publication,http_status:200,content:bytes},bytes)};
 const store=memoryStore(state),stats={calls:0,alarms:[],permits:[]};let now=NOW;
 const deps={policy:f.policy,release_sha256:RELEASE,store,clock:()=>now,
  authenticateController:async()=>({verified:true,controller_id:'gpt'}),authenticateAuditor:async()=>({verified:true,principal:'independent-auditor'}),
  loadBudgetEvidence:async()=>structuredClone(f.budgetProof),
  activationAuthority:signatures.authority,loadActivationEvidence:async({command}={})=>signatures.makeEvidence(now,command),
  scheduleAudit:async alarm=>{stats.alarms.push(alarm);return {durable:true,...alarm};},
  execute:async({request,recipient,permit})=>{stats.calls++;stats.permits.push(permit);consumeSmallPaymentPermit(permit,{recipient,amount_raw:request.amount_raw,purpose_id:request.purpose_id,rail:request.rail,now});return {hash:TX};},
  verifySettlement:async({request,expected_recipient_key})=>({payment_id:request.payment_id,amount_raw:request.amount_raw,currency:'USDC',recipient_key:expected_recipient_key,purpose_id:request.purpose_id,evidence_sha256:H,paid:true,tx_hash:TX,provider_receipt_id:null,status:'confirmed'}),
  verifyAudit:async({operation,observation})=>({verified:true,payment_id:operation.request.payment_id,receipt_sha256:smallPaymentDigest(operation.receipt),independent_of_controller:true,independent_of_payee:true,actual_provider:'aliyun_dashscope',evidence_sha256:H,verdict:observation?.verdict||'approve'}),...overrides};
 return {...f,signatures,store,stats,deps,advance:ms=>{now+=ms;},service:createSmallPaymentService(deps)};
}
