// Local diagnostic only: no network, no credentials, no GitHub mutations.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]||process.cwd());
const O=await import(pathToFileURL(path.join(root,'scripts/patchgate-observe.mjs')));
const {sha256}=await import(pathToFileURL(path.join(root,'scripts/lib/patchgate.mjs')));
const A='a'.repeat(40),B='b'.repeat(40),REPO='ltzyz2181-collab/ltzzz';
const pr={number:7,author_association:'OWNER',base:{ref:'main',repo:{full_name:REPO}},head:{sha:B},body:''};
for(const number of [null,undefined,NaN,0,-1,'7'])assert.throws(()=>O.candidateIdentity({...pr,number}));
const controlId=O.candidateIdentity({...pr,body:'```json\n'+JSON.stringify({task_id:'TASK\u0000ID'})+'\n```'}).task_id;
assert.equal(controlId,'PATCHGATE-PR-7');
let mutations=0;
await assert.rejects(O.observe({api:async method=>{if(method!=='GET')mutations++;return {status:200,data:{...pr,author_association:'NONE'}};},prNumber:7,runnerSha:A,runId:'1'}),/trusted_pr_author_required/);
assert.equal(mutations,0);
// A real defense-in-depth gap, kept explicit: a trusted internal caller can directly
// construct a malformed task_id for the transport. Candidate input cannot reach it:
// candidateIdentity has already bounded/validated the ID before body construction.
const task_id='../../not-a-task',key=sha256(task_id+':'+B);
const record={task_id,head_sha:B,pr_number:7,source_main_sha:A,phase:'A1_shadow_readonly',run_id:'1',at_utc:new Date().toISOString(),
 status:'no_new_diff_no_authorization',native_model_calls:0,signing_admission:false,automatic_merge:false,automatic_deploy:false,automatic_rollback:false,financial_execution:false,paid:false,tx_hash:null};
let internalAccepted=false;
try {O.validateObservationRequest('PUT','/repos/'+REPO+'/contents/knowledge/results/patchgate/a1/'+key+'.json',
 {branch:'patchgate-a1-observations/'+key,message:'A1 shadow observation only; no code/merge/deploy authority',content:Buffer.from(JSON.stringify(record)).toString('base64')});internalAccepted=true;}catch{}
console.log(JSON.stringify({invalid_PR_numbers_rejected:true,control_character_ID_not_used:true,fallback_ID:controlId,
 manual_target_untrusted_author_rejected_before_mutation:true,mutation_requests:mutations,
 direct_internal_transport_malformed_ID_accepted:internalAccepted,network_calls:0,
 limitation:'Internal format hardening is a real defense-in-depth proposal; no candidate-controlled bypass or secret compromise is demonstrated.'},null,2));
