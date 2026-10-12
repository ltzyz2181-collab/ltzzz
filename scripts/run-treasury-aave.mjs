import fs from 'node:fs';import crypto from 'node:crypto';
const base='https://ltzzz-wep3.ltzyz2181.workers.dev',action=process.env.AAVE_ACTION||'auto',amount=process.env.AAVE_AMOUNT||'1',id=process.env.AAVE_INTENT_ID||'AAVE-RUN-'+(process.env.GITHUB_RUN_ID||Date.now());
const auth=process.env.WEP3_RUNNER_TOKEN||(process.env.CLOUDFLARE_API_TOKEN?crypto.createHmac('sha256',process.env.CLOUDFLARE_API_TOKEN).update('ltzzz-runner-v2').digest('hex'):'');
const report={at:new Date().toISOString(),execution_id:process.env.GITHUB_RUN_ID||'local',on_chain_executed:false,tx_hash:null};
try{
 const headers={'Content-Type':'application/json','X-Lab-Pin':auth};const path=action==='status'?'/market/aave/status':action==='preview'?'/market/aave/preview':action==='auto'?'/market/aave/auto':'/market/aave/execute';
 let input=action==='auto'?{}:{intent_id:id,action:action==='preview'?(process.env.AAVE_PREVIEW_ACTION||'supply'):action,amount_usdc:amount};
 for(let attempt=0;attempt<8;attempt++){
  const response=await fetch(base+path,{method:action==='status'?'GET':'POST',headers,body:action==='status'?undefined:JSON.stringify(input),signal:AbortSignal.timeout(60000)}),result=await response.json();report.http=response.status;report.result=result;
  if(result.status==='confirmed'){report.on_chain_executed=true;report.tx_hash=result.steps?.findLast(s=>s.kind==='supply'||s.kind==='withdraw')?.tx_hash||null;break;}
  if(!['pending','pending_confirmations'].includes(result.status))break;
  if(action==='auto'){input={intent_id:result.intent_id,action:result.action,amount_usdc:result.amount_usdc};}
  await new Promise(resolve=>setTimeout(resolve,3000));
 }
}catch{report.status='rpc_or_service_unavailable';}
fs.mkdirSync('knowledge/results/wep3',{recursive:true});fs.writeFileSync('knowledge/results/wep3/aave-'+(process.env.GITHUB_RUN_ID||'local')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
