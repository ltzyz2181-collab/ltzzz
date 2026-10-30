// All identities, storage, publication and transactions here are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,memoryStore,NOW,RELEASE,H,TX} from './small-payment-fixtures.mjs';
import {initialSmallPaymentState,createSmallPaymentService,consumeSmallPaymentPermit} from '../lib/small-payment-runtime.mjs';
import {paymentActivationSubject,verifySmallPaymentActivation,PAYMENT_COOLDOWN_MS,paymentActivationMatches} from '../lib/small-payment-authorization.mjs';
import {activationPath} from '../lib/small-payment-lifecycle.mjs';
import {createControllerDecisionAuthority,controllerDecisionEvidence} from '../lib/controller-decision.mjs';
const context={session:'synthetic-authenticated-session'};
function setup(overrides={}){
 const f=fixture();f.policy.independent_reviews={mode:'authenticated_controller',required_providers:[]};
 const authority={schema:'ltzzz.small-payment.activation-authority.v1',authorization_mode:'authenticated_controller',enabled:true,
  controller_ids:['gpt','backup'],required_providers:[],required_role:'payment_policy_decision',registry:null,trust:null};
 const store=memoryStore(initialSmallPaymentState()),published=new Map(),stats={executions:0,publications:0,auth:0};let now=NOW;
 const deps={policy:f.policy,release_sha256:RELEASE,activationAuthority:authority,store,clock:()=>now,
  authenticateController:async c=>{stats.auth++;return c?.session===context.session?{verified:true,controller_id:'gpt',identity_evidence_sha256:H}:{verified:false};},
  loadBudgetEvidence:async()=>structuredClone(f.budgetProof),scheduleAudit:async a=>({durable:true,...a}),
  publishActivation:async a=>{stats.publications++;published.set(a.record_sha256,a.content);return {repository:'ltzyz2181-collab/ltzzz',path:activationPath(a.record_sha256),source_commit:'e'.repeat(40)};},
  readPublicActivation:async p=>({...p,http_status:200,content:published.get(p.path.split('/').at(-1).slice(0,-5))}),
  execute:async({recipient,request,permit})=>{stats.executions++;consumeSmallPaymentPermit(permit,{recipient,amount_raw:request.amount_raw,purpose_id:request.purpose_id,rail:request.rail,now});return {hash:TX};},
  verifySettlement:async({request,expected_recipient_key})=>({payment_id:request.payment_id,amount_raw:request.amount_raw,currency:'USDC',recipient_key:expected_recipient_key,purpose_id:request.purpose_id,evidence_sha256:H,paid:true,tx_hash:TX,provider_receipt_id:null,status:'confirmed'}),...overrides};
 return {...f,authority,store,stats,deps,advance:ms=>{now+=ms;},service:createSmallPaymentService(deps)};
}
test('authenticated controller activates without native signatures; publication, cooldown, budget and permit remain enforced',async()=>{
 const f=setup(),command=await f.service.lifecycleProposal({kind:'activate',target_stage:0});
 const a=await f.service.activate({command,context});assert.equal(a.status,'activation_published_cooling');
 assert.equal(f.stats.executions,0);assert.equal(f.store.read().activation.record.evidence.controller_decision.independent_model_quorum_verified,false);
 assert.equal((await f.service.submit({request:f.request,context})).execution_attempted,false);f.advance(PAYMENT_COOLDOWN_MS);
 const paid=await f.service.submit({request:f.request,context});assert.equal(paid.status,'paid_pending_independent_audit');assert.equal(f.stats.executions,1);
 await f.service.submit({request:f.request,context});assert.equal(f.stats.executions,1);
});
test('a caller-supplied controller label, verified boolean or model reviews cannot authenticate activation',async()=>{
 const f=setup(),command=await f.service.lifecycleProposal({kind:'activate',target_stage:0});
 const r=await f.service.activate({command,context:{verified:true,controller_id:'gpt'},evidence:{reviews:[{verified:true}]}});
 assert.equal(r.execution_attempted,false);assert.equal(f.stats.publications,0);assert.equal(f.stats.executions,0);
});
test('serialized public controller evidence is not an activation capability',async()=>{
 const f=setup(),command=await f.service.lifecycleProposal({kind:'activate',target_stage:0}),subject=paymentActivationSubject({policy:f.policy,release_sha256:RELEASE,authority:f.authority,command});
 const authorize=createControllerDecisionAuthority({controllerIds:['gpt'],authenticate:async()=>({verified:true,controller_id:'gpt',identity_evidence_sha256:H})});
 const decision=await authorize({subject,now:NOW}),evidence={controller_decision:controllerDecisionEvidence(decision)};
 const proof=verifySmallPaymentActivation({policy:f.policy,release_sha256:RELEASE,authority:f.authority,command,evidence,controllerDecision:decision,now:NOW});
 assert.ok(paymentActivationMatches(proof,{policy:f.policy,release_sha256:RELEASE,command,now:NOW}));
 for(const fake of [JSON.parse(JSON.stringify(decision)),evidence.controller_decision,{verified:true}])assert.throws(()=>verifySmallPaymentActivation({policy:f.policy,release_sha256:RELEASE,authority:f.authority,command,evidence,controllerDecision:fake,now:NOW}));
 f.policy.payees[0].address='0x'+'3'.repeat(40);assert.equal(paymentActivationMatches(proof,{policy:f.policy,release_sha256:RELEASE,command,now:NOW}),false);
});
test('controller activation does not bypass registered budgets or hard 20 USDC boundary',async()=>{
 for(const mutation of [f=>f.request.amount_raw='20000000',f=>f.deps.loadBudgetEvidence=async()=>({...f.budgetProof,status:'unregistered'})]){
  const f=setup();mutation(f);f.service=createSmallPaymentService(f.deps);const command=await f.service.lifecycleProposal({kind:'activate',target_stage:0});await f.service.activate({command,context});f.advance(PAYMENT_COOLDOWN_MS);
  const r=await f.service.submit({request:f.request,context});assert.equal(r.execution_attempted,false);assert.equal(f.stats.executions,0);
 }
});
test('authenticated controller may freeze an anomaly but not reuse a release to unfreeze',async()=>{
 const f=setup(),command=await f.service.lifecycleProposal({kind:'activate',target_stage:0});await f.service.activate({command,context});
 const report={verdict:'anomaly',evidence_sha256:H,reason:'receipt_mismatch'};
 assert.equal((await f.service.reportAnomaly({report,context:{}})).freeze_persisted,false);
 assert.equal((await f.service.reportAnomaly({report,context})).freeze_persisted,true);
 assert.equal(f.store.read().switch_enabled,false);await assert.rejects(f.service.lifecycleProposal({kind:'unfreeze',target_stage:0}),/new_release/);
});
test('missing live controller identity blocks submit after cooldown with no execute attempt',async()=>{
 const f=setup(),command=await f.service.lifecycleProposal({kind:'activate',target_stage:0});await f.service.activate({command,context});f.advance(PAYMENT_COOLDOWN_MS);
 const r=await f.service.submit({request:f.request,context:{}});assert.equal(r.execution_attempted,false);assert.equal(f.stats.executions,0);
});
test('unknown or mismatched authority modes fail before publication',async()=>{
 for(const mutate of [f=>f.deps.policy.independent_reviews.mode='authenticated_controllre',f=>f.deps.activationAuthority.authorization_mode='independent_signers',f=>f.deps.activationAuthority.authorization_mode='typo']){
  const f=setup();mutate(f);f.service=createSmallPaymentService(f.deps);const command=await f.service.lifecycleProposal({kind:'activate',target_stage:0});
  assert.equal((await f.service.activate({command,context})).execution_attempted,false);assert.equal(f.stats.publications,0);assert.equal(f.stats.executions,0);
 }
});
test('controller identity expiration during publication leaves the payment switch closed',async()=>{
 const f=setup(),read=f.deps.readPublicActivation;f.deps.readPublicActivation=async p=>{f.advance(300000);return read(p);};f.service=createSmallPaymentService(f.deps);
 const command=await f.service.lifecycleProposal({kind:'activate',target_stage:0}),r=await f.service.activate({command,context});
 assert.equal(r.reason,'controller_authorization_expired_during_publication');assert.equal(f.store.read().switch_enabled,false);assert.equal(f.stats.executions,0);
});
