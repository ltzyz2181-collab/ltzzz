import fs from 'node:fs';
const r={at:new Date().toISOString(),on_chain:false,tx_hash:null};
try{const response=await fetch('https://ltzzz-wep3.ltzyz2181.workers.dev/market/receipts/anchor',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Pin':process.env.WEP3_RUNNER_TOKEN||''},body:'{}',signal:AbortSignal.timeout(45000)});Object.assign(r,await response.json());if(!response.ok)r.status='anchor_request_blocked';}catch{r.status='anchor_service_unavailable';}
fs.mkdirSync('knowledge/results/wep3',{recursive:true});fs.writeFileSync('knowledge/results/wep3/snapshot-'+process.env.GITHUB_RUN_ID+'.json',JSON.stringify(r,null,2));console.log(JSON.stringify(r));
