// No model, merge, key generation, private-file discovery or enrollment here.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {classify,scanDiff,TASK} from './lib/patchgate.mjs';
import {collectSnapshot} from './patchgate.mjs';
import {collectorGithubApi,collectA2Readiness,validateCollectionRequest} from './lib/patchgate-a2-collector.mjs';

const sha=s=>{if(!/^[a-f0-9]{40}$/.test(s||''))throw Error('full_commit_required');return s;};
const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:2000000,env:{...process.env,GIT_NO_REPLACE_OBJECTS:'1'}}).trim();
export async function main(args){
  const [mode,output]=args;
  if(args.length!==2||!['readiness','base-check'].includes(mode)||!output?.endsWith('.json'))throw Error('usage_collect_readiness_or_base_check_output_json');
  const source=sha(git(['rev-parse','HEAD']));
  let result;
  if(mode==='readiness'){
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
    if(!p||p.base?.repo?.full_name!=='ltzyz2181-collab/ltzzz'||p.head?.repo?.full_name!==p.base.repo.full_name
      ||!['OWNER','MEMBER','COLLABORATOR'].includes(p.author_association)||p.base.ref!=='main'||sha(p.base.sha)!==source)throw Error('trusted_same_repository_base_required');
    const head=sha(p.head.sha);
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
  console.log(JSON.stringify({status:result.status||'base_check_completed',passed:result.passed??false,output,signed:false,automatic_merge:false}));
}
if(import.meta.url===`file://${process.argv[1]}`)main(process.argv.slice(2)).catch(error=>{console.error(/^[A-Za-z0-9_]+$/.test(error.message)?error.message:'collector_failed_no_authorization');process.exitCode=1;});
