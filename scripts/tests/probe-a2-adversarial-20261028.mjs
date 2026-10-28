// A2 collector / signing flow adversarial probe (read-only, sandbox, no network, no real keys)
// Doubao wrap-up 2026-10-28, per ops/dispatch/inbox/doubao/REMAINING-DEPLOY-20261028.md item 2
// Node v22: createPublicKey/createPrivateKey accept only string/ArrayBuffer -> use PEM exports.
import {generateKeyPairSync,createPublicKey,verify} from 'node:crypto';
const cpub=createPublicKey,vfy=verify;

const results={at:new Date().toISOString(),original_reported_at:'2026-10-28T09:30:00Z',original_reported_seat:'doubao',logical_seat:'gpt',actual_provider:null,model:null,execution_provider:process.env.GITHUB_ACTIONS==='true'?'github_actions':'nodejs_local',fixture_only_keys:true,paid:false,tx_hash:null,model_calls:0,network_calls:0,cases:[]};
const push=(name,ok,detail)=>{results.cases.push({name,ok,detail:String(detail).slice(0,160)});};

try{
 const collector=await import('../lib/patchgate-a2-collector.mjs');
 const exec=await import('../lib/patchgate-a2-executor.mjs');
 const a2=await import('../lib/patchgate-a2.mjs');
 const pg=await import('../lib/patchgate.mjs');
 const TASK=pg.TASK, canonical=pg.canonical;
 const REPOSITORY=a2.REPOSITORY;
 const SHA_HEX='a'.repeat(40);

 // --- 1. validateCollectionRequest adversarial ---
 const good={schema:'ltzzz.patchgate.a2-collection-request.v1',task_id:TASK,candidate_pr:278,candidate_head:SHA_HEX,audit_pr:282,audit_path:'knowledge/results/patchgate/admission/20261028.md'};
 try{collector.validateCollectionRequest(good);push('collection_request_valid_baseline',true,'accepted');}catch(e){push('collection_request_valid_baseline',false,e.message);}
 const bads=[
  ['extra_field',{...good,extra:1}],['wrong_schema',{...good,schema:'x'}],['wrong_task',{...good,task_id:'other'}],
  ['candidate_pr_zero',{...good,candidate_pr:0}],['candidate_pr_huge',{...good,candidate_pr:1e10}],
  ['head_not_sha',{...good,candidate_head:'abc'}],['audit_pr_zero',{...good,audit_pr:0}],
  ['audit_path_traversal',{...good,audit_path:'knowledge/../results/x.md'}],['audit_path_no_ext',{...good,audit_path:'knowledge/results/patchgate/a.md.bak'}],
  ['audit_path_workflow',{...good,audit_path:'.github/workflows/x.yml'}],
  ['missing_task',(({task_id,...r})=>r)(good)],
 ];
 for(const [name,req] of bads){try{collector.validateCollectionRequest(req);push('collection_request_reject_'+name,false,'accepted when should reject');}catch(e){push('collection_request_reject_'+name,true,e.message);}}

 // --- 2. validateCollectorEndpoint ---
 const endpoints=[
  ['traversal','/repos/ltzyz2181-collab/ltzzz/../config/patchgate-a2.json'],
  ['outside_root','/repos/other-org/ltzzz/pulls/1'],
  ['contents_any','/repos/ltzyz2181-collab/ltzzz/contents/.env?ref='+SHA_HEX],
  ['contents_secrets','/repos/ltzyz2181-collab/ltzzz/contents/agent-wallet/keys.json?ref='+SHA_HEX],
  ['branches_protection','/repos/ltzyz2181-collab/ltzzz/branches/main/protection/required_status_checks'],
  ['actions_arbitrary','/repos/ltzyz2181-collab/ltzzz/actions/runs/123/secrets'],
  ['refs_branch','/repos/ltzyz2181-collab/ltzzz/git/ref/heads/feature-x'],
  ['pulls_redirect','/repos/ltzyz2181-collab/ltzzz/pulls/282/comments'],
 ];
 for(const [name,ep] of endpoints){try{collector.validateCollectorEndpoint(ep);push('collector_endpoint_reject_'+name,false,'allowed when should reject');}catch(e){push('collector_endpoint_reject_'+name,true,e.message);}}
 for(const ep of ['/repos/ltzyz2181-collab/ltzzz/pulls/278','/repos/ltzyz2181-collab/ltzzz/git/ref/heads/main']){try{collector.validateCollectorEndpoint(ep);push('collector_endpoint_allow_baseline',true,ep);}catch(e){push('collector_endpoint_allow_baseline',false,e.message);}}

 // --- 3. executionContext env forgery ---
 const envBase={GITHUB_REPOSITORY:REPOSITORY,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:SHA_HEX,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_WORKFLOW_REF:REPOSITORY+'/'+exec.EXECUTION_WORKFLOW+'@refs/heads/main'};
 try{const r=exec.executionContext({env:envBase,checkout:SHA_HEX});push('execution_context_valid_baseline',r.source===SHA_HEX&&r.run_id==='123','accepted');}catch(e){push('execution_context_valid_baseline',false,e.message);}
 const envs=[
  ['wrong_ref',{...envBase,GITHUB_REF:'refs/heads/dev'}],['wrong_event',{...envBase,GITHUB_EVENT_NAME:'push'}],
  ['workflow_ref_forged',{...envBase,GITHUB_WORKFLOW_REF:'other/.github/workflows/patchgate-a2-execute.yml@refs/heads/main'}],
  ['sha_mismatch',{...envBase,GITHUB_SHA:'b'.repeat(40)}],['run_attempt_zero',{...envBase,GITHUB_RUN_ATTEMPT:'0'}],
  ['checkout_missing',{...envBase}],
 ];
 for(const [name,env] of envs){try{exec.executionContext({env,checkout:name==='checkout_missing'?undefined:SHA_HEX});push('execution_context_reject_'+name,false,'accepted when should reject');}catch(e){push('execution_context_reject_'+name,true,e.message);}}

 // --- 4. executionGate policy forgery (baseline uses REAL production config) ---
 const ctx={source:SHA_HEX};
 const awaitFs=await import('node:fs');
 const preflight=()=>({blockers:[],runtime_bundle:{}});
 try{
  const actualRead=p=>(awaitFs.readFileSync(p,'utf8'));
  const r=exec.executionGate({context:ctx,request:good,read:actualRead});
  push('execution_gate_prod_held_baseline',r.enabled===false&&r.blockers.includes('A2_switch_disabled')?true:false,JSON.stringify({enabled:r.enabled,blockers:r.blockers,authority:r.authority}));
 }catch(e){push('execution_gate_prod_held_baseline',false,e.message);}
 const goodPolicy={schema:'ltzzz.patchgate.a2-reconcile-policy.v1',task_id:TASK,financial_execution:false,automatic_release_enabled:false,execution_authority:{workflow_path:'.github/workflows/patchgate-a2-execute.yml',workflow_id:123}};
 let policy=goodPolicy;
 let readP=p=>p==='config/patchgate-a2-reconcile.json'?JSON.stringify(policy):'';
 try{const r=exec.executionGate({context:ctx,request:good,read:readP,preflight});push('execution_gate_registered_authority_observation',r.enabled===true&&r.blockers.length===0?true:false,'registered authority -> enabled true (observation, not a hole)');}catch(e){push('execution_gate_registered_authority_observation',false,e.message);}
 policy={...goodPolicy,financial_execution:true};
 try{exec.executionGate({context:ctx,request:good,read:readP,preflight});push('execution_gate_reject_financial_true',false,'accepted');}catch(e){push('execution_gate_reject_financial_true',true,e.message);}
 policy={...goodPolicy,execution_authority:{workflow_path:'.github/workflows/other.yml',workflow_id:123}};
 try{const r=exec.executionGate({context:ctx,request:good,read:readP,preflight});push('execution_gate_block_wrong_workflow',r.blockers.includes('actual_execution_workflow_not_registered')?true:false,JSON.stringify(r.blockers));}catch(e){push('execution_gate_block_wrong_workflow',false,e.message);}
 policy={...goodPolicy,execution_authority:{workflow_path:'.github/workflows/patchgate-a2-execute.yml',workflow_id:0}};
 try{const r=exec.executionGate({context:ctx,request:good,read:readP,preflight});push('execution_gate_block_zero_workflow_id',r.blockers.includes('actual_execution_workflow_not_registered')?true:false,JSON.stringify(r.blockers));}catch(e){push('execution_gate_block_zero_workflow_id',false,e.message);}
 policy={...goodPolicy,schema:'ltzzz.patchgate.a2-reconcile-policy.v9'};
 try{exec.executionGate({context:ctx,request:good,read:readP,preflight});push('execution_gate_reject_wrong_schema',false,'accepted');}catch(e){push('execution_gate_reject_wrong_schema',true,e.message);}
 policy={...goodPolicy,automatic_release_enabled:true};
 try{const r=exec.executionGate({context:ctx,request:good,read:readP,preflight});push('execution_gate_release_flag_observation',r.enabled===true?true:false,'automatic_release_enabled=true does NOT latch at gate itself (release control lives in rollout path) - observation');}catch(e){push('execution_gate_release_flag_observation',false,e.message);}

 // --- 5. signExecutorAttestation adversarial (in-memory ed25519, PEM strings) ---
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const pubPem=publicKey.export({type:'spki',format:'pem'}).toString();
 const privPem=privateKey.export({type:'pkcs8',format:'pem'}).toString();
 const HASH64='b'.repeat(64);
 const trust={schema_version:1,enabled:true,source_binding_required:true,keys:[{id:'k1',provider:'volcengine_ark',executor:'doubao',enabled:true,roles:['review'],not_before:'2026-10-01T00:00:00Z',not_after:'2026-12-31T00:00:00Z',public_key_pem:pubPem,allowed_signer_source_sha256:[HASH64],source_deployment_verified:true,cloud_account_binding:'volcengine-acc-'+HASH64.slice(0,12),deployment_evidence_sha256:HASH64}]};
 const registryOk={schema_version:1,repository:REPOSITORY,executors:[{id:'doubao',provider:'volcengine_ark',signing_key_ids:['k1'],roles:['review'],signing_enabled:true,source_deployment_verified:true,allowed_signer_source_sha256:[HASH64],cloud_account_binding:'volcengine-acc-'+HASH64.slice(0,12),deployment_evidence_sha256:HASH64}]};
 try{
  const sig=a2.signExecutorAttestation({registry:registryOk,trust,executorId:'doubao',keyId:'k1',privateKey:privPem,payload:{role:'review',subject:SHA_HEX,at_utc:'2026-10-28T09:00:00Z'}});
  const ok=vfy(null,Buffer.from(canonical(sig.payload)),cpub(pubPem),Buffer.from(sig.signature,'base64'));
  push('sign_baseline_valid',ok,'signature verifies with public key');
 }catch(e){push('sign_baseline_valid',false,e.message);}
 try{a2.signExecutorAttestation({registry:registryOk,trust,executorId:'unknown',keyId:'k1',privateKey:privPem,payload:{role:'review',subject:SHA_HEX,at_utc:'2026-10-28T09:00:00Z'}});push('sign_reject_unregistered_executor',false,'accepted');}catch(e){push('sign_reject_unregistered_executor',true,e.message);}
 try{const w=generateKeyPairSync('ed25519');a2.signExecutorAttestation({registry:registryOk,trust,executorId:'doubao',keyId:'k1',privateKey:w.privateKey.export({type:'pkcs8',format:'pem'}).toString(),payload:{role:'review',subject:SHA_HEX,at_utc:'2026-10-28T09:00:00Z'}});push('sign_reject_key_mismatch',false,'accepted');}catch(e){push('sign_reject_key_mismatch',true,e.message);}
 try{a2.signExecutorAttestation({registry:registryOk,trust,executorId:'doubao',keyId:'k1',privateKey:privPem,payload:{role:'author',subject:SHA_HEX,at_utc:'2026-10-28T09:00:00Z'}});push('sign_reject_role_not_allowed',false,'accepted');}catch(e){push('sign_reject_role_not_allowed',true,e.message);}
 try{a2.signExecutorAttestation({registry:registryOk,trust,executorId:'doubao',keyId:'k1',privateKey:privPem,payload:{role:'review',subject:SHA_HEX,at_utc:'2026-09-01T00:00:00Z'}});push('sign_reject_outside_window',false,'accepted');}catch(e){push('sign_reject_outside_window',true,e.message);}
 try{a2.signExecutorAttestation({registry:registryOk,trust,executorId:'doubao',keyId:'k1',privateKey:privPem,payload:{role:'review',subject:SHA_HEX,at_utc:'not-a-date'}});push('sign_reject_bad_time',false,'accepted');}catch(e){push('sign_reject_bad_time',true,e.message);}

 // --- 6. executionReadApi endpoint + oversized ---
 for(const [name,ep] of [['runs','/repos/ltzyz2181-collab/ltzzz/actions/runs/1'],['refs_attest','/repos/ltzyz2181-collab/ltzzz/git/ref/heads/patchgate-a2-attestations/'+'a'.repeat(64)],['admission','/repos/ltzyz2181-collab/ltzzz/contents/knowledge/results/patchgate/admission/'+'a'.repeat(64)+'.json?ref='+SHA_HEX]]){
  try{exec.validateExecutionReadEndpoint(ep);push('execution_read_allow_'+name,true,ep);}catch(e){push('execution_read_allow_'+name,false,e.message);}
 }
 for(const [name,ep] of [['env','/repos/ltzyz2181-collab/ltzzz/contents/.env?ref='+SHA_HEX],['tree','/repos/ltzyz2181-collab/ltzzz/git/trees/main'],['refs_other','/repos/ltzyz2181-collab/ltzzz/git/ref/heads/main']]){
  try{exec.validateExecutionReadEndpoint(ep);push('execution_read_reject_'+name,false,'allowed');}catch(e){push('execution_read_reject_'+name,true,e.message);}
 }
 try{await exec.executionReadApi({token:'x',fetchImpl:async()=>({status:200,body:null,text:async()=>'x'.repeat(500000)})})('/repos/ltzyz2181-collab/ltzzz/pulls/278');push('execution_read_oversize_or_disallowed',false,'no throw');}catch(e){push('execution_read_oversize_or_disallowed',true,e.message);}
}catch(e){push('probe_infrastructure',false,String(e.stack||e).slice(0,300));}

const failed=results.cases.filter(c=>!c.ok);
results.summary={cases:results.cases.length,failed:failed.length,failed_names:failed.map(c=>c.name)};
console.log(JSON.stringify(results,null,2));
