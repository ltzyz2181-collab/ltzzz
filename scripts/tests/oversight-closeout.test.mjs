import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectDispatches,runDispatchOversight,OVERSIGHT_ROOT} from '../lib/dispatch-oversight.mjs';
import {externalReturnEvidence,readBoundEvidence} from '../lib/oversight-closeout.mjs';

const now='2026-10-22T15:00:00Z',date='2026-10-22',source='a'.repeat(40);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixture=fn=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'oversight-closeout-'));try{return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}};
function put(root,file,body){const bytes=typeof body==='string'?body:JSON.stringify(body);fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),bytes);return {path:file,sha256:sha(bytes)};}
const native=actual_provider=>({actual_provider,model:'test-provider-model',metadata_source:'provider_response',model_calls:1});
// Test-only authenticated collector. Production has no configured collector and
// must fail closed even for a byte-perfect locally fabricated receipt bundle.
function nativeProof(root,review,deliveryReceipt){
 const id=review.task_id.toUpperCase()+'-REVIEW',subject={task_id:review.task_id,source_commit:review.source_commit,artifact:review.artifact,...(deliveryReceipt?{delivery_receipt:deliveryReceipt}:{})};
 const card={id,agent:'qianwen',original_task_id:review.task_id,review_subject:subject,prompt:'Review the fixed subject and return structured evidence: '+JSON.stringify(subject),max_tokens:1024,real_money:false};
 review.native_card=put(root,`ops/dispatch/queue/${id}.json`,card);
 const output=JSON.stringify({schema:'ltzzz.task-artifact-review.v1',...subject,accepted:review.accepted,reasons:['test-only independent review output']});
 const receipt={task_id:id,card_sha256:review.native_card.sha256,run_id:'987654',executor:'qianwen',queue_dispatcher:'qianwen',at:date+'T04:30:00Z',finished_at:review.at_utc,paid:false,tx_hash:null,financial_execution:false,model_source:'provider_response',status:'draft_delivered_pending_independent_review',model_calls:1,native_qwen_call:true,model:'qwen-plus',generated_by_model:'qwen-plus',finish_reason:'stop',request_id:'fixture-native-request',output,output_sha256:sha(output),error:null,accepted:false,deployed:false};
 review.native_receipt=put(root,`knowledge/results/qwen-dispatch/${id}.json`,receipt);
 const expected={actual_provider:'aliyun_dashscope',task_id:review.task_id,source_commit:review.source_commit,native_receipt:{...review.native_receipt},native_card:{...review.native_card},run_id:receipt.run_id,request_id:receipt.request_id,output_sha256:receipt.output_sha256,card_sha256:receipt.card_sha256,model:receipt.model};
 return proof=>JSON.stringify(proof)===JSON.stringify(expected);
}
function returned(root){
 const task_id=`QIANWEN-RETURN-${date}`;
 const acceptance_receipt=put(root,'ops/dispatch/receipts/return-ack.json',{task_id,claimed_by:'qianwen',accepted_at:date+'T03:00:00Z'});
 const artifact=put(root,'knowledge/results/desktop/readonly.json',{task_id,result:'read-only inspection completed; no production deployment'});
 const delivery={schema:'ltzzz.external-return-delivery.v1',task_id,date,logical_seat:'qianwen',acceptance_receipt,source_commit:source,run_id:'123456',...native('deepseek'),delivery_kind:'readonly_inspection',at_utc:date+'T04:00:00Z',artifact,paid:false,tx_hash:null};
 const dispatch={task_id,date,issued_at:date+'T02:00:00Z',acceptance_receipt,instruction:'只读核对'};
 const review={schema:'ltzzz.task-artifact-review.v1',task_id,source_commit:source,artifact,...native('qianwen'),model:'qwen-plus',accepted:true,at_utc:date+'T05:00:00Z',paid:false,tx_hash:null};
 let verifier;
 const persist=()=>{dispatch.delivery_receipt=put(root,'ops/dispatch/receipts/return-delivery.json',delivery);review.delivery_receipt={...dispatch.delivery_receipt};verifier=nativeProof(root,review,dispatch.delivery_receipt);dispatch.review_receipt=put(root,'ops/dispatch/receipts/return-review.json',review);put(root,`knowledge/results/dispatch/qianwen-return-${date}.json`,dispatch);};persist();
 return {dispatch,delivery,review,persist,verify:proof=>verifier(proof)};
}
test('reviewed read-only return reports partial delivery and retains missing authenticated-claim warning',()=>fixture(root=>{
 const f=returned(root),task=inspectDispatches({root,now,lookback:1,nativeReceiptVerifier:f.verify}).tasks.find(t=>t.id===f.dispatch.task_id);
 assert.equal(task.phase,'external_return_reviewed_delivery_claim_unverified');assert.equal(task.overdue,true);assert.equal(task.acceptance_reference_verified,true);assert.equal(task.submission_verified,true);assert.equal(task.independent_review_verified,true);assert.equal(task.delivery_status,'partial_reviewed_delivery');assert.deepEqual(task.missing_stages,['authenticated_claim']);
 assert.equal(task.claim_verified,false);assert.equal(task.native_qianwen_dispatch,false);assert.equal(task.native_generation_verified,false);assert.equal(task.deployed,false);
}));
test('claimless return cannot be retroactively completed by delivery and review files',()=>fixture(root=>{
 const f=returned(root);f.dispatch.acceptance_receipt=null;
 const result=externalReturnEvidence({root,dispatch:f.dispatch,now});assert.equal(result.phase,'external_return_claim_missing');assert.equal(result.submission_verified,false);assert.equal(result.independent_review_verified,false);
}));
test('wrong original task, ack hash, source, logical seat, future times or engineering kind cannot pass read-only return contract',()=>fixture(root=>{
 for(const patch of [{task_id:'DAILY-'+date+'-qianwen'},{date:'2026-10-21'},{logical_seat:'deepseek'},{source_commit:'main'},{run_id:'local'},{acceptance_receipt:{path:'ops/dispatch/receipts/return-ack.json',sha256:'b'.repeat(64)}},{at_utc:date+'T16:00:00Z'},{delivery_kind:'engineering_delivery'},{paid:true},{tx_hash:'0x123'},{actual_provider:'invented_provider'},{metadata_source:'model_self_report'}]){
  const f=returned(root);Object.assign(f.delivery,patch);f.persist();const result=externalReturnEvidence({root,dispatch:f.dispatch,now});assert.equal(result.submission_verified,false,JSON.stringify(patch));assert.equal(result.phase,'external_return_delivery_evidence_invalid');
 }
}));
test('receipt and payload byte tampering never verifies a delivery',()=>fixture(root=>{
 for(const which of ['delivery','payload']){
  const f=returned(root),ref=which==='delivery'?f.dispatch.delivery_receipt:f.delivery.artifact;fs.appendFileSync(path.join(root,ref.path),' ');
  assert.equal(externalReturnEvidence({root,dispatch:f.dispatch,now}).phase,'external_return_delivery_evidence_invalid');
 }
}));
test('missing independent review preserves pending and a valid rejection remains revision-required',()=>fixture(root=>{
 const f=returned(root);delete f.dispatch.review_receipt;let result=externalReturnEvidence({root,dispatch:f.dispatch,now});assert.equal(result.phase,'external_return_review_missing');assert.equal(result.submission_verified,true);assert.equal(result.independent_review_verified,false);
 f.review.accepted=false;f.persist();result=externalReturnEvidence({root,dispatch:f.dispatch,now,nativeReceiptVerifier:f.verify});assert.equal(result.phase,'external_return_revision_required');assert.equal(result.independent_review_verified,true);assert.equal(result.accepted,false);
}));
test('self-review aliases, unbound delivery and wrong task/source/artifact/time cannot complete external return',()=>fixture(root=>{
 for(const patch of [{actual_provider:'DeepSeek'},{actual_provider:'deepseek'},{task_id:'OTHER-TASK'},{source_commit:'b'.repeat(40)},{artifact:{path:'knowledge/results/desktop/readonly.json',sha256:'b'.repeat(64)}},{at_utc:date+'T03:30:00Z'},{at_utc:date+'T16:00:00Z'},{accepted:'true'},{model_calls:0},{metadata_source:'repository_executor_code',model:null,model_calls:0}]){
  const f=returned(root);Object.assign(f.review,patch);f.persist();const result=externalReturnEvidence({root,dispatch:f.dispatch,now});assert.equal(result.phase,'external_return_review_evidence_invalid',JSON.stringify(patch));assert.equal(result.independent_review_verified,false);
 }
 const f=returned(root);f.review.delivery_receipt={...f.dispatch.delivery_receipt,sha256:'b'.repeat(64)};f.dispatch.review_receipt=put(root,'ops/dispatch/receipts/return-review.json',f.review);assert.equal(externalReturnEvidence({root,dispatch:f.dispatch,now}).independent_review_verified,false);
}));
test('zero-model executor inspection remains accurately attributed and needs model-provider review',()=>fixture(root=>{
 const f=returned(root);Object.assign(f.delivery,{actual_provider:'repository_rules',model:null,metadata_source:'repository_executor_code',model_calls:0});f.persist();
 const result=externalReturnEvidence({root,dispatch:f.dispatch,now,nativeReceiptVerifier:f.verify});assert.equal(result.phase,'external_return_reviewed_delivery_claim_unverified');assert.equal(result.actual_provider,'repository_rules');assert.equal(result.model,null);assert.equal(result.native_generation_verified,false);
}));
test('a partial reviewed return never silently removes the original task from open warnings',()=>fixture(root=>{
 const f=returned(root),original={...f.dispatch,acceptance_receipt:null};put(root,`knowledge/results/dispatch/qianwen-return-${date}.json`,original);
 const before=runDispatchOversight({root,now,lookback:1});assert.ok(before.warnings.some(w=>w.task_id===f.dispatch.task_id&&w.issue==='external_return_claim_missing'));
 f.persist();const after=runDispatchOversight({root,now,lookback:1,nativeReceiptVerifier:f.verify});const warning=after.warnings.find(w=>w.task_id===f.dispatch.task_id);assert.ok(warning);assert.equal(warning.issue,'external_return_reviewed_delivery_claim_unverified');assert.equal(warning.state,'open');
 const task=after.tasks.find(t=>t.id===f.dispatch.task_id);assert.equal(task.claim_verified,false);assert.equal(task.status,'warning_required');assert.deepEqual(task.missing_stages,['authenticated_claim']);
}));
test('future or pre-dispatch acceptance cannot fabricate claim proof',()=>fixture(root=>{
 for(const accepted_at of [date+'T01:00:00Z',date+'T16:00:00Z']){
  const f=returned(root);f.dispatch.acceptance_receipt=put(root,'ops/dispatch/receipts/return-ack.json',{task_id:f.dispatch.task_id,claimed_by:'qianwen',accepted_at});assert.equal(externalReturnEvidence({root,dispatch:f.dispatch,now}).acceptance_reference_verified,false);
 }
}));
function ans(root){
 const id=`ANS-${date}-deepseek`,wp=`knowledge/results/ans-cycle/${date}-worker.json`,rp=`knowledge/results/ans-cycle/${date}-reviewer.json`;
 const original=put(root,wp,{finding:'old unimplemented proposal'}),oldReview=put(root,rp,{accepted:false,artifact_sha256:original.sha256,reasons:['no patch']});
 const record={date,status:'draft_rejected',audit:{accepted:false,artifact_sha256:original.sha256,executed_by:'Qianwen'},artifacts:[{role:'worker',task_id:id,...original,executed_by:'DeepSeek'},{role:'reviewer',task_id:`ANS-${date}-doubao`,...oldReview,executed_by:'Qianwen'}],remote_review_status:'rejected_draft_review',sync_status:'hashed_artifacts_submitted',board_verification:{verified:true,worker_status:'rejected_draft_review'}};
 put(root,`knowledge/results/ans-cycle/${date}.json`,record);
 const artifact=put(root,'knowledge/results/desktop/implementation.md','Engineering implementation diff for '+id),tests=put(root,'knowledge/results/desktop/implementation-tests.json',{run_id:'123456',source_commit:source,passed:8,failed:0});
 const closeout={task_id:id,source_commit:source,run_id:'123456',pr_url:'https://github.com/ltzyz2181-collab/ltzzz/pull/999',artifact,tests:{...tests,passed:true,count:8},original_artifact:original,...native('deepseek'),at_utc:date+'T04:00:00Z',paid:false,tx_hash:null};
 const review={schema:'ltzzz.task-artifact-review.v1',task_id:id,source_commit:source,artifact,...native('qianwen'),model:'qwen-plus',accepted:true,at_utc:date+'T05:00:00Z',paid:false,tx_hash:null};
 let verifier;
 const persist=()=>{verifier=nativeProof(root,review);closeout.review=put(root,'knowledge/results/desktop/implementation-review.json',review);put(root,OVERSIGHT_ROOT+'/closeouts/'+id+'.json',closeout);};persist();
 const task=()=>inspectDispatches({root,now,lookback:1,nativeReceiptVerifier:proof=>verifier(proof)}).tasks.find(t=>t.id===id);
 return {id,record,original,closeout,review,persist,task,verify:proof=>verifier(proof)};
}
test('ANS implementation closeout resolves engineering delivery only after new artifact review and preserves original rejection',()=>fixture(root=>{
 const f=ans(root),original=fs.readFileSync(path.join(root,`knowledge/results/ans-cycle/${date}.json`),'utf8'),task=f.task();
 assert.equal(task.phase,'engineering_delivery_verified_not_deployed');assert.equal(task.engineering_completion_verified,true);assert.equal(task.overdue,false);assert.equal(task.draft_accepted,false);assert.equal(task.deployed,false);assert.equal(task.engineering_closeout.reviewer_actual_provider,'qianwen');
 assert.equal(fs.readFileSync(path.join(root,`knowledge/results/ans-cycle/${date}.json`),'utf8'),original);assert.equal(JSON.parse(original).audit.accepted,false);
}));
test('old rejected-proposal review cannot authorize subsequent engineering closeout',()=>fixture(root=>{
 const f=ans(root);f.closeout.review={path:`knowledge/results/ans-cycle/${date}-reviewer.json`,sha256:sha(fs.readFileSync(path.join(root,`knowledge/results/ans-cycle/${date}-reviewer.json`)))};
 put(root,OVERSIGHT_ROOT+'/closeouts/'+f.id+'.json',f.closeout);assert.equal(f.task().phase,'engineering_completion_unverified');assert.equal(f.task().overdue,true);
}));
test('ANS wrong original/task/PR/test proof and missing review remain open',()=>fixture(root=>{
 for(const patch of [{task_id:'OTHER'},{original_artifact:{path:`knowledge/results/ans-cycle/${date}-worker.json`,sha256:'b'.repeat(64)}},{pr_url:'https://example.com/pull/999'},{tests:{path:'knowledge/results/desktop/implementation-tests.json',sha256:'b'.repeat(64),passed:true,count:8}},{actual_provider:'invented_provider'},{at_utc:date+'T16:00:00Z'},{paid:true}]){
  const f=ans(root);Object.assign(f.closeout,patch);f.persist();assert.equal(f.task().phase,'engineering_completion_unverified',JSON.stringify(patch));
 }
 const f=ans(root);delete f.closeout.review;put(root,OVERSIGHT_ROOT+'/closeouts/'+f.id+'.json',f.closeout);assert.equal(f.task().engineering_completion_verified,false);
}));
test('ANS closeout cannot self-review, use wrong source/artifact or reverse time, or treat reject as pass',()=>fixture(root=>{
 for(const patch of [{actual_provider:'DeepSeek'},{task_id:'OTHER'},{source_commit:'b'.repeat(40)},{artifact:{path:'knowledge/results/desktop/implementation.md',sha256:'b'.repeat(64)}},{accepted:false},{accepted:'true'},{at_utc:date+'T03:00:00Z'}]){
  const f=ans(root);Object.assign(f.review,patch);f.persist();assert.equal(f.task().phase,'engineering_completion_unverified',JSON.stringify(patch));assert.equal(f.task().engineering_completion_verified,false);
 }
}));
test('bound evidence refuses traversal, symlinks, bad digest and non-JSON review data',()=>fixture(root=>{
 const ref=put(root,'knowledge/results/data.json',{task_id:'safe'});assert.ok(readBoundEvidence(root,ref));
 assert.equal(readBoundEvidence(root,{...ref,path:'knowledge/results/../../etc/passwd.json'}),null);assert.equal(readBoundEvidence(root,{...ref,sha256:'a'.repeat(64)}),null);
 fs.symlinkSync(path.join(root,ref.path),path.join(root,'knowledge/results/link.json'));assert.equal(readBoundEvidence(root,{...ref,path:'knowledge/results/link.json'}),null);
 const invalid=put(root,'knowledge/results/broken.json','not JSON');assert.equal(readBoundEvidence(root,invalid),null);
}));
function saveReview(root,f){
 if(f.dispatch)f.dispatch.review_receipt=put(root,'ops/dispatch/receipts/return-review.json',f.review);
 else {f.closeout.review=put(root,'knowledge/results/desktop/implementation-review.json',f.review);put(root,OVERSIGHT_ROOT+'/closeouts/'+f.id+'.json',f.closeout);}
}
test('provider_response labels and a complete local native-receipt bundle cannot replace authenticated provenance',()=>fixture(root=>{
 const f=returned(root),result=externalReturnEvidence({root,dispatch:f.dispatch,now});
 assert.equal(result.phase,'external_return_native_review_unverified');assert.equal(result.independent_review_verified,false);assert.equal(result.accepted,false);assert.deepEqual(result.missing_stages,['authenticated_claim','authenticated_native_review']);
 const a=ans(root),task=inspectDispatches({root,now,lookback:1}).tasks.find(t=>t.id===a.id);assert.equal(task.engineering_completion_verified,false);assert.equal(task.overdue,true);
}));
test('self-filled model/provider labels with no native receipt never prove independent review',()=>fixture(root=>{
 const f=returned(root);delete f.review.native_receipt;delete f.review.native_card;saveReview(root,f);
 const result=externalReturnEvidence({root,dispatch:f.dispatch,now,nativeReceiptVerifier:()=>true});assert.equal(result.independent_review_verified,false);assert.equal(result.phase,'external_return_native_review_unverified');
 const a=ans(root);delete a.review.native_receipt;delete a.review.native_card;saveReview(root,a);assert.equal(a.task().engineering_completion_verified,false);
}));
test('native proof requires actual response model, request, stop, one call, input/output hashes and no funds',()=>fixture(root=>{
 for(const patch of [{native_qwen_call:false},{model_source:'model_self_report'},{request_id:null},{request_id:''},{model_calls:0},{finish_reason:'length'},{output_sha256:'b'.repeat(64)},{card_sha256:'b'.repeat(64)},{model:'qwen-self-reported'},{generated_by_model:'another-model'},{financial_execution:true},{accepted:true}]){
  const f=returned(root),receipt=JSON.parse(fs.readFileSync(path.join(root,f.review.native_receipt.path)));Object.assign(receipt,patch);f.review.native_receipt=put(root,f.review.native_receipt.path,receipt);saveReview(root,f);
  const result=externalReturnEvidence({root,dispatch:f.dispatch,now,nativeReceiptVerifier:()=>true});assert.equal(result.independent_review_verified,false,JSON.stringify(patch));
 }
}));
test('native model output must agree with wrapper on exact task/source/artifact/decision',()=>fixture(root=>{
 for(const patch of [{task_id:'OTHER-TASK'},{source_commit:'b'.repeat(40)},{artifact:{path:'knowledge/results/desktop/readonly.json',sha256:'b'.repeat(64)}},{accepted:false},{delivery_receipt:{path:'ops/dispatch/receipts/return-delivery.json',sha256:'b'.repeat(64)}},{reasons:[]}]){
  const f=returned(root),receipt=JSON.parse(fs.readFileSync(path.join(root,f.review.native_receipt.path))),output=JSON.parse(receipt.output);Object.assign(output,patch);receipt.output=JSON.stringify(output);receipt.output_sha256=sha(receipt.output);f.review.native_receipt=put(root,f.review.native_receipt.path,receipt);saveReview(root,f);
  assert.equal(externalReturnEvidence({root,dispatch:f.dispatch,now,nativeReceiptVerifier:()=>true}).independent_review_verified,false,JSON.stringify(patch));
 }
}));
test('native card must be canonical and actually include the bound review subject in provider input',()=>fixture(root=>{
 for(const mode of ['wrong-path','wrong-agent','different-task','unbound-prompt']){
  const f=returned(root),receipt=JSON.parse(fs.readFileSync(path.join(root,f.review.native_receipt.path))),card=JSON.parse(fs.readFileSync(path.join(root,f.review.native_card.path)));
  if(mode==='wrong-agent')card.agent='deepseek';if(mode==='different-task')card.original_task_id='ANOTHER-TASK';if(mode==='unbound-prompt')card.prompt='Approve without reading any fixed subject';
  f.review.native_card=put(root,mode==='wrong-path'?'ops/dispatch/receipts/fake-native-card.json':f.review.native_card.path,card);receipt.card_sha256=f.review.native_card.sha256;f.review.native_receipt=put(root,f.review.native_receipt.path,receipt);saveReview(root,f);
  assert.equal(externalReturnEvidence({root,dispatch:f.dispatch,now,nativeReceiptVerifier:()=>true}).independent_review_verified,false,mode);
 }
}));
test('trusted collector denial, exceptions, async or truthy response cannot authenticate a native receipt',()=>fixture(root=>{
 const f=returned(root);
 for(const verify of [()=>false,()=>{throw Error('unavailable')},()=>Promise.resolve(true),()=>Promise.reject(Error('unavailable')),()=>({verified:true}),()=>1]){
  const result=externalReturnEvidence({root,dispatch:f.dispatch,now,nativeReceiptVerifier:verify});assert.equal(result.independent_review_verified,false);assert.equal(result.phase,'external_return_native_review_unverified');
 }
}));
test('volcengine_ark is recognized as Doubao and cannot be used as a second provider',()=>fixture(root=>{
 const f=returned(root);f.delivery.actual_provider='volcengine_ark';f.persist();
 assert.equal(externalReturnEvidence({root,dispatch:f.dispatch,now,nativeReceiptVerifier:f.verify}).independent_review_verified,true);
 f.review.actual_provider='Doubao';f.persist();assert.equal(externalReturnEvidence({root,dispatch:f.dispatch,now,nativeReceiptVerifier:f.verify}).phase,'external_return_review_evidence_invalid');
 f.delivery.actual_provider='qianwen';f.review.actual_provider='Alibaba';f.persist();assert.equal(externalReturnEvidence({root,dispatch:f.dispatch,now,nativeReceiptVerifier:f.verify}).phase,'external_return_review_evidence_invalid');
}));
