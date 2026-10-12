// Observable action incentives; no feelings, token farming or real-money fines.
export function actionProfile(tasks, {now=Date.now(), active=true}={}){
 if(!active)return {score:0,priority_multiplier:0,status:'inactive',wins:0,quality_failures:0,overdue:0,infrastructure_blocks:0};
 const recent=[...tasks].sort((a,b)=>String(a.posted_at).localeCompare(String(b.posted_at))).slice(-20);
 let wins=0,quality_failures=0,overdue=0,infrastructure_blocks=0;
 for(const t of recent){
  if(t.status==='settled'&&t.audit?.accepted&&t.deliverable?.sha256)wins++;
  else if(t.status==='slashed')quality_failures++;
  else if(t.status==='blocked')infrastructure_blocks++;
  else if(['awarded','delivered'].includes(t.status)&&t.deadline_at&&Number.isFinite(Date.parse(t.deadline_at))&&Date.parse(t.deadline_at)<now)overdue++;
 }
 const score=Math.max(-20,Math.min(20,wins*2-quality_failures*4-Math.min(6,overdue*2)));
 return {score,priority_multiplier:1+score/100,status:quality_failures>=3?'review_required':'eligible',wins,quality_failures,overdue,infrastructure_blocks};
}
