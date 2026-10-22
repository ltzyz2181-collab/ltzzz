import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {actionProfile} from './action-policy.mjs';
import {RULES} from './subnet.mjs';
import {verifyActionEvidence} from './action-evidence.mjs';
import {replayAward} from './award-replay.mjs';
const r6=n=>Number(Number(n).toFixed(6));
export function patrol(root=process.cwd()){
 const state=JSON.parse(fs.readFileSync(root+'/data/agi-econ/state.json','utf8'));
 const out=[];
 for(const [did,agent] of Object.entries(state.agents)){
  const tasks=Object.values(state.tasks).filter(t=>t.worker===did).sort((a,b)=>String(a.posted_at).localeCompare(String(b.posted_at))).slice(-20);
  const verified=[],issues=[];let blocked=0;
  for(const t of tasks){
   if(t.status==='blocked'){blocked++;continue;}
   if(!['settled','slashed'].includes(t.status))continue;
   let r;try{r=JSON.parse(fs.readFileSync(root+'/'+t.receipt,'utf8'));}catch{issues.push({task:t.id,reason:'missing_receipt'});continue;}
   if(r.worker!==did||r.task_id!==t.id||r.settlement_mode!=='internal_credit'){issues.push({task:t.id,reason:'receipt_identity_or_mode_mismatch'});continue;}
   if(t.status==='settled'){
    let body;try{body=fs.readFileSync(root+'/'+r.evidence_path);}catch{issues.push({task:t.id,reason:'missing_delivery'});continue;}
    if(!r.accepted||crypto.createHash('sha256').update(body).digest('hex')!==r.deliverable_sha256){issues.push({task:t.id,reason:'delivery_hash_or_acceptance_mismatch'});continue;}
    if(!r.auditor_model?.did||[did,t.employer].includes(r.auditor_model.did)){issues.push({task:t.id,reason:'independent_auditor_missing'});continue;}
   }
   verified.push({task:t.id,status:t.status});
  }
  const wins=verified.filter(x=>x.status==='settled').length,fails=verified.filter(x=>x.status==='slashed').length;
  const action=actionProfile(tasks,{active:agent.status==='active',verify:t=>verifyActionEvidence(root,t)});
  const review=issues.length>0||action.status==='review_required'||action.unverified>0;
  // Name the reason: an eligible seat with legacy unverified evidence is not the same
  // state as a seat that owes reputation debt, and both differ from a broken receipt.
  const flags=[];
  if(issues.length)flags.push('evidence_issues:'+issues.length);
  if(action.status==='review_required')flags.push('action_review_required');
  if(action.unverified>0)flags.push('unverified_evidence:'+action.unverified);
  if(action.probation)flags.push('probation_debt:'+action.debt);
  out.push({did,status:agent.status,reputation:agent.reputation,verified_wins:wins,verified_quality_failures:fails,infrastructure_blocks:blocked,action_profile:action,issues,review_required:review,review_flags:flags,credit_limit_recommendation:review?'review_before_new_budget':'existing_policy',automatic_penalty_applied:false});
 }
 return {at:new Date().toISOString(),run_id:process.env.GITHUB_RUN_ID||'local',window:'last 20 worker tasks per DID',model_calls:0,real_funds_moved:false,market:market(state,out,root),seats:out};
}
// Market observability: a hire market that cannot award is a deadlock, not a review.
// `stage` in a block receipt tells us where the pipeline died, so a retry can be aimed
// instead of guessed: bid/award failures are policy, worker_call failures are transport.
function market(state,out,root){
 const by=new Map(out.map(s=>[s.did,s]));
 const tasks=Object.values(state.tasks);
 const open=tasks.filter(t=>t.status==='open');
 const blocked=tasks.filter(t=>t.status==='blocked');
 const blockedByReason={};for(const t of blocked){const k=t.block_reason||'unknown';blockedByReason[k]=(blockedByReason[k]||0)+1;}
 const blockedByStage={};for(const t of blocked){let k='unrecorded';if(t.receipt){try{k=JSON.parse(fs.readFileSync(root+'/'+t.receipt,'utf8')).stage||'unrecorded';}catch{k='receipt_unreadable';}}blockedByStage[k]=(blockedByStage[k]||0)+1;}
 const workerSeats=Object.entries(state.agents).filter(([,a])=>a.status==='active'&&(a.roles||[]).includes('worker'));
 const awardable=workerSeats.filter(([did,a])=>a.reputation>=RULES.min_rep_to_bid&&by.get(did)?.action_profile?.status!=='inactive');
 const probation=awardable.filter(([did])=>by.get(did)?.action_profile?.probation===true);
 return {open_tasks:open.length,open_budget_usd:r6(open.reduce((n,t)=>n+t.budget_usd,0)),blocked_tasks:blocked.length,blocked_by_reason:blockedByReason,blocked_by_stage:blockedByStage,
  worker_seats:workerSeats.length,awardable_seats:awardable.map(([did])=>did),probation_seats:probation.map(([did])=>did),
  starvation:open.length>0&&awardable.length===0,award_gate:'reputation>=min_rep_to_bid and action-policy not inactive; probation seats bid at capped ask',
  award_replay:replaySummary(root)};
}
// Blocked tasks keep their bids, so the award gate can be re-decided offline: if the current
// policy would award them, the ledger is recoverable and nothing is waiting on a human review.
function replaySummary(root){
 try{
  const r=replayAward({root});
  if(!r.ok)return {ok:false,error:r.error};
  return {ok:true,readonly:r.readonly,blocked_with_bids:r.blocked_with_bids,replayed:r.replayed,awardable:r.awardable,
   still_rejected:r.still_rejected,awardable_by_tier:r.awardable_by_tier,model_calls:0,real_funds_moved:false};
 }catch(e){return {ok:false,error:String(e.message||e).slice(0,120)};}
}
if(process.argv[1]&&path.basename(process.argv[1])==='patrol.mjs'){
 const r=patrol();fs.mkdirSync('results/agi-econ',{recursive:true});
 fs.writeFileSync('results/agi-econ/patrol-'+r.run_id+'.json',JSON.stringify(r,null,2)+'\n');
 console.log(JSON.stringify({seats:r.seats.length,review_seats:r.seats.filter(x=>x.review_required).map(x=>({did:x.did,flags:x.review_flags})),open_tasks:r.market.open_tasks,awardable_seats:r.market.awardable_seats,probation_seats:r.market.probation_seats,blocked_by_stage:r.market.blocked_by_stage,award_replay:r.market.award_replay,starvation:r.market.starvation,model_calls:0}));
}
