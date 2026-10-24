// Explicit manual acceptance on trusted main only. Never enables the production switch.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {collectSnapshot} from './patchgate.mjs';
import {observerContext,observerMode,candidateIdentity,githubApi,observe} from './patchgate-observe.mjs';
const REPO='ltzyz2181-collab/ltzzz',ROOT='/repos/'+REPO;
const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:2*1024*1024,env:{...process.env,GIT_NO_REPLACE_OBJECTS:'1'}}).trim();
const requireFact=(v,code)=>{if(!v)throw Error(code);};
async function readArtifact(api,artifact) {
  const r=await api('GET',ROOT+'/contents/'+artifact.path+'?ref='+artifact.branch);
  requireFact(r.status===200&&r.data?.encoding==='base64'&&typeof r.data?.content==='string','acceptance_artifact_unreadable');
  const record=JSON.parse(Buffer.from(r.data.content,'base64').toString('utf8'));
  return {record,blob_sha:r.data.sha};
}
export async function runAcceptance({api,runnerSha,runId,prNumber,failurePrNumber,gitImpl=git,collect=collectSnapshot}) {
  requireFact(Number.isSafeInteger(prNumber)&&Number.isSafeInteger(failurePrNumber)&&prNumber>0&&failurePrNumber>0&&prNumber!==failurePrNumber,'two_test_prs_required');
  const identities=[];
  // Read and bound both targets before creating any reservation. No candidate code is run.
  for(const number of [prNumber,failurePrNumber]){
    const response=await api('GET',ROOT+'/pulls/'+number);requireFact(response.status===200,'acceptance_pr_unreadable');
    const identity=candidateIdentity(response.data);identities.push(identity);
    gitImpl(['fetch','--no-tags','origin',identity.head_sha]);
    const diffBase=gitImpl(['merge-base',runnerSha,identity.head_sha]);
    const {snapshot}=collect({base:runnerSha,head:identity.head_sha,taskId:identity.task_id,diffBase});
    requireFact(snapshot.files.length>0&&snapshot.files.every(f=>/^docs\/patchgate-a1-acceptance\/[A-Za-z0-9_-]+\.md$/.test(f.path)&&f.mode==='100644'&&!f.binary),'docs_only_acceptance_pr_required');
  }
  requireFact(identities[0].head_sha!==identities[1].head_sha,'distinct_test_heads_required');
  const counts={POST:0,PUT:0},counted=async(m,e,b)=>{if(m in counts)counts[m]++;return api(m,e,b);};
  const first=await observe({api:counted,prNumber,runnerSha,runId,expectedHead:identities[0].head_sha,gitImpl,collect});
  requireFact(first.status==='observation_complete_no_authorization'&&first.artifact,'acceptance_first_creation_failed');
  const original=await readArtifact(api,first.artifact),refPath=ROOT+'/git/ref/heads/'+first.artifact.branch;
  const before=await api('GET',refPath),writes=counts.PUT;
  const repeated=await observe({api:counted,prNumber,runnerSha,runId,expectedHead:identities[0].head_sha,gitImpl,collect});
  const after=await api('GET',refPath),unchanged=await readArtifact(api,first.artifact);
  requireFact(repeated.status==='existing_claim_reconcile_no_repeat'&&counts.PUT===writes&&before.status===200&&after.status===200
    &&before.data.object.sha===after.data.object.sha&&original.blob_sha===unchanged.blob_sha,'acceptance_duplicate_changed_state');
  const failed=await observe({api:counted,prNumber:failurePrNumber,runnerSha,runId,expectedHead:identities[1].head_sha,gitImpl,collect:()=>{throw Error('acceptance_injected_failure');}});
  requireFact(failed.status==='observation_failed'&&failed.artifact,'acceptance_failure_record_missing');
  const failure=await readArtifact(api,failed.artifact);
  requireFact(failure.record.status==='observation_failed'&&failure.record.error_code==='acceptance_injected_failure'
    &&failure.record.reservation_retained===true&&failure.record.head_sha===identities[1].head_sha,'acceptance_failure_readback_mismatch');
  return {task_id:'PLAN-PATCHGATE-ESCROW-20261023',phase:'A1_manual_runner_acceptance',source_main_sha:runnerSha,run_id:runId,at_utc:new Date().toISOString(),
    status:'three_runner_scenarios_passed',first_creation:{artifact:first.artifact,blob_sha:original.blob_sha},
    duplicate:{status:repeated.status,put_count_unchanged:true,ref_sha_unchanged:true,blob_sha_unchanged:true},
    failure_after_reservation:{artifact:failed.artifact,blob_sha:failure.blob_sha,error_code:failure.record.error_code},
    counts,production_switch_changed:false,production_activated:false,native_model_calls:0,automatic_merge:false,automatic_deploy:false,financial_execution:false,paid:false,tx_hash:null,
    limitations:['Only docs-only same-repository PR heads are qualified by this suite; fork reachability is not covered.','Runner acceptance is not native model audit or A2 signing admission.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  observerContext({ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,runnerSha:process.env.GITHUB_SHA,checkout:git(['rev-parse','HEAD']),repository:process.env.GITHUB_REPOSITORY});
  const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  requireFact(observerMode({event:process.env.GITHUB_EVENT_NAME,enabled:process.env.PATCHGATE_A1_ENABLED,inputs:event.inputs})==='acceptance','disabled_manual_acceptance_required');
  const numbers=['pr_number','failure_pr_number'].map(k=>{const v=String(event.inputs?.[k]||'');requireFact(/^[1-9]\d{0,8}$/.test(v),'numeric_test_pr_required');return Number(v);});
  fs.mkdirSync('work/patchgate-a1',{recursive:true});
  try {
    const result=await runAcceptance({api:githubApi({token:process.env.GITHUB_TOKEN}),runnerSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,prNumber:numbers[0],failurePrNumber:numbers[1]});
    fs.writeFileSync('work/patchgate-a1/acceptance.json',JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({status:result.status,source_main_sha:result.source_main_sha,production_activated:false}));
  }catch{
    fs.writeFileSync('work/patchgate-a1/acceptance.json',JSON.stringify({status:'runner_acceptance_failed_reconcile_before_retry',source_main_sha:process.env.GITHUB_SHA,run_id:process.env.GITHUB_RUN_ID,production_activated:false})+'\n');
    console.error('runner_acceptance_failed_reconcile_before_retry');process.exitCode=1;
  }
}
