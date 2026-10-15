import fs from 'node:fs';import crypto from 'node:crypto';
const base='https://ltzzz-wep3.ltzyz2181.workers.dev',action=process.env.AAVE_ACTION||'auto',amount=process.env.AAVE_AMOUNT||'1',id=process.env.AAVE_INTENT_ID||'AAVE-RUN-'+(process.env.GITHUB_RUN_ID||Date.now());
const auth=process.env.WEP3_RUNNER_TOKEN||(process.env.CLOUDFLARE_API_TOKEN?crypto.createHmac('sha256',process.env.CLOUDFLARE_API_TOKEN).update('ltzzz-runner-v2').digest('hex'):'');
const readOnly=['status','diagnose','reconcile','preview','auto-preview'].includes(action);
const report={at:new Date().toISOString(),execution_id:process.env.GITHUB_RUN_ID||'local',run_attempt:process.env.GITHUB_RUN_ATTEMPT||'1',action,read_only:readOnly,on_chain_executed:false,tx_hash:null};
try{
 if(!['status','diagnose','reconcile','preview','auto-preview','auto','supply','withdraw'].includes(action))throw Error('unsupported_action');
 const get=['status','diagnose','reconcile'].includes(action),headers={'Content-Type':'application/json','X-Lab-Pin':auth};
 const path=action==='reconcile'?'/market/aave/reconcile':action==='diagnose'?'/market/aave/diagnostics':action==='auto-preview'?'/market/aave/auto-preview':action==='status'?'/market/aave/status':action==='preview'?'/market/aave/preview':action==='auto'?'/market/aave/auto':'/market/aave/execute';
 const input=['auto','auto-preview'].includes(action)?{}:{intent_id:id,action:action==='preview'?(process.env.AAVE_PREVIEW_ACTION||'supply'):action,amount_usdc:amount};
 const expected=readOnly?process.env.AAVE_EXPECTED_REVISION:null,tries=readOnly?(expected?12:1):8;
 for(let attempt=0;attempt<tries;attempt++){
  const response=await fetch(base+path,{method:get?'GET':'POST',headers,body:get?undefined:JSON.stringify(input),signal:AbortSignal.timeout(60000)});report.http=response.status;report.content_type=response.headers.get('content-type');
  let result;try{result=await response.json();}catch{report.status='non_json_service_response';report.service_verified=false;process.exitCode=1;break;}report.result=result;
  if(expected&&result.aave_runtime_revision!==expected){report.service_verified=false;report.status='stale_worker_revision';if(attempt+1<tries){await new Promise(resolve=>setTimeout(resolve,3000));continue;}process.exitCode=1;break;}
  if(report.status==='stale_worker_revision')delete report.status;
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
const suffix=['diagnose','auto-preview','reconcile'].includes(action)?action+'-':'';
fs.mkdirSync('knowledge/results/wep3',{recursive:true});
const stem='knowledge/results/wep3/aave-'+suffix+(process.env.GITHUB_RUN_ID||'local'),serialized=JSON.stringify(report,null,2);
fs.writeFileSync(stem+'-attempt-'+report.run_attempt+'.json',serialized);
// Keep the original first-attempt path for readers; a rerun cannot overwrite it.
if(report.run_attempt==='1')fs.writeFileSync(stem+'.json',serialized);
console.log(JSON.stringify(report));
