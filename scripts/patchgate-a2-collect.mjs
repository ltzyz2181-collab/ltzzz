// No model, merge, key generation, private-file discovery or enrollment here.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {classify,scanDiff,TASK} from './lib/patchgate.mjs';
import {collectSnapshot} from './patchgate.mjs';
import {collectorGithubApi,collectA2Readiness,validateCollectionRequest} from './lib/patchgate-a2-collector.mjs';

const sha=s=>{if(!/^[a-f0-9]{40}$/.test(s||''))throw Error('full_commit_required');return s;};
const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:2000000,env:{...process.env,GIT_NO_REPLACE_OBJECTS:'1'}}).trim();
export function baseCheckContext({env,p,source}){
  sha(source);
  if(env.GITHUB_EVENT_NAME!=='pull_request_target'||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_SHA!==source
    ||!p||p.base?.repo?.full_name!=='ltzyz2181-collab/ltzzz'||p.head?.repo?.full_name!==p.base.repo.full_name
    ||!['OWNER','MEMBER','COLLABORATOR'].includes(p.author_association)||p.base.ref!=='main'
    ||!Number.isSafeInteger(p.number)||p.number<1)throw Error('trusted_same_repository_base_required');
  if(sha(p.base.sha)!==source)throw Error('stale_event_base_requalify_required');
  return {base:source,head:sha(p.head.sha),pr_number:p.number};
}
export function baseCheckEligibility({env,p,source,files,policy,ancestor=true}){
  try{baseCheckContext({env,p,source});}catch(e){
    if(e.message!=='stale_event_base_requalify_required')throw e;
    return {eligible:false,status:'stale_event_base_requalify_required',base_sha:source,event_base_sha:p.base.sha,passed:false};
  }
  if(!ancestor)return {eligible:false,status:'stale_candidate_rebase_required',base_sha:source,passed:false};
  const risk=classify(policy,files),findings=scanDiff(policy,files);
  const eligible=files.length>0&&risk.level==='L0'&&!risk.modifies_own_checks&&findings.length===0
    &&files.every(f=>f.mode==='100644'&&f.path.endsWith('.md')&&!f.binary);
  return {eligible,status:eligible?'eligible_for_qualification_not_yet_passed':'outside_A2_L0_markdown_scope',base_sha:source,risk,findings,passed:false};
}
export async function main(args){
  const [mode,output]=args;
  if(args.length!==2||!['readiness','base-check','bootstrap'].includes(mode)||!output?.endsWith('.json'))throw Error('usage_collect_readiness_or_base_check_output_json');
  const source=sha(git(['rev-parse','HEAD']));
  let result;
  if(mode==='bootstrap'){
    const p=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')).pull_request;
    const policy=JSON.parse(fs.readFileSync('config/patchgate-a2-collector.json'));
    if(policy.mode!=='observation_only'||policy.signing_enabled!==false||policy.automatic_merge!==false||policy.financial_execution!==false)throw Error('readonly_checker_policy_required');
    let identity;
    try{identity=baseCheckContext({env:process.env,p,source});}catch(e){if(e.message!=='stale_event_base_requalify_required')throw e;}
    let snapshot={files:[]},patchPolicy={};let ancestor=false;
    if(identity){
      git(['fetch','--no-tags','origin',identity.head]);
      try{git(['merge-base','--is-ancestor',source,identity.head]);ancestor=true;}catch{}
      if(ancestor){const collected=collectSnapshot({base:source,head:identity.head,taskId:TASK});snapshot=collected.snapshot;patchPolicy=collected.policy;}
    }
    const assessment=baseCheckEligibility({env:process.env,p,source,files:snapshot.files,policy:patchPolicy,ancestor});
    result={schema:'ltzzz.patchgate.a2-base-bootstrap.v1',task_id:TASK,checker_base_sha:source,head_sha:sha(p.head.sha),pr_number:p.number,...assessment,readonly_checks_enabled:policy.readonly_checks_enabled===true,signed:false,automatic_merge:false,financial_execution:false,paid:false,tx_hash:null};
    if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`enabled=${policy.readonly_checks_enabled===true}\neligible=${policy.readonly_checks_enabled===true&&assessment.eligible}\n`);
  }else if(mode==='readiness'){
    const request=validateCollectionRequest(JSON.parse(process.env.PATCHGATE_COLLECTION_REQUEST||'null'));
    const api=collectorGithubApi({token:process.env.GITHUB_TOKEN});
    const current=await api('/repos/ltzyz2181-collab/ltzzz/git/ref/heads/main');
    if(current.status!==200||current.data?.ref!=='refs/heads/main')throw Error('current_main_unreadable');
    const base=sha(current.data.object?.sha);
    const policy=JSON.parse(fs.readFileSync('config/patchgate-a2-collector.json','utf8'));
    if(policy.schema!=='ltzzz.patchgate.a2-collector-policy.v1'||policy.mode!=='observation_only'||policy.repository!=='ltzyz2181-collab/ltzzz'
      ||policy.signing_enabled!==false||policy.automatic_merge!==false||policy.financial_execution!==false)throw Error('observation_only_collector_policy_required');
    result=await collectA2Readiness({api,request,baseSha:base,authority:policy.check_authority});
    // No workflow is registered just because a request or workflow exists.
    // Registration is a later reviewed BASE change after its real ID is read back.
    result.authority_registration=policy.registration_status;
    result.collector_source_commit=source;
    result.trusted_main_execution=process.env.GITHUB_REF==='refs/heads/main'&&process.env.GITHUB_SHA===source&&source===base;
  }else{
    const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')),p=event.pull_request;
    const {head}=baseCheckContext({env:process.env,p,source});
    git(['fetch','--no-tags','origin',head]);
    git(['merge-base','--is-ancestor',source,head]); // stale bases are not qualified
    const {policy,snapshot}=collectSnapshot({base:source,head,taskId:TASK});
    const risk=classify(policy,snapshot.files),findings=scanDiff(policy,snapshot.files);
    const passed=snapshot.files.length>0&&risk.level==='L0'&&!risk.modifies_own_checks&&findings.length===0
      &&snapshot.files.every(f=>f.mode==='100644'&&f.path.endsWith('.md')&&!f.binary);
    result={schema:'ltzzz.patchgate.a2-base-check.v1',task_id:TASK,checker_base_sha:source,head_sha:head,pr_number:p.number,
      passed,risk,findings,native_model_calls:0,automatic_merge:false,automatic_deploy:false,financial_execution:false,paid:false,tx_hash:null};
    if(!passed)process.exitCode=1;
  }
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  if(mode==='readiness')console.log(JSON.stringify({collection_observation:{source_main_sha:result.source_main_sha,collector_source_commit:source,
    trusted_main_execution:result.trusted_main_execution,checks:result.checks,base_protection:result.base_protection,errors:result.errors,
    claude_artifact:result.claude_audit?{pr:result.claude_audit.pr_number,head:result.claude_audit.pr_head_sha,artifact:result.claude_audit.artifact,
      verdict:result.claude_audit.machine_readable_verdict,bundle_verification:result.claude_audit.reviewed_bundle_verification,native_authorship_verified:false}:null,
    signed:false,automatic_merge:false,native_model_calls:0}}));
  console.log(JSON.stringify({status:result.status||'base_check_completed',passed:result.passed??false,output,signed:false,automatic_merge:false}));
}
if(import.meta.url===`file://${process.argv[1]}`)main(process.argv.slice(2)).catch(error=>{console.error(/^[A-Za-z0-9_]+$/.test(error.message)?error.message:'collector_failed_no_authorization');process.exitCode=1;});
