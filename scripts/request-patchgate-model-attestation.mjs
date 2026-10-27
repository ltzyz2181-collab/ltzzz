// Trusted-main producer client; no key discovery, model key, merge or trust write.
import fs from 'node:fs';import {execFileSync} from 'node:child_process';
import {actionsOidcToken,REPO} from '../patchgate-oidc.mjs';
import {MODEL_WORKFLOW,modelAudience} from '../patchgate-model-attestation-worker.js';
import {enrolledEndpoint,verifyNativeResponse} from './lib/patchgate-native-response.mjs';
import {subjectFor} from './lib/patchgate.mjs';
import {bundleDigest} from './patchgate-a2-preflight.mjs';
import {collectSnapshot} from './patchgate.mjs';
import {validateModelRequest} from '../patchgate-attestation-evidence.mjs';
const env=process.env,out=process.argv[2];
if(!out||process.argv.length!==3)throw Error('output_path_required');
const policy=JSON.parse(fs.readFileSync('config/patchgate-model-attestation.json'));
const report={task_id:'PLAN-PATCHGATE-ESCROW-20261023',source_commit:env.GITHUB_SHA||null,run_id:env.GITHUB_RUN_ID||null,run_attempt:Number(env.GITHUB_RUN_ATTEMPT)||null,status:'blocked_not_enabled',model_calls:0,paid:false,tx_hash:null,financial_execution:false};
try{
 if(policy.enabled!==true){report.blockers=['native_adapter_default_off'];}
 else{
  const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_WORKFLOW_REF!==MODEL_WORKFLOW||env.GITHUB_SHA!==head)throw Error('trusted_main_client_required');
  const endpoint=policy.endpoints.find(e=>e.provider===env.ATTESTATION_PROVIDER);
  if(!endpoint||!['aliyun_dashscope','volcengine_ark'].includes(endpoint.provider))throw Error('fixed_provider_required');
  if(policy.source_bindings_registered!==true)throw Error('source_bindings_not_registered');
  const url=enrolledEndpoint(endpoint);
  const r={schema:'ltzzz.patchgate.model-request.v1',task_id:report.task_id,role:env.ATTESTATION_ROLE,source_main_sha:head};
  if(r.role==='review'){
   if(!/^[a-f0-9]{40}$/.test(env.CANDIDATE_HEAD||'')||!/^\d{1,9}$/.test(env.CANDIDATE_PR||''))throw Error('candidate_identity');
   execFileSync('git',['fetch','--no-tags','origin',env.CANDIDATE_HEAD],{stdio:'pipe'});
   r.candidate_pr=Number(env.CANDIDATE_PR);r.candidate_head=env.CANDIDATE_HEAD;r.snapshot=collectSnapshot({base:head,head:r.candidate_head,taskId:r.task_id}).snapshot;
  }
  validateModelRequest(r);
  const jwt=await actionsOidcToken({audience:modelAudience(endpoint.executor_id)});
  // No HTTP retry, fallback or token/model values in error messages.
  report.worker_requests_attempted=1;report.model_calls=null;
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt},body:JSON.stringify(r),redirect:'error',signal:AbortSignal.timeout(240000)});
  if(!response.ok)throw Error('native_attestation_http_'+response.status);
  const result=await response.json();
  const subject=r.role==='review'?subjectFor(r.snapshot):{task_id:r.task_id,phase:'A2',runtime_bundle_sha256:bundleDigest({read:p=>fs.readFileSync(p)}).sha256};
  verifyNativeResponse({result,endpoint,subject,role:r.role,sourceCommit:head});
  report.status='native_attestation_received_not_admitted';report.model_calls=result.model_calls_this_request;report.result=result;
 }
}catch(e){report.status='failed_or_uncertain_no_retry';report.error=/^[A-Za-z0-9_]+$/.test(e.message)?e.message:'native_attestation_unavailable';process.exitCode=1;}
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:report.status,run_id:report.run_id,model_calls:report.model_calls,production_admission:false}));
