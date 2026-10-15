import fs from 'node:fs';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {pulseToken} from './pulse-credentials.mjs';import {pulseSnapshot,PULSE_URL} from './lib/pulse-client.mjs';import {actionProfile} from './agi-econ/action-policy.mjs';import {verifyActionEvidence} from './agi-econ/action-evidence.mjs';
const token=pulseToken(process.env.PULSE_ROLE||'qianwen');console.log('::add-mask::'+token);
const report={at:new Date().toISOString(),run_id:process.env.GITHUB_RUN_ID,run_attempt:process.env.GITHUB_RUN_ATTEMPT||'1',model_calls:0,financial_execution:false,intervention:null};
async function post(endpoint,body){const r=await fetch(PULSE_URL+endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});const data=await r.json();if(!r.ok)throw Error('pulse_http_'+r.status);return data;}
try{
 if(process.env.PULSE_ACTION==='control'){const body=JSON.parse(process.env.PULSE_CONTROL_JSON||'{}');body.id||='workflow-'+process.env.GITHUB_RUN_ID;body.reason||='owner-authorized delegated operation';report.command_result=await post('/control',body);report.intervention='authenticated_'+(process.env.PULSE_ROLE||'qianwen')+'_control';}
 let snapshot=await pulseSnapshot();
 if(!snapshot.available||snapshot.stale||!snapshot.alarm_at){report.intervention='automatic_stale_monitor_restart';await post('/run',{});snapshot=await pulseSnapshot();}
 if(!snapshot.available||snapshot.stale||!snapshot.ran_at)throw Error('pulse_not_fresh_after_recovery');
 const raw=fs.readFileSync('data/agi-econ/state.json','utf8'),data=JSON.parse(raw),tasks=Object.values(data.tasks||{}),profiles={};
 for(const name of ['doubao','deepseek','kimi','grok','qianwen']){
  const candidates=tasks.filter(t=>String(t.worker||'').toLowerCase().replace('did:ltzzz:','')===name);
  profiles[name]={...actionProfile(candidates,{verify:task=>verifyActionEvidence(process.cwd(),task)}),real_money_penalty:false};
 }
 const source_commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const incentives={at:new Date().toISOString(),source_commit,input_sha256:createHash('sha256').update(raw).digest('hex'),verification:'recomputed_from_hashed_independent_receipts',profiles,task_failures:{reference_only:true,window:10,failed:tasks.slice(-10).filter(t=>t.status==='slashed').length,samples:Math.min(tasks.length,10)}};
 report.incentive_sync=await post('/incentives',incentives);snapshot=await pulseSnapshot();report.status='monitor_fresh';report.snapshot=snapshot;report.incentives=incentives;
 fs.mkdirSync('knowledge/results/pulse',{recursive:true});fs.writeFileSync('knowledge/results/pulse/latest.json',JSON.stringify(snapshot,null,2)+'\n');
}catch{report.status='blocked_monitor_or_sync';process.exitCode=1;console.error('::error::Pulse independent watcher failed; inspect saved receipt.');}
fs.mkdirSync('knowledge/results/pulse',{recursive:true});const reportText=JSON.stringify(report,null,2)+'\n';fs.writeFileSync('knowledge/results/pulse/watch-'+process.env.GITHUB_RUN_ID+'-attempt-'+report.run_attempt+'.json',reportText);fs.writeFileSync('knowledge/results/pulse/watch-'+process.env.GITHUB_RUN_ID+'.json',reportText);console.log(JSON.stringify({status:report.status,intervention:report.intervention,model_calls:0}));
