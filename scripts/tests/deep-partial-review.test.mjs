import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {normalizeCard,sourceJob,verifyOriginalInput,reviewMessages,runPartialReview} from '../run-deep-partial-review.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const card={task_id:'DEEP-TEST-PARTIAL-20261104',package_id:'PUBLIC-PACK-01',execution_id:'original-execution',input_sha256:'a'.repeat(64),receipt_commit:'b'.repeat(40),receipt_path:'knowledge/results/deep-superagent/queue-123-attempt-1.json'};
function fixture(){
 const outputs=[{seat:'doubao',actual_provider:'volcengine_ark',task:'code candidate',text:'public-code',sha256:hash('public-code')},{seat:'qianwen',actual_provider:'aliyun_dashscope',task:'spec checks',text:'public-spec',sha256:hash('public-spec')}];
 const job={...card,terminal:true,status:'blocked',model_calls:4,receipts:[{stage:'plan',seat:'deepseek'},...outputs.map(o=>({stage:'work_'+o.seat,seat:o.seat,actual_provider:o.actual_provider,output_sha256:o.sha256,generation_verified:true,model_source:'provider_response',finish_reason:'stop'})),{stage:'work_kimi',seat:'kimi',upstream_http:524,generation_verified:false}],outputs,plan:{tasks:outputs.map(o=>({seat:o.seat,task:o.task}))},financial_execution:false,external_submissions_enabled:false,paid:false,tx_hash:null,error:'native_generation_evidence_incomplete'};
 return {job,receipt:{items:[{task_id:card.task_id,package_id:card.package_id,execution_id:card.execution_id,input_sha256:card.input_sha256,job}]}};
}
class Store{value=null;async read(){return this.value;}async compareAndSwap(key,previous,state){if(this.value)return false;this.value={state};return true;}}
function provider(job,patch={}){const text=JSON.stringify({approved:false,summary:'部分工件可用；原失败保留，等待GPT决策。',reviewed:job.outputs.map(o=>({seat:o.seat,sha256:o.sha256})),needs_gpt_decision:true,reason:'partial worker failure'});return Response.json({ltzzz_receipt:{executed_by:'deepseek',task_id:job.task_id,actual_model:'native-test-model',model_source:'provider_response',generation_verified:true,request_id:'actual-request',provider_response_id:'actual-provider-response',finish_reason:'stop',...patch},choices:[{message:{content:text}}]});}
test('review cards cannot request endpoints, models, secrets or arbitrary paths',()=>{
 assert.deepEqual(normalizeCard(card),card);
 for(const patch of [{endpoint:'https://attacker.test'},{receipt_path:'../secrets.json'},{receipt_commit:'main'},{input_sha256:'unknown'}])assert.throws(()=>normalizeCard({...card,...patch}));
});
test('the original task, package, execution, attempt budget and completed output hashes are bound',()=>{
 const {job,receipt}=fixture();assert.equal(sourceJob(card,receipt),job);
 for(const change of [j=>j.execution_id='wrong',j=>j.status='completed_pending_external_acceptance',j=>j.model_calls=5,j=>j.outputs[0].text='modified',j=>j.paid=true,j=>j.receipts[1].generation_verified=false]){const f=fixture();change(f.job);assert.throws(()=>sourceJob(card,f.receipt));}
});
test('the fixed original input must itself be public/internal and match the exact normalized input hash',()=>{
 const input={task_id:card.task_id,package_id:card.package_id,prompt:'Own public data',data_classification:'public_distributable',platform:'internal'},c={...card,input_sha256:hash(JSON.stringify(input))};assert.deepEqual(verifyOriginalInput(c,input),input);
 for(const patch of [{data_classification:'confidential'},{platform:'uumit'},{prompt:'changed'}])assert.throws(()=>verifyOriginalInput(c,{...input,...patch}));
});
test('recovery prompt exposes actual failure and observed outputs; model summaries are never execution evidence',()=>{
 const {job}=fixture(),messages=reviewMessages(job),body=JSON.parse(messages[1].content);assert.equal(body.actual_receipts.at(-1).upstream_http,524);assert.equal(body.outputs.length,2);assert.equal(body.outputs.some(o=>o.seat==='kimi'),false);assert.match(messages[0].content,/Reject an output that substitutes a whole-team review/);assert.match(messages[0].content,/not a regeneration/);
});
test('missing engineering evidence and a 524 response are not asserted as no execution',()=>{
 const messages=reviewMessages(fixture().job),body=JSON.parse(messages[1].content);assert.match(body.gpt_engineering_status,/not supplied/);assert.doesNotMatch(body.gpt_engineering_status,/not yet committed/);assert.match(messages[0].content,/HTTP524 does not prove no generation or charge/);assert.match(messages[0].content,/unverified, never not done/);
});
test('one real review request preserves the worker error and is not an approval or worker retry',async()=>{
 const {job,receipt}=fixture(),store=new Store();let n=0;
 const fetcher=async(url,o)=>{n++;assert.equal(url,'https://api-deep.ltzzz.com/');assert.equal(o.redirect,'error');assert.equal(JSON.parse(o.body).task_id,card.task_id);assert.equal(JSON.parse(o.body).model,undefined);return provider(job);};
 const r=await runPartialReview({card,receipt,store,token:'test-service-token',fetcher,source_commit:'c'.repeat(40)});assert.equal(r.status,'native_partial_review_complete_GPT_decision_required');assert.equal(r.review.approved,false);assert.equal(r.new_model_calls,1);assert.equal(r.original_and_review_model_attempts,5);assert.equal(r.worker_requests_repeated,0);assert.equal(job.status,'blocked');assert.equal(job.receipts.at(-1).upstream_http,524);
 const again=await runPartialReview({card,receipt,store,token:'test-service-token',fetcher});assert.equal(again.status,'existing_review_reserved_reconcile_only');assert.equal(n,1);
});
test('unknown transport outcome cannot issue another paid provider request',async()=>{
 const {receipt}=fixture(),store=new Store();let n=0;const fetcher=async()=>{n++;throw Error('Bearer PRIVATE-CREDENTIAL');};
 const r=await runPartialReview({card,receipt,store,token:'t',fetcher});assert.equal(r.status,'partial_review_failed_or_uncertain_no_retry');assert.equal(JSON.stringify(r).includes('PRIVATE-CREDENTIAL'),false);
 await runPartialReview({card,receipt,store,token:'t',fetcher});assert.equal(n,1);
});
test('wrong provider, missing model identity and truncated output cannot count as DeepSeek review',async()=>{
 for(const patch of [{executed_by:'qianwen'},{actual_model:null},{model_source:'requested_model'},{finish_reason:'length'},{generation_verified:false}]){const {job,receipt}=fixture();const r=await runPartialReview({card,receipt,store:new Store(),token:'t',fetcher:async()=>provider(job,patch)});assert.equal(r.status,'partial_review_failed_or_uncertain_no_retry');assert.equal(r.review,undefined);}
});
test('a hash-mismatched native review is preserved but never accepted or automatically regenerated',async()=>{
 const {job,receipt}=fixture();const r=await runPartialReview({card,receipt,store:new Store(),token:'t',fetcher:async()=>{const data=await provider(job).json();const v=JSON.parse(data.choices[0].message.content);v.reviewed[0].sha256='f'.repeat(64);data.choices[0].message.content=JSON.stringify(v);return Response.json(data);}});assert.equal(r.status,'partial_review_failed_or_uncertain_no_retry');assert.equal(r.error,'review_binding_mismatch');assert.ok(r.text);assert.equal(r.review,undefined);
});
test('missing auth and uncertain CAS reservation stop before provider IO',async()=>{
 const {receipt}=fixture();let n=0;const fetcher=async()=>{n++;throw Error();};await assert.rejects(()=>runPartialReview({card,receipt,store:new Store(),token:'',fetcher}));await assert.rejects(()=>runPartialReview({card,receipt,store:{read:async()=>null,compareAndSwap:async()=>{throw Error('write_unknown');}},token:'t',fetcher}));assert.equal(n,0);
});
