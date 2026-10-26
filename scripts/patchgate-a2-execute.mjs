import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {A2_BUNDLE_FILES} from './patchgate-a2-preflight.mjs';
import {collectSnapshot} from './patchgate.mjs';
import {collectorGithubApi,collectTrustedChecks} from './lib/patchgate-a2-collector.mjs';
import {a2GithubApi} from './lib/patchgate-a2.mjs';
import {executionContext,executionRequest,executionGate,executionReadApi,executeA2} from './lib/patchgate-a2-executor.mjs';
const gitRaw=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:3000000,stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_NO_REPLACE_OBJECTS:'1'}});
const git=args=>gitRaw(args).trim();
async function main(){
const [mode,output]=process.argv.slice(2);
if(process.argv.length!==4||!['gate','run'].includes(mode)||!process.env.RUNNER_TEMP||output!==path.join(fs.realpathSync(process.env.RUNNER_TEMP),mode==='gate'?'patchgate-a2-gate.json':'patchgate-a2-execution.json'))throw Error('fixed_runner_output_and_mode_required');
const context=executionContext({env:process.env,checkout:git(['rev-parse','HEAD'])}),request=executionRequest(process.env.PATCHGATE_A2_REQUEST);
const read=name=>{if(!A2_BUNDLE_FILES.includes(name))throw Error('fixed_execution_bundle_file_required');return gitRaw(['show',context.source+':'+name]);};
let report;
if(mode==='gate'){
  const g=executionGate({context,request,read});
  report={task_id:request.task_id,status:g.enabled?'execution_prerequisites_present_not_executed':'A2_disabled_or_unprovisioned',source_commit:context.source,run_id:context.run_id,blockers:g.blockers,runtime_bundle_sha256:g.runtime_bundle.sha256,automatic_merge:false,financial_execution:false};
  fs.appendFileSync(process.env.GITHUB_OUTPUT,'execute='+g.enabled+'\n');
}else{
  if(!process.env.GITHUB_TOKEN)throw Error('managed_GitHub_execution_credential_missing');
  const token=process.env.GITHUB_TOKEN,api=collectorGithubApi({token});
  report=await executeA2({context,request,read,readApi:executionReadApi({token}),mergeApi:a2GithubApi({token}),collectChecks:args=>collectTrustedChecks({api,...args}),snapshotFor:async({base,head})=>{
    if(!/^[a-f0-9]{40}$/.test(head))throw Error('full_candidate_commit_required');
    git(['fetch','--no-tags','origin',head]);git(['merge-base','--is-ancestor',base,head]);
    return collectSnapshot({base,head,taskId:request.task_id});
  }});
}
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,automatic_merge:report.automatic_merge,source_commit:context.source,run_id:context.run_id,blockers:report.blockers,error:report.error}));
if(mode==='run'&&report.status!=='merged_readback_verified')process.exitCode=1;
}
main().catch(e=>{console.error(/^[A-Za-z0-9_]+$/.test(e.message)?e.message:'execution_failed_details_not_exported');process.exitCode=1;});
