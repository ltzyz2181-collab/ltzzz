import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {PANEL_LIMITS} from './limits.mjs';import {validateProposal,validateVote} from './schema.mjs';
export function verifyEvidence(proposal,{rootDir=process.cwd(),evidenceIndex={}}={}){
 const root=fs.realpathSync(rootDir),results=[];
 for(const e of proposal.evidence){
  const indexed=Object.hasOwn(evidenceIndex,e.receipt_id)?evidenceIndex[e.receipt_id]:null;
  const relative=e.path||indexed?.path,row={receipt_id:e.receipt_id,exists:false,hash_ok:false,run_id_ok:e.run_id?false:null};
  try{
   if(typeof relative!=='string'||! /^(?:knowledge\/results|results|data\/results|ops\/dispatch\/receipts)\//.test(relative)||relative.includes('\\')||relative.split('/').includes('..'))throw Error('evidence_path_outside_receipts');
   const file=fs.realpathSync(path.resolve(root,relative));
   if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile())throw Error('evidence_realpath_outside_root');
   const bytes=fs.readFileSync(file),actual=crypto.createHash('sha256').update(bytes).digest('hex');
   row.exists=true;row.path=relative;row.actual_hash=actual;row.hash_ok=typeof e.hash==='string'&&actual===e.hash;
   if(indexed?.hash&&indexed.hash!==actual)row.hash_ok=false;
   if(e.run_id){let d;try{d=JSON.parse(bytes);}catch{}const run=d?.run_id??d?.execution_id;row.run_id_ok=run!=null&&String(run)===e.run_id&&(!indexed?.run_id||String(indexed.run_id)===e.run_id);}
  }catch(e){row.error=e.message;}
  results.push(row);
 }
 return {ok:results.length>0&&results.every(r=>r.exists&&r.hash_ok&&r.run_id_ok!==false),results};
}
const money=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&Number.isSafeInteger(Math.round(v*1e6))&&Math.abs(v*1e6-Math.round(v*1e6))<=1e-6?Math.round(v*1e6):null;
export function checkStepAndCeiling(proposal,{currentLimitUsd=0,recentStepUps=[],spendState,now=Date.now()}={}){
 const amount=money(proposal.requested.amount_usd),failures=[];
 if(amount===null)return {ok:false,failures:[{code:'invalid_amount'}]};
 const cap=(value,max,code)=>{if(value>money(max))failures.push({code,max,amount:value/1e6});};
 if(proposal.kind==='rentahuman_pilot')cap(amount,PANEL_LIMITS.maxRentAHumanSingleUsd,'over_rah_single');
 if(['external_purchase','rentahuman_pilot'].includes(proposal.kind)){
  cap(amount,PANEL_LIMITS.maxSingleExternalUsd,'over_single_external');
  const daily=money(spendState?.daily_external_usd),outbound=money(spendState?.daily_outbound_usd),pilot=money(spendState?.pilot_total_usd);
  if(daily===null||outbound===null||proposal.kind==='rentahuman_pilot'&&pilot===null)failures.push({code:'spend_state_required'});
  else{cap(amount+daily,PANEL_LIMITS.maxDailyExternalPurchaseUsd,'over_daily_external');cap(amount+outbound,PANEL_LIMITS.maxDailyOutboundUsd,'over_daily_outbound');if(proposal.kind==='rentahuman_pilot')cap(amount+pilot,PANEL_LIMITS.maxRentAHumanPilotTotalUsd,'over_rah_pilot_total');}
 }
 if(proposal.kind==='limit_step_up'){
  const current=money(currentLimitUsd);
  if(current===null||current===0)failures.push({code:'valid_current_limit_required'});
  else{cap(amount,PANEL_LIMITS.maxSingleExternalUsd,'over_absolute_step_ceiling');if(amount>Math.floor(current*(1+PANEL_LIMITS.maxStepUpRatio)))failures.push({code:'step_up_over_20pct'});}
  if(!Array.isArray(recentStepUps)||recentStepUps.some(t=>!Number.isFinite(Date.parse(t))))failures.push({code:'step_history_invalid'});
  else if(recentStepUps.filter(t=>Date.parse(t)>=now-7*86400000).length>=PANEL_LIMITS.maxStepUpsPer7Days)failures.push({code:'step_up_weekly_cap'});
 }
 return {ok:failures.length===0,failures,basis:'caller_supplied_shadow_state_not_atomic_funding_reservation',amount_usd_definition:'maximum_total_outlay_including_fees',spending_authorized:false};
}
export function tallyVotes(votes,proposal){
 if(!Array.isArray(votes))return {ok:false,error:'votes_must_be_array',votes:[],provider_execution_verified:false};
 const byProvider=new Map(),invalid=[];let duplicate=false;
 for(const v of votes){const r=validateVote(v,proposal);if(!r.ok){invalid.push(r.error);continue;}if(byProvider.has(r.vote.provider))duplicate=true;else byProvider.set(r.vote.provider,r.vote);}
 const unique=[...byProvider.values()],passes=unique.filter(v=>v.vote==='pass'),rejects=unique.filter(v=>v.vote==='reject');
 const split=passes.length>0&&rejects.length>0;
 return {ok:invalid.length===0&&!duplicate&&unique.length===3&&passes.length>=2,pass_count:passes.length,reject_count:rejects.length,providers_pass:passes.map(v=>v.provider),funds_related_split:split,invalid_votes:invalid,duplicate_provider_votes:duplicate,votes:unique,provider_execution_verified:false,scope:'shadow_vote_claims_only_not_authenticated_provider_votes',supervisory_warnings:split?['minority_dissent_preserved']:[]};
}
export function regulate(rawProposal,votes,ctx={}){
 const base={mode:'shadow',applies:false,spending_authorized:false,independent_provider_execution_verified:false,at:new Date(ctx.now??Date.now()).toISOString()};
 if(ctx.mode&&ctx.mode!=='shadow')return {...base,ok:false,stage:'mode',error:'only_shadow_supported'};
 const vp=validateProposal(rawProposal);if(!vp.ok)return {...base,...vp,stage:'schema'};
 const evidence=verifyEvidence(vp.proposal,ctx);if(!evidence.ok)return {...base,ok:false,stage:'evidence',error:'evidence_failed',evidence};
 const step=checkStepAndCeiling(vp.proposal,ctx);if(!step.ok)return {...base,ok:false,stage:'limits',error:'limit_failed',step,evidence};
 const tally=tallyVotes(votes,vp.proposal);if(!tally.ok)return {...base,ok:false,stage:'votes',error:tally.funds_related_split?'funds_related_panel_split':'vote_failed',tally,evidence,step};
 return {...base,ok:true,stage:'shadow_regulated',proposal:vp.proposal,evidence,step,tally,cooldown_hours:PANEL_LIMITS.cooldownHoursAfterPass,limits_authority:'illustrative_proposal_not_owner_funding_authorization'};
}
