import {createHash} from 'node:crypto';
export const GOAL_ID='GOAL-LTZZZ-AUTONOMY-20261105';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const COMMIT=/^[a-f0-9]{40}$/;
const HASH=/^[a-f0-9]{64}$/;
const CORRECTION_PATH='knowledge/results/goals/corrections/20261113-source-ancestry-correction.json';
const RELEASE_RECEIPT_PATH='knowledge/results/products/delivery-check-0.1.0-release-20261108.json';
const RELEASE_PACKAGE_PATH='products/releases/ltzzz-delivery-check-0.1.0.zip';
export function safeEvidence(ref){return !!ref&&/^knowledge\/results\/[A-Za-z0-9_./-]+$/.test(ref.path||'')&&!ref.path.split('/').some(p=>p==='..'||p==='.'||p.startsWith('.env')||/^(?:secrets?|credentials?|private[-_]?keys?)\./i.test(p))&&COMMIT.test(ref.source_commit||'')&&HASH.test(ref.sha256||'');}
function verified(ref,readPinned){if(!safeEvidence(ref))return false;try{return digest(readPinned(ref))===ref.sha256;}catch{return false;}}
function verifyAppendOnlyCorrection(trackId,checkId,refs,state,readPinned){
 if(trackId!=='core_product'||checkId!=='prototype_and_negative_cases'||!Array.isArray(refs)||refs.length!==2)return null;
 const originals=refs.filter(ref=>ref?.path===RELEASE_RECEIPT_PATH);
 const corrections=refs.filter(ref=>ref?.path===CORRECTION_PATH&&ref.kind==='append_only_source_ancestry_correction');
 if(originals.length!==1||corrections.length!==1)return null;
 const original=originals[0],correctionRef=corrections[0];
 if(!safeEvidence(original)||!safeEvidence(correctionRef)||correctionRef.corrects!==original.source_commit)return null;
 const stateRefs=Array.isArray(state.evidence_corrections)?state.evidence_corrections.filter(ref=>ref.path===correctionRef.path&&ref.source_commit===correctionRef.source_commit&&ref.sha256===correctionRef.sha256):[];
 if(stateRefs.length!==1||typeof stateRefs[0].applied_at_utc!=='string')return null;
 let correction;
 try{
  const bytes=readPinned(correctionRef);
  if(digest(bytes)!==correctionRef.sha256)return null;
  correction=JSON.parse(Buffer.from(bytes).toString('utf8'));
 }catch{return null;}
 if(correction.schema!=='ltzzz.goal.evidence-correction.v1'||correction.goal_id!==GOAL_ID||correction.kind!=='append_only_source_ancestry_correction'||correction.state_path!=='ops/goals/'+GOAL_ID+'.state.json'||correction.recorded_at_utc!==stateRefs[0].applied_at_utc)return null;
 if(correction.evidence_path!==original.path||correction.old_source_commit!==original.source_commit||correction.old_sha256!==original.sha256||correction.same_bytes_verified!==true||correction.observed_sha256!==original.sha256)return null;
 if(correction.ancestry?.exit_code!==1||correction.ancestry?.common_ancestor!==null||correction.ancestry?.finding!=='no_common_ancestor_history_rewritten')return null;
 if(!COMMIT.test(correction.current_main_source_commit||''))return null;
 try{
  const replacement=readPinned({path:original.path,source_commit:correction.current_main_source_commit});
  if(digest(replacement)!==original.sha256)return null;
 }catch{return null;}
 if(correction.package_path!==RELEASE_PACKAGE_PATH||!HASH.test(correction.expected_package_sha256||'')||correction.expected_package_sha256!==correction.observed_package_sha256||correction.package_same_bytes_verified!==true)return null;
 try{
  const pkg=readPinned({path:correction.package_path,source_commit:correctionRef.source_commit});
  if(digest(pkg)!==correction.expected_package_sha256)return null;
 }catch{return null;}
 return {method:'append_only_source_ancestry_correction',correction_refs:[{path:correctionRef.path,source_commit:correctionRef.source_commit,sha256:correctionRef.sha256,replacement_source_commit:correction.current_main_source_commit,package_path:correction.package_path,package_sha256:correction.expected_package_sha256}]};
}
export function evaluateGoal(goal,state,{readPinned,now=new Date().toISOString()}={}){
 if(goal?.schema!=='ltzzz.autonomy.goal.v1'||goal.goal_id!==GOAL_ID||state?.goal_id!==GOAL_ID)throw Error('goal_identity_required');
 if(!Array.isArray(goal.tracks)||!goal.tracks.length)throw Error('goal_tracks_required');
 const errors=[],tracks=[];
 for(const track of goal.tracks){
  const row=state.tracks?.[track.id]||{},required=track.acceptance_checks;
  if(!Array.isArray(required)||!required.length)throw Error('goal_acceptance_checks_required');
  const checks=required.map(id=>{
   const c=row.checks?.[id],refs=c?.evidence_refs;
   const hasCorrection=Array.isArray(refs)&&refs.some(ref=>ref?.kind==='append_only_source_ancestry_correction');
   const direct=!hasCorrection&&Array.isArray(refs)&&refs.length>0&&refs.every(ref=>verified(ref,readPinned));
   const correction=hasCorrection?verifyAppendOnlyCorrection(track.id,id,refs,state,readPinned):null;
   const passed=c?.verified===true&&Array.isArray(refs)&&refs.length>0&&(direct||!!correction);
   if(c?.verified===true&&!passed)errors.push('unverified_evidence:'+track.id+':'+id);
   return {id,verified:passed,evidence_refs:Array.isArray(refs)?refs.filter(safeEvidence):[],verification_method:passed?(correction?.method||'pinned_source_commit'):null,correction_refs:passed?(correction?.correction_refs||[]):[]};
  });
  tracks.push({id:track.id,status:checks.every(c=>c.verified)?'evidence_refs_verified':row.status||'pending',verified_checks:checks.filter(c=>c.verified).length,required_checks:checks.length,checks,blockers:row.blockers||[]});
 }
 const all=tracks.every(t=>t.verified_checks===t.required_checks),closeout=state.controller_closeout;
 let closed=false;
 if(all&&closeout?.seat==='gpt'&&verified(closeout.evidence_ref,readPinned)){
  try{
   const c=JSON.parse(readPinned(closeout.evidence_ref));
   const required=tracks.flatMap(t=>t.checks.map(c=>t.id+':'+c.id)).sort();
   closed=c.schema==='ltzzz.autonomy.goal-closeout.v1'&&c.goal_id===GOAL_ID&&c.controller==='gpt'&&c.decision==='all_acceptance_evidenced'&&Array.isArray(c.verified_checks)&&JSON.stringify([...new Set(c.verified_checks)].sort())===JSON.stringify(required);
  }catch{}
 }
 if(state.status==='completed'&&!closed)errors.push('completion_claim_not_supported');
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:goal.planning_window.timezone||'America/North_Dakota/Beulah',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));
 const localDate=[parts.year,parts.month,parts.day].join('-');
 const day=Math.floor((Date.parse(localDate+'T00:00:00Z')-Date.parse(goal.planning_window.start+'T00:00:00Z'))/86400000)+1;
 const planned=day<=2?'P0':day<=5?'P1':day<=8?'P2':day<=11?'P3':'P4';
 const status=errors.length?'blocked_evidence_integrity':closed?'completed':all?'awaiting_GPT_closeout':'active_acceptance_pending';
 const semantic={goal_id:GOAL_ID,status,active_phase:state.active_phase||'P0',tracks,errors,controller_closeout_verified:closed};
 return {schema:'ltzzz.autonomy.goal-observation.v1',...semantic,observed_at_utc:now,planned_phase:planned,target_review_date:goal.planning_window.target_review,auto_expire:false,goal_completed:closed,owner_routine_operations_required:false,evidence_scope:'Pinned repository bytes verified; the original source-ancestry correction is accepted only when the correction receipt, reachable replacement receipt bytes and release-package bytes all match their pinned SHA-256 values. External acceptance and bank/provider facts require their actual receipts and GPT closeout.',progress_fingerprint:digest(JSON.stringify(semantic)),model_calls:0,transactions:0,paid:false,tx_hash:null};
}
