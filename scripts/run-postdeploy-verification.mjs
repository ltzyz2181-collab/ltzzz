import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {persistDeploymentEvidence} from './lib/postdeploy-persistence.mjs';
import {callAgent as qwen} from './call-qwen.mjs';
import {REPOSITORY,EVIDENCE_BRANCH,EVIDENCE_DIR,sha256,jsonBytes,validateDeploymentConfig,deploymentKey,observeDeployment,deploymentIndexAssessment,reservationForReview,reviewDeployment} from './lib/postdeploy-verification.mjs';
const phase=process.argv[2],root=process.cwd(),config=validateDeploymentConfig(JSON.parse(fs.readFileSync('config/postdeploy-verification.json','utf8')));
const git=(args,cwd=root)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const source=git(['rev-parse','HEAD']),runId=process.env.GITHUB_RUN_ID,token=process.env.GITHUB_TOKEN;
const stateDir=path.join(process.env.RUNNER_TEMP||os.tmpdir(),'ltzzz-postdeploy-state-'+(runId||'local'));
const indexPath=EVIDENCE_DIR+'/index.json';
function state(){
 if(fs.existsSync(path.join(stateDir,'.git')))return stateDir;
 const remote=git(['ls-remote','--heads','origin','refs/heads/'+EVIDENCE_BRANCH]);
 if(remote){git(['fetch','origin',EVIDENCE_BRANCH]);git(['worktree','add','--detach',stateDir,'FETCH_HEAD']);}
 else git(['worktree','add','--detach',stateDir,'HEAD']);
 return stateDir;
}
function read(file){const full=path.join(state(),file);return fs.existsSync(full)?JSON.parse(fs.readFileSync(full,'utf8')):null;}
function write(file,value){const full=path.join(state(),file);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,jsonBytes(value),{flag:'wx'});}
function indexUpdate(key){
 const index=read(indexPath)||{schema:'ltzzz.postdeploy-index.v1',deployments:{}};
 const observation=read(`${EVIDENCE_DIR}/${key}.json`),review=read(`${EVIDENCE_DIR}/${key}.review.json`);
 const ref=file=>({path:file,sha256:sha256(fs.readFileSync(path.join(state(),file)))});
 const row={observation:ref(`${EVIDENCE_DIR}/${key}.json`),review:review?ref(`${EVIDENCE_DIR}/${key}.review.json`):null,...deploymentIndexAssessment(observation,review)};
 if(JSON.stringify(index.deployments[key])===JSON.stringify(row))return;
 index.deployments[key]=row;index.updated_at=new Date().toISOString();fs.writeFileSync(path.join(state(),indexPath),jsonBytes(index));
}
function persist(){return persistDeploymentEvidence(state());}

async function api(suffix,logs=false){
 if(!token)throw Error('actions_read_token_missing');
 const r=await fetch('https://api.github.com/repos/'+REPOSITORY+suffix,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},redirect:'manual',signal:AbortSignal.timeout(30000)});
 if(logs&&[301,302,303,307,308].includes(r.status)){
  const u=new URL(r.headers.get('location'));
  if(u.protocol!=='https:'||!(/\.blob\.core\.windows\.net$|\.actions\.githubusercontent\.com$|\.githubusercontent\.com$/.test(u.hostname)))throw Error('unexpected_log_download_host');
  const log=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!log.ok)throw Error('job_log_download_failed');return log.text();
 }
 if(!r.ok)throw Error('github_read_failed_'+r.status);return logs?r.text():r.json();
}
async function page(url){
 const r=await fetch(url,{redirect:'error',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
 const body=await r.text();if(body.length>1000000)throw Error('page_exceeds_evidence_limit');
 return {status:r.status,body,source_commit:r.headers.get('x-source-commit'),date:r.headers.get('date')};
}
function targetRunId(){
 if(process.env.GITHUB_EVENT_NAME==='workflow_run'){
  const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  if(event.workflow_run?.repository?.full_name!==REPOSITORY||event.workflow_run?.head_repository?.full_name!==REPOSITORY)throw Error('foreign_deployment_event_refused');
  return event.workflow_run.id;
 }
 if(process.env.GITHUB_EVENT_NAME==='push'&&process.env.GITHUB_REF==='refs/heads/codex/postdeploy-evidence-20261023')return 39887469785;
 throw Error('fixed_deployment_event_required');
}
function exportValue(key,value){if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,key+'='+value+'\n');}
if(phase==='observe'){
 const id=targetRunId(),run=await api('/actions/runs/'+id),key=deploymentKey(run);exportValue('key',key);
 const prior=read(`${EVIDENCE_DIR}/${key}.json`);
 if(prior){indexUpdate(key);persist();console.log(JSON.stringify({task_id:key,status:'existing_observation_no_duplicate_write'}));}
 else{
  let r;try{r=await observeDeployment({config,run,verifierRunId:runId,verifierSourceCommit:source,api,readPage:page});}
  catch{r={schema:'ltzzz.postdeploy-observation.v1',task_id:key,source_commit:source,observed_at_utc:new Date().toISOString(),deployment:{run_id:String(id),source_commit:run.head_sha,run_url:run.html_url},checks:{},blocker:'transport_or_metadata_unverified_no_retry',rollback:{automatic:false,availability:'not_verified'},financial_execution:false,model_calls:0,paid:false,tx_hash:null};}
  write(`${EVIDENCE_DIR}/${key}.json`,r);indexUpdate(key);persist();
  console.log(JSON.stringify({task_id:key,...deploymentIndexAssessment(r,null)}));
 }
}else if(phase==='reserve-demo-review'){
 if(process.env.GITHUB_EVENT_NAME!=='push'||process.env.GITHUB_REF!=='refs/heads/codex/postdeploy-evidence-20261023')throw Error('one_explicit_demo_only_no_paid_review_cron');
 const key='DEPLOY-39887469785-1',observation=read(`${EVIDENCE_DIR}/${key}.json`);
 if(!observation)throw Error('committed_observation_required');
 const file=`${EVIDENCE_DIR}/${key}.review-reservation.json`,prior=read(file);
 const prepared=reservationForReview({observation,runId,attempt:process.env.GITHUB_RUN_ATTEMPT||'1',sourceCommit:source,existing:prior});
 if(prepared.execute){write(file,prepared.record);persist();}
 exportValue('execute',prepared.execute);console.log(JSON.stringify({execute:prepared.execute,model_calls:0}));
}else if(phase==='review-demo'){
 const key='DEPLOY-39887469785-1',file=`${EVIDENCE_DIR}/${key}.review-reservation.json`,r=read(file),observation=read(`${EVIDENCE_DIR}/${key}.json`);
 if(!r||r.run_id!==runId||r.run_attempt!==(process.env.GITHUB_RUN_ATTEMPT||'1')||read(`${EVIDENCE_DIR}/${key}.review.json`)||read(`${EVIDENCE_DIR}/${key}.review-started.json`))throw Error('same_committed_review_reservation_required');
 // The preceding step persisted the reservation before exposing the provider Secret.
 if(git(['show','HEAD:'+file],state())!==jsonBytes(r).trim())throw Error('review_reservation_not_committed');
 write(`${EVIDENCE_DIR}/${key}.review-started.json`,{task_id:key,run_id:runId,started_at_utc:new Date().toISOString(),status:'native_outcome_unknown_until_response'});persist();
 let review;
 if(!process.env.DASHSCOPE_API_KEY&&!process.env.QWEN_API_KEY)review={...r,status:'not_configured_no_model_call',model_calls:0};
 else review=await reviewDeployment(r,{observation,call:prompt=>qwen({apiKey:process.env.DASHSCOPE_API_KEY||process.env.QWEN_API_KEY,prompt,maxTokens:1000})});
 write(`${EVIDENCE_DIR}/${key}.review.json`,review);indexUpdate(key);persist();console.log(JSON.stringify({status:review.status,model_calls:review.model_calls}));
}else if(phase==='import'){
 const remote=git(['ls-remote','--heads','origin','refs/heads/'+EVIDENCE_BRANCH]);
 if(!remote){console.log(JSON.stringify({status:'evidence_branch_not_created_no_verified_deployments'}));}
 else{
  git(['fetch','origin',EVIDENCE_BRANCH]);const index=JSON.parse(git(['show','FETCH_HEAD:'+indexPath])),base=path.join(root,'.cache/postdeploy');fs.mkdirSync(base,{recursive:true});
  // Copy only strict receipt paths, never scripts or executable artifacts from the evidence branch.
  for(const row of Object.values(index.deployments||{}))for(const ref of [row.observation,row.review].filter(Boolean)){
   if(!/^knowledge\/results\/deployment-verification\/DEPLOY-\d+-\d+(?:\.review)?\.json$/.test(ref.path))throw Error('unsafe_postdeploy_cache_reference');
   const bytes=execFileSync('git',['show','FETCH_HEAD:'+ref.path],{cwd:root});if(sha256(bytes)!==ref.sha256)throw Error('postdeploy_cache_hash_mismatch');
   const file=path.join(base,ref.path);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
  }
  fs.writeFileSync(path.join(base,'index.json'),jsonBytes(index));console.log(JSON.stringify({status:'canonical_evidence_imported',source_branch:EVIDENCE_BRANCH,deployments:Object.keys(index.deployments||{}).length}));
 }
}else if(phase==='summary'){
 const index=read(indexPath);for(const [id,row] of Object.entries(index?.deployments||{})){
  const line=`${id}: ${row.label}; checks=${row.checks_verified}; independent_review=${row.independent_native_review_verified}`;
  console.log((row.status==='deployment_reverified'?'::notice::':'::warning::')+line+'; rollback=manual_only');
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,line+'\n\n');
 }
}else throw Error('Use fixed observe/reserve-demo-review/review-demo/import/summary phase');
