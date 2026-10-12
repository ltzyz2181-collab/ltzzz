// Observable action incentives; no feelings, token farming or real-money fines.
export function actionProfile(tasks, {now=Date.now(), active=true, verify=()=>false}={}){
 if(!active)return {score:0,priority_multiplier:0,status:'inactive',wins:0,quality_failures:0,overdue:0,infrastructure_blocks:0};
 const recent=[...tasks].sort((a,b)=>String(a.posted_at).localeCompare(String(b.posted_at))).slice(-20);
 let wins=0,quality_failures=0,overdue=0,infrastructure_blocks=0,unverified=0,duplicates=0;
 const ids=new Set(), deliveries=new Set();
 for(const t of recent){
  if(!t.id || ids.has(t.id)){duplicates++;continue;} ids.add(t.id);
  if(['settled','slashed'].includes(t.status)) {
    let valid=false;try{valid=verify(t)===true;}catch{}
    if(!valid){unverified++;continue;}
    if(t.status==='slashed')quality_failures++;
    else if(deliveries.has(t.deliverable.sha256))duplicates++;
    else {deliveries.add(t.deliverable.sha256);wins++;}
  }
  else if(t.status==='blocked')infrastructure_blocks++;
  else if(['awarded','delivered'].includes(t.status)&&t.acknowledged_at&&Number.isFinite(Date.parse(t.acknowledged_at))&&t.deadline_at&&Date.parse(t.deadline_at)>=Date.parse(t.acknowledged_at)&&Date.parse(t.deadline_at)<now)overdue++;
 }
 const score=Math.max(-20,Math.min(20,wins*2-quality_failures*4-Math.min(6,overdue*2)));
 return {score,priority_multiplier:1+score/100,status:quality_failures>=3?'review_required':'eligible',wins,quality_failures,overdue,infrastructure_blocks,unverified,duplicates};
}
