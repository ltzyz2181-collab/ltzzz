export const REPOSITORY='ltzyz2181-collab/ltzzz';
export async function sentinelCoverage({fetcher=fetch,token,now=Date.now(),days=5,maxPages=3,maxJobs=24}={}){
 const report={schema:'ltzzz.sentinel-coverage.v1',at:new Date(now).toISOString(),window_start:new Date(now-days*86400000).toISOString(),window_days:days,scope:'Observed GitHub Actions runs and sampled job steps; not file-count divided by theoretical cron slots',actions_read_permission_verified:false,model_calls:0,runs:[],sampled_jobs:[],nominal_hourly_slots:days*24,nominal_slots_are_not_guaranteed_runs:true};
 const get=async endpoint=>{if(!token)throw Error('actions_read_token_missing');const r=await fetcher('https://api.github.com/repos/'+REPOSITORY+endpoint,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000),redirect:'error'});if(!r.ok)throw Error('github_actions_read_http_'+r.status);return r.json();};
 try{
  let done=false;
  for(let p=1;p<=maxPages&&!done;p++){
   const d=await get('/actions/workflows/dispatch-sentinel.yml/runs?per_page=100&page='+p);report.actions_read_permission_verified=true;
   const runs=d.workflow_runs||[];
   for(const r of runs){if(Date.parse(r.created_at)<now-days*86400000){done=true;break;}report.runs.push({id:r.id,run_attempt:r.run_attempt||1,event:r.event,status:r.status,conclusion:r.conclusion,created_at:r.created_at,head_sha:r.head_sha});}
   if(runs.length<100)done=true;
  }
  report.pagination_complete=done;
  const completed=report.runs.filter(r=>r.status==='completed'&&r.event!=='pull_request');
  for(const r of completed.slice(0,maxJobs)){
   try{const d=await get('/actions/runs/'+r.id+'/jobs?per_page=100'),steps=(d.jobs||[]).flatMap(j=>j.steps||[]),scan=steps.find(s=>s.name==='运行派单哨兵'),persist=steps.find(s=>s.name==='落盘'),alarm=steps.find(s=>s.name==='报警（有超时/阻塞/未配置时）');
    report.sampled_jobs.push({run_id:r.id,scan:scan?.conclusion||'not_observed',persistence: persist?.conclusion||'not_observed',alarm:alarm?.conclusion||'not_observed',classification:scan?.conclusion==='success'&&persist?.conclusion==='success'?(alarm?.conclusion==='failure'?'scan_and_persistence_succeeded_business_alert':'scan_and_persistence_succeeded'):'scan_or_persistence_not_verified'});
   }catch{report.sampled_jobs.push({run_id:r.id,classification:'job_steps_unverified'});}
  }
  report.observed_runs=report.runs.length;report.observed_scheduled_runs=report.runs.filter(r=>r.event==='schedule').length;
  report.completed_runs=completed.length;report.sample_size=report.sampled_jobs.length;
  report.sampled_persistence_successes=report.sampled_jobs.filter(j=>j.persistence==='success').length;
  report.sampled_business_alerts=report.sampled_jobs.filter(j=>j.classification==='scan_and_persistence_succeeded_business_alert').length;
  report.status=report.pagination_complete?'observed_window_recorded':'bounded_partial_window_recorded';
 }catch(e){report.status='actions_coverage_unverified';report.error=e.message;}
 return report;
}
