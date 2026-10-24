// Claude check of Qwen CRITICAL #1 (task_id in transport validator). Local only: no network, no secrets. Usage: node a1-claude-traversal-check.mjs <repo-root-with-A1-merged>
const R=process.argv[2];
const O=await import(R+'/scripts/patchgate-observe.mjs');
const {sha256}=await import(R+'/scripts/lib/patchgate.mjs');
// Qwen CRITICAL #1: does the transport validator accept a traversal-looking task_id, and does that reach any path?
const task='../../.github/workflows/x',head='b'.repeat(40),key=sha256(task+':'+head),src='a'.repeat(40);
const rec={task_id:task,head_sha:head,source_main_sha:src,phase:'A1_shadow_readonly',pr_number:7,run_id:'1',at_utc:new Date().toISOString(),native_model_calls:0,signing_admission:false,automatic_merge:false,automatic_deploy:false,automatic_rollback:false,financial_execution:false,paid:false,tx_hash:null,status:'observation_failed'};
const ep='/repos/ltzyz2181-collab/ltzzz/contents/knowledge/results/patchgate/a1/'+key+'.failure.json';
const body={branch:'patchgate-a1-observations/'+key,message:'A1 observation failed; retained reservation; no retry',content:Buffer.from(JSON.stringify(rec)).toString('base64')};
try{O.validateObservationRequest('PUT',ep,body);console.log('validator ACCEPTS traversal-looking task_id (data only)');console.log('path used:',ep.split('/contents/')[1]);}catch(e){console.log('validator rejects:',e.message)}
// can it be steered to a different path/branch?
for(const [label,e2,b2] of [['path outside a1/', ep.replace('knowledge/results/patchgate/a1/','.github/workflows/'),body],['branch != key', ep,{...body,branch:'main'}],['extra body field', ep,{...body,sha:'x'}]]){
  try{O.validateObservationRequest('PUT',e2,b2);console.log(label,'-> ACCEPTED')}catch(e){console.log(label,'-> rejected')}}
