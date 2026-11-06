import {createHash} from 'node:crypto';
export const GOAL_ID='GOAL-LTZZZ-AUTONOMY-20261105';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function safeEvidence(ref){return !!ref&&/^knowledge\/results\/[A-Za-z0-9_./-]+$/.test(ref.path||'')&&!ref.path.split('/').some(p=>p==='..'||p==='.'||p.startsWith('.env')||/^(?:secrets?|credentials?|private[-_]?keys?)\./i.test(p))&&/^[a-f0-9]{40}$/.test(ref.source_commit||'')&&/^[a-f0-9]{64}$/.test(ref.sha256||'');}
export function evaluateGoal(goal,state,{readPinned,now=new Date().toISOString()}={}){
 if(goal?.schema!=='ltzzz.autonomy.goal.v1'||goal.goal_id!==GOAL_ID||state?.goal_id!==GOAL_ID)throw Error('goal_identity_required');
 const errors=[],tracks=[];
 function verified(ref){if(!safeEvidence(ref))return false;try{return digest(readPinned(ref))===ref.sha256;}catch{return false;}}
 for(const track of goal.tracks){
  const row=state.tracks?.[track.id]||{},required=track.acceptance_checks;
  if(!Array.isArray(required)||!required.length)throw Error('goal_acceptance_checks_required');
  const checks=required.map(id=>{
   const c=row.checks?.[id],refs=c?.evidence_refs;
   const passed=c?.verified===true&&Array.isArray(refs)&&refs.length>0&&refs.every(verified);
   if(c?.verified===true&&!passed)errors.push('unverified_evidence:'+track.id+':'+id);
   return {id,verified:passed,evidence_refs:Array.isArray(refs)?refs.filter(safeEvidence):[]};
  });
  tracks.push({id:track.id,status:checks.every(c=>c.verified)?'evidence_refs_verified':row.status||'pending',verified_checks:checks.filter(c=>c.verified).length,required_checks:checks.length,checks,blockers:row.blockers||[]});
 }
 const all=tracks.every(t=>t.verified_checks===t.required_checks),closeout=state.controller_closeout;
 let closed=false;
 if(all&&closeout?.seat==='gpt'&&verified(closeout.evidence_ref)){
  try{
   const c=JSON.parse(readPinned(closeout.evidence_ref));
   const required=tracks.flatMap(t=>t.checks.map(c=>t.id+':'+c.id)).sort();
   closed=c.schema==='ltzzz.autonomy.goal-closeout.v1'&&c.goal_id===GOAL_ID&&c.controller==='gpt'&&c.decision==='all_acceptance_evidenced'&&Array.isArray(c.verified_checks)&&JSON.stringify([...new Set(c.verified_checks)].sort())===JSON.stringify(required);
  }catch{}
 }
 if(state.status==='completed'&&!closed)errors.push('completion_claim_not_supported');
 // Dates are planning targets, never authority to buy, invest or declare income.
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:goal.planning_window.timezone||'America/North_Dakota/Beulah',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));
 const localDate=[parts.year,parts.month,parts.day].join('-');
 const day=Math.floor((Date.parse(localDate+'T00:00:00Z')-Date.parse(goal.planning_window.start+'T00:00:00Z'))/86400000)+1;
 const planned=day<=2?'P0':day<=5?'P1':day<=8?'P2':day<=11?'P3':'P4';
 const status=errors.length?'blocked_evidence_integrity':closed?'completed':all?'awaiting_GPT_closeout':'active_acceptance_pending';
 const semantic={goal_id:GOAL_ID,status,active_phase:state.active_phase||'P0',tracks,errors,controller_closeout_verified:closed};
 return {schema:'ltzzz.autonomy.goal-observation.v1',...semantic,observed_at_utc:now,planned_phase:planned,target_review_date:goal.planning_window.target_review,auto_expire:false,goal_completed:closed,owner_routine_operations_required:false,evidence_scope:'Pinned repository bytes verified; external acceptance and bank/provider facts require their actual receipts and GPT closeout.',progress_fingerprint:digest(JSON.stringify(semantic)),model_calls:0,transactions:0,paid:false,tx_hash:null};
}
