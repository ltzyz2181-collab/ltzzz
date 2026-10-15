import fs from 'node:fs';
const env=process.env;
const checks=Object.fromEntries(['diagnose','snapshot','reconcile'].map(name=>[name,env[`TREASURY_${name.toUpperCase()}_OUTCOME`]||'not_run']));
const report={at:new Date().toISOString(),execution_id:env.GITHUB_RUN_ID||'local',attempt:env.GITHUB_RUN_ATTEMPT||'1',source_commit:env.GITHUB_SHA||null,
  status:Object.values(checks).every(x=>x==='success')?'verified_readonly':'inspection_blocked',checks,
  read_only:true,financial_execution_retired:true,on_chain_executed:false,signed:false,broadcast:false,
  historical_pilot_source:'knowledge/results/migrations/treasury-pilot-verified-20261015.json',
  note:'Historical supply/exit confirmations are separate from this inspection; RPC failure is not evidence that a previous transaction failed.'};
fs.mkdirSync('knowledge/results/migrations',{recursive:true});
fs.writeFileSync(`knowledge/results/migrations/inspection-${report.execution_id}-${report.attempt}.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
