import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {pulseToken} from './pulse-credentials.mjs';import {PULSE_URL} from './lib/pulse-client.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ltzzz-pulse-')),secret=path.join(dir,'secrets.json');
const tokens={PULSE_TOKEN:pulseToken('gpt'),PULSE_QIANWEN_TOKEN:pulseToken('qianwen')};for(const token of Object.values(tokens))console.log('::add-mask::'+token);
async function read(r){const text=await r.text();try{return JSON.parse(text);}catch{return {error:'non_json_response',response_sample:text.slice(0,180)}}}
const receipt={at:new Date().toISOString(),run_id:process.env.GITHUB_RUN_ID,source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),status:'deploy_started',model_calls:0,financial_execution:false};
try{
 fs.writeFileSync(secret,JSON.stringify(tokens),{mode:0o600});
 receipt.wrangler_version=execFileSync('npx',['--yes','wrangler@4','--version'],{encoding:'utf8'}).trim();
 execFileSync('npx',['--yes','wrangler@4','deploy','-c','workers/pulse-worker/wrangler.toml'],{stdio:'inherit'});
 execFileSync('npx',['--yes','wrangler@4','secret','bulk',secret,'-c','workers/pulse-worker/wrangler.toml'],{stdio:'inherit'});
 for(let i=0;i<12;i++){try{receipt.health=await fetch(PULSE_URL+'/health',{signal:AbortSignal.timeout(10000)}).then(r=>r.json());if(receipt.health.auth_configured&&receipt.health.qianwen_control_configured)break;}catch{}await new Promise(r=>setTimeout(r,2000));}
 receipt.route_attempts=[];
 let ready=false;
 for(let i=0;i<12;i++){
  const blocked=await fetch(PULSE_URL+'/run',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});receipt.anonymous_run_http=blocked.status;
  const getRun=await fetch(PULSE_URL+'/run');receipt.get_run_http=getRun.status;
  const probe=await fetch(PULSE_URL+'/control',{method:'POST',headers:{Authorization:'Bearer '+tokens.PULSE_QIANWEN_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({id:'qianwen-probe-'+process.env.GITHUB_RUN_ID,action:'probe',reason:'Deployment acceptance of deputy operational authority; not a Qianwen model generation'})});receipt.qianwen_control_http=probe.status;receipt.qianwen_control=await read(probe);
  receipt.route_attempts.push({anonymous:blocked.status,get:getRun.status,probe:probe.status,version:getRun.headers.get('x-pulse-version'),probe_response:receipt.qianwen_control});
  if(blocked.status===401&&getRun.status===405&&probe.status===200){ready=true;break;}
  await new Promise(r=>setTimeout(r,3000));
 }
 if(!ready)throw Error('control_routes_not_ready');
 const run=await fetch(PULSE_URL+'/run',{method:'POST',headers:{Authorization:'Bearer '+tokens.PULSE_TOKEN,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(45000)});receipt.run_http=run.status;receipt.status_snapshot=await read(run);
 const status=await fetch(PULSE_URL+'/status',{signal:AbortSignal.timeout(10000)});receipt.public_status_http=status.status;receipt.public_status=await read(status);
 if(!run.ok||!receipt.public_status.ran_at||receipt.public_status.stale||!receipt.public_status.alarm_at||probe.status!==200||blocked.status!==401||getRun.status!==405)throw Error('acceptance_failed');
 receipt.status='deployed_and_live_observations_recorded';receipt.generation_verified=false;receipt.health_failures=Object.entries(receipt.public_status.agents||{}).filter(([,a])=>!a.ok).map(([name])=>name);
}catch{receipt.status='blocked_deployment_or_acceptance';process.exitCode=1;}finally{fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync('knowledge/results/pulse',{recursive:true});fs.writeFileSync('knowledge/results/pulse/deploy-'+process.env.GITHUB_RUN_ID+'.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,run_id:receipt.run_id,model_calls:0}));}
