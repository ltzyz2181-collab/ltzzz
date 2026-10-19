import fs from 'node:fs';
import {catalogProviders,inspectCatalog,inspectBalance} from './lib/model-catalog.mjs';
const folder='knowledge/results/providers';
const month=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date());
let previous;try{previous=JSON.parse(fs.readFileSync(folder+'/catalogue-latest.json'));}catch{previous=null;}
const report={at:new Date().toISOString(),month_cst:month,run_id:process.env.GITHUB_RUN_ID||'local',model_calls:0,transactions_sent:0,automatic_model_change:false,review_roles:{primary:'qianwen',independent_review:'claude_when_available'},disabled_native_seats:['openai','microsoft','anthropic'],seats:[]};
for(const provider of catalogProviders())report.seats.push({...await inspectCatalog(provider,{previous:previous?.seats?.find(row=>row.seat===provider.seat)}),...await inspectBalance(provider)});
fs.mkdirSync(folder,{recursive:true});
for(const file of [`readiness-${report.run_id}.json`,'catalogue-latest.json',`monthly-${month}.json`])fs.writeFileSync(folder+'/'+file,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
