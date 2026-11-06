import fs from 'node:fs';import {execFileSync} from 'node:child_process';
import {GOAL_ID,evaluateGoal} from './lib/autonomy-goal.mjs';
const e=process.env;
if(e.GITHUB_REPOSITORY!=='ltzyz2181-collab/ltzzz'||e.GITHUB_REF!=='refs/heads/main'||!['push','workflow_dispatch','workflow_run'].includes(e.GITHUB_EVENT_NAME)||!/^\d+$/.test(e.GITHUB_RUN_ID||'')||!/^\d+$/.test(e.GITHUB_RUN_ATTEMPT||'')||!/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==e.GITHUB_SHA)throw Error('trusted_main_goal_observation_required');
if(e.GITHUB_EVENT_NAME==='workflow_run'){
 const event=JSON.parse(fs.readFileSync(e.GITHUB_EVENT_PATH));const r=event.workflow_run;
 if(event.action!=='completed'||r?.conclusion!=='success'||!['Deep Superagent queue and GPT decision bridge','Key Liveness Probe (AI seats)','Kimi zero-generation readonly lease diagnostics'].includes(r.name)||r.head_repository?.full_name!=='ltzyz2181-collab/ltzzz'||r.head_branch!=='main'||['pull_request','pull_request_target'].includes(r.event))throw Error('trusted_upstream_goal_event_required');
}
const goal=JSON.parse(fs.readFileSync('ops/goals/'+GOAL_ID+'.json')),state=JSON.parse(fs.readFileSync('ops/goals/'+GOAL_ID+'.state.json'));
const observed=evaluateGoal(goal,state,{readPinned:ref=>{execFileSync('git',['merge-base','--is-ancestor',ref.source_commit,'HEAD'],{stdio:'ignore'});return execFileSync('git',['show',ref.source_commit+':'+ref.path],{maxBuffer:4000000});}});
Object.assign(observed,{run_id:e.GITHUB_RUN_ID,run_attempt:e.GITHUB_RUN_ATTEMPT,source_commit:e.GITHUB_SHA});
const output='knowledge/results/goals/'+GOAL_ID+'.json';let old;try{old=JSON.parse(fs.readFileSync(output));}catch{}
if(old?.progress_fingerprint===observed.progress_fingerprint)console.log(JSON.stringify({status:'goal_observed_no_progress_change',goal_id:GOAL_ID,observed_at_utc:observed.observed_at_utc,model_calls:0,transactions:0}));
else{fs.mkdirSync('knowledge/results/goals',{recursive:true});fs.writeFileSync(output,JSON.stringify(observed,null,2)+'\n');console.log(JSON.stringify({status:observed.status,goal_id:GOAL_ID,output,goal_completed:observed.goal_completed,model_calls:0}));}
if(observed.errors.length)process.exitCode=1;
