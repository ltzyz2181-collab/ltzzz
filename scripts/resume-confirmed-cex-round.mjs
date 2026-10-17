import fs from 'node:fs';import {execFileSync} from 'node:child_process';
import {confirmedCexResume} from './lib/confirmed-cex-resume.mjs';import {runnerToken,wep3Request} from './lib/funded-invest-runtime.mjs';
const root='knowledge/results/funded-invest',run=process.env.GITHUB_RUN_ID,roundFile=root+'/OWNER-FUNDED-20261017-01.json',report={at:new Date().toISOString(),run_id:run,model_calls:0,new_funding_authorizations:0,status:'inspection_only'};
function persist(){execFileSync('git',['add','--',root],{stdio:'ignore'});try{execFileSync('git',['diff','--cached','--quiet']);return;}catch{}execFileSync('git',['-c','user.name=ltzzz-bot','-c','user.email=bot@ltzzz.com','commit','-m','Preserve original confirmed-capital recovery claims'],{stdio:'ignore'});execFileSync(process.execPath,['tools/push-receipt-commit.mjs'],{stdio:'ignore'});}
try{
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_EVENT_NAME!=='schedule')throw Error('existing_scheduled_inspection_required');
 const round=JSON.parse(fs.readFileSync(roundFile)),capital=await wep3Request('/market/okx/funding',{token:runnerToken()}),claims={};for(const s of round.cex){const p=root+'/'+round.order_id+'-cex-'+s.id+'.json';if(fs.existsSync(p))claims[s.id]=JSON.parse(fs.readFileSync(p));}
 report.gate=confirmedCexResume(round,capital.order,claims);
 if(report.gate.eligible){
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const env={...process.env,ARM_REAL_ORDERS:'1',ARM_ACK:day,RECONCILE_CONFIRMED_DEPOSIT_ONLY:'1',EXTERNAL_RECONCILE_ONLY:'1',FUNDED_CLAIMS_PERSISTED:'1'};
  execFileSync(process.execPath,['scripts/fund-okx-owner-round.mjs'],{env,stdio:'inherit'});
  const f=JSON.parse(fs.readFileSync(root+'/okx-funding-'+run+'.json'));report.capital_status=f.status;report.capital_error=f.error;
  if(f.status==='funded_and_ready_for_per_seat_cash_orders'){
   execFileSync(process.execPath,['scripts/funded-invest-executor.mjs','--phase','prepare','--venue','cex','--agent','all'],{env,stdio:'inherit'});persist();
   execFileSync(process.execPath,['scripts/funded-invest-executor.mjs','--phase','execute','--venue','cex','--agent','all'],{env,stdio:'inherit'});report.status='original_CEX_round_reconciled_see_per_order_states';
  }else report.status='existing_capital_still_blocked_or_pending';
 }else report.status=report.gate.reason;
}catch(error){report.status='blocked';report.error=/^[A-Za-z0-9_-]+$/.test(error.message)?error.message:'confirmed_capital_recovery_failed';}
fs.mkdirSync(root,{recursive:true});fs.writeFileSync(root+'/confirmed-cex-resume-'+run+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
