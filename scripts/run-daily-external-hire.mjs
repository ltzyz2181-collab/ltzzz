import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {hireDate,dailyHireId} from '../wep3-procurement-contract.js';
import {executeDailyHire,digest} from './lib/daily-external-hire.mjs';
import {prepareDailyHire,reconcileInternalHire,dailyHirePath,saveDailyHire} from './lib/daily-hire-files.mjs';
import {externalAIRelay} from './lib/external-ai-relay.mjs';
import {runnerToken,wep3Request} from './lib/funded-invest-runtime.mjs';
import {pulseSnapshot,pulseGate} from './lib/pulse-client.mjs';
const phase=process.argv[2],mode=process.env.HIRE_MODE||'internal';
if(!['prepare','execute'].includes(phase)||process.argv.length!==3)throw Error('fixed_prepare_or_execute_required');
const date=hireDate(),id=dailyHireId(date),file=dailyHirePath(date),save=saveDailyHire;
if(phase==='prepare'){
 const record=prepareDailyHire({date,mode,runId:process.env.GITHUB_RUN_ID||'local'});
 console.log(JSON.stringify({task_id:id,mode:record.mode,status:record.status,model_calls:0}));
}else{
 const record=JSON.parse(fs.readFileSync(file));
 if(record.mode!==mode)throw Error('daily_mode_already_assigned');
 // A committed dispatch must exist before either a payment or review generation.
 const persisted=JSON.parse(execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}));
 if(persisted.task_id!==id||persisted.context.input_sha256!==record.context.input_sha256)throw Error('persisted_dispatch_required');
 record.latest_run_id=process.env.GITHUB_RUN_ID||'local';record.latest_attempt_at=new Date().toISOString();
 if(record.mode==='internal'){const result=reconcileInternalHire(date);console.log(JSON.stringify({task_id:id,mode:'internal',status:result.status,paid:false,tx_hash:null,new_model_calls:0}));if(result.status.startsWith('blocked_'))process.exitCode=1;}
 else {
 if(record.inputs.some(input=>digest(fs.readFileSync(input.path))!==input.sha256)){record.status='blocked_dispatch_inputs_changed_no_payment';save(record);process.exitCode=1;}
 else {
 const token=runnerToken();if(!token){record.status='blocked_runner_auth';save(record);process.exitCode=1;}
 else{
  const snapshot=await pulseSnapshot(),gate=pulseGate(snapshot,'doubao');
  const {callAgent}=await import('./call-doubao.mjs');
  const key=process.env.DOUBAO_API_KEY||process.env.ARK_API_KEY;
  const api=(path,body)=>wep3Request(path,{token,...(body?{body}:{})});
  await executeDailyHire(record,{
   relay:(date,context)=>externalAIRelay(token,{date,context}),api,
   reviewerConfigured:!!key,pulseReady:snapshot.available&&gate.allowed&&gate.state==='fresh',save,
   callReviewer:prompt=>callAgent({apiKey:key,prompt,maxTokens:1800,thinking:'disabled'})
  });
  console.log(JSON.stringify({task_id:id,status:record.status,paid:record.paid,tx_hash:record.tx_hash,new_payments_this_run:record.new_payments_this_run}));
  if(record.status.startsWith('blocked_'))process.exitCode=1;
 }
 }
 }
}
