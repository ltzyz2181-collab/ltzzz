import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {WorkpoolGitHubStore} from './lib/workpool-github.mjs';
import {sha256,parseTask,routeTask,unitKey,leaseStatus,acquireLease,updateLease} from './lib/workpool-policy.mjs';

const REPOSITORY='ltzyz2181-collab/ltzzz';
const EXECUTOR={id:'workpool-repository-rules'};
function issueRecord(value) { return {number:value.number,repository:REPOSITORY,author:value.user?.login,state:value.state,labels:(value.labels||[]).map(x=>typeof x==='string'?x:x.name)}; }

export async function runWorkpool({root=process.cwd(),env=process.env,fetcher=fetch,mode='observe'}={}) {
  if (!['observe','claim-event','claim-readonly'].includes(mode)) throw Error('unsupported_workpool_mode');
  const policy=JSON.parse(fs.readFileSync(path.join(root,'config/workpool.json'),'utf8'));
  const core=fs.readFileSync(path.join(root,'CORE-VIEW.md'),'utf8'),coreHash=sha256(core);
  if (coreHash!==policy.core_view_sha256 || policy.requires_owner_confirmation!==false || policy.formal_five_signature_enabled!==false) throw Error('trusted_workpool_policy_mismatch');
  if (!env.GITHUB_TOKEN) return {status:'github_transport_not_configured',model_calls:0};
  const api=async suffix=>{
    const r=await fetcher(`https://api.github.com/repos/${REPOSITORY}/${suffix}`,{headers:{Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(25000)});
    if (!r.ok) throw Error(`workpool_read_http_${r.status}`);
    return {data:await r.json(),next:!!r.headers?.get('link')?.includes('rel="next"')};
  };
  const main=(await api('git/ref/heads/main')).data.object.sha;
  const remoteCore=(await api(`contents/CORE-VIEW.md?ref=${main}`)).data;
  const remotePolicy=(await api(`contents/config/workpool.json?ref=${main}`)).data;
  if (sha256(Buffer.from(remoteCore.content,'base64'))!==coreHash || sha256(Buffer.from(remotePolicy.content,'base64'))!==sha256(fs.readFileSync(path.join(root,'config/workpool.json')))) throw Error('stale_context_refresh_from_main_without_owner_wait');
  const tree=(await api(`git/commits/${main}`)).data.tree.sha;
  const store=new WorkpoolGitHubStore({repository:REPOSITORY,token:env.GITHUB_TOKEN,baseCommit:main,baseTree:tree,fetcher});
  let issues,partial=false;
  if (mode==='claim-event') {
    const event=JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
    if (env.GITHUB_REPOSITORY!==REPOSITORY || env.GITHUB_ACTOR!=='ltzyz2181-collab' || !Number.isSafeInteger(event.issue?.number)) throw Error('trusted_issue_event_required');
    issues=[(await api(`issues/${event.issue.number}`)).data];
  } else { const listed=await api('issues?state=open&labels=work%3Aopen&sort=created&direction=asc&per_page=100');issues=listed.data;partial=listed.next; }
  const observations=[];
  for (const issue of issues) {
    if (issue.pull_request) continue;
    const context=issueRecord(issue);let task;
    try { task=parseTask(issue.body); } catch { observations.push({issue:issue.number,route:'controller',reason:'task_JSON_unverified',owner_confirmation_required:false});continue; }
    const route=routeTask(task,context,policy);
    const observed={issue:issue.number,task_id:task.task_id,step_id:task.step_id,...route};
    if (route.route==='pool') {
      const current=await store.read(unitKey(task));observed.lease_status=leaseStatus(current?.state);
      if (mode!=='observe' && task.kind==='repo_readonly') {
        const claim=await acquireLease({task,issue:context,policy,coreHash,sourceCommit:main,executor:EXECUTOR,store});
        observed.claim_status=claim.status;
        if (claim.acquired && task.kind==='repo_readonly') {
          // The only built-in execution is hashing fixed public repository paths.
          // No issue text is evaluated as code, no model API, registrations or money.
          const rows=[];
          for (const file of task.read_paths) {
            const result=(await api(`contents/${file.split('/').map(encodeURIComponent).join('/')}?ref=${main}`)).data;
            if (result.type!=='file' || result.encoding!=='base64') throw Error('tracked_public_file_required');
            const bytes=Buffer.from(result.content,'base64');rows.push({path:file,bytes:bytes.length,sha256:sha256(bytes)});
          }
          const record={task_id:task.task_id,step_id:task.step_id,logical_seat:task.requested_seat,actual_provider:null,model:null,execution_provider:env.GITHUB_ACTIONS==='true'?'github_actions':'authenticated_github_client',metadata_source:'repository_rules_no_model',source_commit:main,core_view_sha256:coreHash,run_id:env.GITHUB_RUN_ID||null,files:rows,preflight:claim.lease.decision_record,model_calls:0,accepted:false,paid:false,tx_hash:null,status:'deterministic_output_waiting_independent_review'};
          const content=JSON.stringify(record,null,2)+'\n';
          const artifact={path:`knowledge/results/workpool/artifacts/${unitKey(task)}/${claim.lease.lease_id}.json`,sha256:sha256(content),content};
          const submitted=await updateLease({key:unitKey(task),leaseId:claim.lease.lease_id,executorId:EXECUTOR.id,action:'submit',artifact,store});
          observed.submission_status=submitted.status;observed.artifact={path:artifact.path,sha256:artifact.sha256,ref:`workpool/leases/${unitKey(task)}`};
        }
      } else if (task.kind!=='repo_readonly') {
        observed.delivery_status='available_waiting_authenticated_actual_client';
      }
    }
    observations.push(observed);
  }
  const result={task_id:policy.task_id,status:'observed',at_utc:new Date().toISOString(),source_commit:main,core_view_sha256:coreHash,run_id:env.GITHUB_RUN_ID||null,partial_list:partial,observations,model_calls:0,owner_confirmation_required:false,formal_five_signature_enabled:false,financial_execution:false,paid:false,tx_hash:null,unattended_acceptance_verified:false};
  const file=path.join(root,'knowledge/results/workpool/latest.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');
  return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try { console.log(JSON.stringify(await runWorkpool({mode:process.argv[2]||'observe'}))); }
  catch { console.error('workpool_transport_or_context_unverified_reconcile_before_retry');process.exitCode=1; }
}
