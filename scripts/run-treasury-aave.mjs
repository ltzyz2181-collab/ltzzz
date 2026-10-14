import fs from 'node:fs';import crypto from 'node:crypto';
const base='https://ltzzz-wep3.ltzyz2181.workers.dev',action=process.env.AAVE_ACTION||'auto',amount=process.env.AAVE_AMOUNT||'1',id=process.env.AAVE_INTENT_ID||'AAVE-RUN-'+(process.env.GITHUB_RUN_ID||Date.now());
const auth=process.env.WEP3_RUNNER_TOKEN||(process.env.CLOUDFLARE_API_TOKEN?crypto.createHmac('sha256',process.env.CLOUDFLARE_API_TOKEN).update('ltzzz-runner-v2').digest('hex'):'');
const readOnly=['status','diagnose','preview','auto-preview'].includes(action);
const report={at:new Date().toISOString(),execution_id:process.env.GITHUB_RUN_ID||'local',action,read_only:readOnly,on_chain_executed:false,tx_hash:null};
try{
 if(!['status','diagnose','preview','auto-preview','auto','supply','withdraw'].includes(action))throw Error('unsupported_action');
 const get=['status','diagnose'].includes(action),headers={'Content-Type':'application/json','X-Lab-Pin':auth};
 const path=action==='diagnose'?'/market/aave/diagnostics':action==='auto-preview'?'/market/aave/auto-preview':action==='status'?'/market/aave/status':action==='preview'?'/market/aave/preview':action==='auto'?'/market/aave/auto':'/market/aave/execute';
 const input=['auto','auto-preview'].includes(action)?{}:{intent_id:id,action:action==='preview'?(process.env.AAVE_PREVIEW_ACTION||'supply'):action,amount_usdc:amount};
 for(let attempt=0;attempt<(readOnly?1:8);attempt++){
  const response=await fetch(base+path,{method:get?'GET':'POST',headers,body:get?undefined:JSON.stringify(input),signal:AbortSignal.timeout(60000)}),result=await response.json();report.http=response.status;report.result=result;
  const guardedPreview=action==='auto-preview'&&response.status===422&&result.status==='blocked_reconciliation'&&result.signed===false;
  report.service_verified=!!((response.ok&&result.ok===true)||guardedPreview);
  if(action==='diagnose')report.execution_blocked=result.storage?.ok===false;
  if(guardedPreview)report.execution_blocked=true;
  if(!report.service_verified){report.status='service_or_execution_failed';process.exitCode=1;break;}
  if(!readOnly&&result.status==='confirmed'){report.on_chain_executed=true;report.tx_hash=result.steps?.findLast(s=>s.kind==='supply'||s.kind==='withdraw')?.tx_hash||null;break;}
  if(readOnly||!['pending','pending_confirmations'].includes(result.status))break;
  await new Promise(resolve=>setTimeout(resolve,3000));
 }
 if(!readOnly&&['pending','pending_confirmations'].includes(report.result?.status)){report.status='pending_requires_reconciliation';process.exitCode=1;}
}catch{report.status='rpc_or_service_unavailable';report.service_verified=false;process.exitCode=1;}
const suffix=['diagnose','auto-preview'].includes(action)?action+'-':'';
fs.mkdirSync('knowledge/results/wep3',{recursive:true});fs.writeFileSync('knowledge/results/wep3/aave-'+suffix+(process.env.GITHUB_RUN_ID||'local')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
