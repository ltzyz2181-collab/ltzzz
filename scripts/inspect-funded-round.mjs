import fs from 'node:fs';import {runnerToken,wep3Request,intentId,SEATS} from './lib/funded-invest-runtime.mjs';import {okxClient,okxCredentials} from './lib/okx-funded-spot.mjs';
const policy=JSON.parse(fs.readFileSync('policy/funded-owner-round-20261017.json')),token=runnerToken(),report={at:new Date().toISOString(),run_id:process.env.GITHUB_RUN_ID,model_calls:0,payments_submitted:0,transactions_submitted:0,owner_no_vpn_verified:false,inspections:[]};
for(const [label,path] of [['external_order','/market/procurement/order'],['aave_status','/market/aave/status'],...Object.keys(SEATS).map(id=>['intent_'+id,'/market/aave/intent?id='+intentId(policy.order_id,id)])]){
 try{report.inspections.push({label,result:await wep3Request(path,{token})});}catch(error){report.inspections.push({label,error:error.message});}
}
const okx=okxClient(okxCredentials());
for(const [label,path] of [['trading_balances','/api/v5/account/balance?ccy=USDT,USDC'],['funding_balances','/api/v5/asset/balances?ccy=USDT,USDC']]){
 try{const r=await okx('GET',path);report[label]={http:r.http,code:r.code,ok:r.ok,balances:r.ok?(label==='trading_balances'?(r.data[0]?.details||[]).map(a=>({currency:a.ccy,available:a.availBal,equity:a.eq})):r.data.map(a=>({currency:a.ccy,available:a.availBal,balance:a.bal}))):[]};}catch(error){report[label]={ok:false,error:error.message};}
}
fs.mkdirSync('knowledge/results/funded-invest',{recursive:true});const file='knowledge/results/funded-invest/inspection-'+(process.env.GITHUB_RUN_ID||'local')+'-attempt-'+(process.env.GITHUB_RUN_ATTEMPT||'1')+'.json';fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
