import fs from 'node:fs';
import crypto from 'node:crypto';
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
  out.push({did,status:agent.status,reputation:agent.reputation,verified_wins:wins,verified_quality_failures:fails,infrastructure_blocks:blocked,issues,review_required:issues.length>0||fails>=3,credit_limit_recommendation:issues.length>0||fails>=3?'review_before_new_budget':'existing_policy',automatic_penalty_applied:false});
 }
 return {at:new Date().toISOString(),run_id:process.env.GITHUB_RUN_ID||'local',window:'last 20 worker tasks per DID',model_calls:0,real_funds_moved:false,seats:out};
}
if(process.argv[1]?.endsWith('/patrol.mjs')){
 const r=patrol();fs.mkdirSync('results/agi-econ',{recursive:true});
 fs.writeFileSync('results/agi-econ/patrol-'+r.run_id+'.json',JSON.stringify(r,null,2)+'\n');
 console.log(JSON.stringify({seats:r.seats.length,review_required:r.seats.filter(x=>x.review_required).map(x=>x.did),model_calls:0}));
}
