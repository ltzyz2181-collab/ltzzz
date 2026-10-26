import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {callAgent} from './call-doubao.mjs';
import {PROBE_CARD,validateProbeCard,probeContext,probeKey,checkProbePR,probeGithubApi,liveRaceProbe,summarizeProbeEvidence,assessProbeOnce,digest,verifyHistoricalRuns} from './lib/patchgate-doubao-probe.mjs';

export async function main({phase=process.argv[2],env=process.env,root=process.cwd(),call=callAgent}={}){
 const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
 const source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const context=probeContext({repository:env.GITHUB_REPOSITORY,ref:env.GITHUB_REF,event:env.GITHUB_EVENT_NAME,sourceCommit:env.GITHUB_SHA,checkoutCommit:source,runId:env.GITHUB_RUN_ID});
 const card=validateProbeCard(read(path.join(root,PROBE_CARD))),dir=path.join(root,'probe-out'),api=probeGithubApi({token:env.GITHUB_TOKEN});
 fs.mkdirSync(dir,{recursive:true});
 if(phase==='prepare'){
  const control={card,...context,card_sha256:digest(fs.readFileSync(path.join(root,PROBE_CARD)))};
  fs.writeFileSync(path.join(dir,'control.json'),JSON.stringify(control,null,2)+'\n');
  fs.copyFileSync(path.join(root,'scripts/patchgate-a2-probe-candidate.mjs'),path.join(dir,'candidate-harness.mjs'));
  fs.copyFileSync(path.join(root,'scripts/patchgate-a2-collector-probe-candidate.mjs'),path.join(dir,'patchgate-a2-collector-probe-candidate.mjs'));
  if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,`candidate_head=${card.candidate_head}\nrun_live_cas=${card.run_live_cas}\nkey=${probeKey(card,context.source_commit)}\n`);
  return {status:'prepared_no_model_call',...context,candidate_head:card.candidate_head};
 }
 const livePR=await api('GET','/repos/ltzyz2181-collab/ltzzz/pulls/'+card.candidate_pr);if(livePR.status!==200)throw Error('probe_PR_read_unavailable');checkProbePR(livePR.data,card);
 if(phase==='race'){
  if(card.run_live_cas!==true)throw Error('live_CAS_not_requested');
  const r=await liveRaceProbe({api,card,sourceCommit:source,runId:context.run_id,lane:env.A2_PROBE_LANE});
  fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(r,null,2)+'\n');return {status:r.status,lane:r.lane,key:r.key};
 }
 if(phase!=='assess')throw Error('probe_phase_not_allowed');
 const reports=env.A2_PROBE_REPORTS;if(!reports||!path.isAbsolute(reports))throw Error('probe_reports_directory_required');
 const candidate=read(path.join(reports,'a2-probe-candidate/result.json'));
 const races=card.run_live_cas?['a','b'].map(lane=>read(path.join(reports,'a2-probe-race-'+lane+'/result.json'))):[];
 const evidence=summarizeProbeEvidence({card,sourceCommit:source,runId:context.run_id,candidate,races});
 evidence.historical_runs=await verifyHistoricalRuns({api});
 let model;try{model=read(path.join(root,'data/model-routing/latest.json')).seats?.doubao?.model;}catch{}
 model=env.DOUBAO_MODEL||model||'doubao-seed-2-1-pro-260915';
 const configured=env.DOUBAO_USE_PROXY==='true'?!!env.LTZZZ_AGENT_TOKEN:!!(env.DOUBAO_API_KEY||env.ARK_API_KEY);
 const r=await assessProbeOnce({api,card,sourceCommit:source,runId:context.run_id,evidence,model,credentialConfigured:configured,
  redactKeys:[env.LTZZZ_AGENT_TOKEN,env.DOUBAO_API_KEY,env.ARK_API_KEY],call:args=>call({...args,apiKey:env.DOUBAO_API_KEY||env.ARK_API_KEY})});
 fs.writeFileSync(path.join(dir,'doubao-result.json'),JSON.stringify(r,null,2)+'\n');
 return {status:r.status,model_calls:r.model_calls,branch:r.branch,idempotency_key:r.idempotency_key,native_doubao_generation_verified:r.native_doubao_generation_verified===true,deterministic_probe_passed:evidence.deterministic_probe_passed};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(await main()));}catch{console.error('A2_Doubao_probe_failed_no_automatic_retry');process.exitCode=1;}}
