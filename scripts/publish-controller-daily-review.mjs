import fs from 'node:fs';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {publishControllerDailyReview} from './lib/controller-daily-review.mjs';
import {WorkpoolGitHubStore} from './lib/workpool-github.mjs';
import {pulseToken} from './pulse-credentials.mjs';
import {pulseSnapshot,PULSE_URL,pulseGate} from './lib/pulse-client.mjs';
import {readLedger,saveLedger,syncReviewedSeats} from './lib/daily-task-board.mjs';
import {assignDailyReviewers} from './lib/daily-review-assignment.mjs';
import {reconcileDailyResult} from './lib/daily-board-lineage.mjs';
const e=process.env,repo='ltzyz2181-collab/ltzzz';
if(e.GITHUB_REPOSITORY!==repo||e.GITHUB_REF!=='refs/heads/main'||!['push','workflow_dispatch'].includes(e.GITHUB_EVENT_NAME)||!/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')||!/^\d+$/.test(e.GITHUB_RUN_ID||'')||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==e.GITHUB_SHA)throw Error('trusted_main_review_publication_required');
const request=JSON.parse(fs.readFileSync('ops/dispatch/controller-daily-review.json'));
if(request.schema!=='ltzzz.controller-daily-review.v1'||!/^\d{4}-\d{2}-\d{2}$/.test(request.date||''))throw Error('fixed_review_request_required');
const token=pulseToken('gpt'),root=process.cwd();
class ReviewLatch extends WorkpoolGitHubStore{names(key){if(!/^[a-f0-9]{64}$/.test(key))throw Error('invalid_review_key');return {ref:'heads/daily-review-publications/'+key,file:'knowledge/results/dispatch/oversight/review-publications/'+key+'.json'};}}
const latch=new ReviewLatch({repository:repo,token:e.GITHUB_TOKEN,baseCommit:e.GITHUB_SHA,baseTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim()});
const read=async file=>{if(!/^knowledge\/results\/daily-board\/(?:artifacts|reviews)\/[A-Za-z0-9_.-]+$/.test(file))throw Error('fixed_daily_artifact_path_required');const r=await fetch('https://raw.githubusercontent.com/'+repo+'/'+e.GITHUB_SHA+'/'+file,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('committed_artifact_required');return Buffer.from(await r.arrayBuffer());};
const observe=async()=>{const s=await pulseSnapshot();if(!s.available||pulseGate(s,'qianwen').state!=='fresh')throw Error('fresh_task_board_required');return s.task_board?.find(t=>t.id==='DAILY-'+request.date+'-qianwen');};
const command=async body=>{const r=await fetch(PULSE_URL+'/control',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('review_post_unverified');};
let result;
try{
 const record=readLedger(root,request.date);let reconciledLegacyRejection=null;
 const incidentRuns={'2026-11-06':'42348121504','2026-11-07':'42348185493'},priorRun=incidentRuns[request.date],priorFile='knowledge/results/dispatch/oversight/controller-daily-review-'+priorRun+'-attempt-1.json';
 if(priorRun&&fs.existsSync(priorFile)){
  const receipt=JSON.parse(fs.readFileSync(priorFile));
  if(receipt.run_id===priorRun&&receipt.task_id===record.seats.qianwen.assignment.id&&receipt.status==='review_publication_unknown_no_retry'&&receipt.post_attempted===true&&receipt.verified===false&&/^[a-f0-9]{40}$/.test(receipt.source_commit||'')){
   const old=execFileSync('git',['show',receipt.source_commit+':scripts/lib/controller-daily-review.mjs']);
   if(createHash('sha256').update(old).digest('hex')==='446fff410396900ff00b0315b9efa313c6189f97f88b2fa863e4d5bfdd004887')reconciledLegacyRejection={verified:true,task_id:receipt.task_id,review_sha256:request.review.sha256,prior_run_id:priorRun,failure:'missing_required_reason_before_mutation'};
  }
 }
 result=await publishControllerDailyReview({record,reviewRef:request.review,read,observe,command,latch,reconciledLegacyRejection});
 if(result.verified){await syncReviewedSeats({root,date:request.date,snapshot:pulseSnapshot,command,readRemote:read});const actual=readLedger(root,request.date);assignDailyReviewers(actual);saveLedger(root,actual);reconcileDailyResult(root,request.date);if(!actual.seats.qianwen.review_verified)throw Error('daily_review_readback_not_verified');}
}catch(error){result={status:'controller_review_blocked',reason:/^[a-z0-9_]{1,100}$/.test(error.message||'')?error.message:'unexpected_review_publication_failure',verified:false,model_api_calls:0};}
const output='knowledge/results/dispatch/oversight/controller-daily-review-'+e.GITHUB_RUN_ID+'-attempt-'+e.GITHUB_RUN_ATTEMPT+'.json';
fs.mkdirSync('knowledge/results/dispatch/oversight',{recursive:true});fs.writeFileSync(output,JSON.stringify({schema:'ltzzz.controller-daily-review.result.v1',task_id:'DAILY-'+request.date+'-qianwen',at_utc:new Date().toISOString(),run_id:e.GITHUB_RUN_ID,source_commit:e.GITHUB_SHA,...result,transactions:0,paid:false,tx_hash:null},null,2)+'\n');console.log(JSON.stringify({output,...result}));if(!result.verified)process.exitCode=1;
