import fs from 'node:fs';
import {SCHEDULER} from './lib/video-queue-client.mjs';
const token=process.env.LTZZZ_AGENT_TOKEN;
const report={at:new Date().toISOString(),source_commit:process.env.GITHUB_SHA||null,run_id:process.env.GITHUB_RUN_ID||null,
 network_context:process.env.GITHUB_ACTIONS?'github_hosted_runner_no_vpn_step':'not_independently_verified',owner_no_vpn_verified:false,
 model_calls:0,uploads:0,r2_object_writes:0,published:false,checks:[],status:'running'};
const file=`results/publishing/workbuddy-queue-diagnostic-${process.env.GITHUB_RUN_ID||'local'}-attempt-${process.env.GITHUB_RUN_ATTEMPT||'1'}.json`;
const request=async(path,{anonymous=false,body}={})=>{
 const r=await fetch(SCHEDULER+path,{method:body?'POST':'GET',headers:anonymous?{}:{Authorization:'Bearer '+token},body,redirect:'error',signal:AbortSignal.timeout(20000)});
 const data=await r.json();return {http:r.status,data};
};
try{
 if(!token)throw Error('LTZZZ_AGENT_TOKEN_missing');
 // The Worker deploy is triggered by the same merge. Wait only for that rollout.
 let health;const deadline=Date.now()+180000;
 for(let i=0;i<36&&Date.now()<deadline;i++){
  try{health=await request('/health',{anonymous:true});if(health.http===200&&health.data.queue_readback)break;}catch{}
  if(i<35)await new Promise(r=>setTimeout(r,5000));
 }
 report.health=health||null;
 if(health?.http!==200||!health.data.ok||health.data.service!=='ltzzz-video-scheduler'||!health.data.queue_readback)throw Error('queue_readback_deployment_not_ready');
 const name='2026-10-17-no-self-review';
 const denied=await request('/queue/item?name='+name,{anonymous:true});report.checks.push({name:'anonymous_read_denied',http:denied.http,ok:denied.http===401});
 const read=await request('/queue/item?name='+name);report.checks.push({name:'authenticated_R2_read',http:read.http,ok:read.http===200&&read.data.ok});report.workbuddy_item=read.data;
 const prior=await request('/queue/status?sha256=9582fd67463128ad4db6d88f94fc3652e81efb8da44efd1d44ab3135801adb83');
 report.checks.push({name:'prior_Oct16_receipt_read',http:prior.http,ok:prior.http===200&&prior.data.ok});report.prior_Oct16_publication=prior.data.receipt;
 // Invalid metadata must be rejected before any R2 write or upstream upload.
 const form=new FormData();form.set('meta','not-json');
 const invalid=await request('/queue/upload/workbuddy-auth-diagnostic',{body:form});
 report.checks.push({name:'authenticated_upload_validation_no_writes',http:invalid.http,ok:invalid.http===400&&invalid.data.error==='invalid_metadata'});
 const status=await request('/status');report.latest_cron_report=status.data.latest||null;
 report.status=report.checks.every(c=>c.ok)?'authenticated_ingress_and_R2_read_verified':'checks_failed';
 if(report.status==='checks_failed')process.exitCode=1;
}catch(error){report.status='blocked';report.error=/^[a-zA-Z0-9_]+$/.test(error.message)?error.message:'transport_or_protocol_failure';process.exitCode=1;}
fs.mkdirSync('results/publishing',{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
