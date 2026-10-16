import fs from 'node:fs';import {execFileSync} from 'node:child_process';
import {procurementPreflight} from './lib/external-procurement-preflight.mjs';
const report=await procurementPreflight();report.run_id=process.env.GITHUB_RUN_ID||null;report.source_commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
for(const [key,url] of [['market','https://ltzzz-wep3.ltzyz2181.workers.dev/market/catalog'],['treasury','https://ltzzz-wep3.ltzyz2181.workers.dev/market/aave/status']]){
 try{const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error();report[key]=await response.json();}catch{report[key]={status:'read_only_observation_unavailable'};}
}
fs.mkdirSync('knowledge/results/procurement',{recursive:true});const file='knowledge/results/procurement/preflight-'+(process.env.GITHUB_RUN_ID||'local')+'-attempt-'+(process.env.GITHUB_RUN_ATTEMPT||'1')+'.json';fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({file,status:report.status,purchase_status:report.purchase_status,model_calls:0,payments_submitted:0}));
// A blocked quote is preserved evidence, not a successful deployment acceptance.
if(report.status!=='quote_verified_not_purchased')process.exitCode=1;
