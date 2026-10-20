import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,run=process.env.GITHUB_RUN_ID||'local';
if(!account||!token)throw Error('existing_deployment_credentials_required');
const api=async route=>{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+route,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});const d=await r.json();if(!r.ok||!d.success)throw Error('cloudflare_read_failed_'+r.status);return d.result;};
const scripts=await api('/workers/scripts'),ids=new Set(scripts.map(s=>s.id));let domains=[];try{domains=await api('/workers/domains');}catch{/* fixed known names only; never creates a guessed worker */}
const targets=[['qianwen','ltzzz-qianwen-proxy','qianwen-proxy-worker.js','api-qianwen.ltzzz.com'],['deepseek','ltzzz-deepseek-proxy','deepseek-proxy-worker-v2.js','api-deep.ltzzz.com'],['kimi','ltzzz-kimi-proxy','kimi-proxy-worker.js','api-kimi.ltzzz.com'],['doubao','ltzzz-doubao-proxy','doubao-proxy-worker.js','api-doubao.ltzzz.com'],['grok','ltzzz-xai-proxy','xai-proxy-worker.js','api-xai.ltzzz.com'],['gpt','ltzzz-gpt-proxy','ltzzz-gpt-proxy-worker.js',null]];
const filter=process.env.DEPLOY_SEATS?.split(','),report={at:new Date().toISOString(),run_id:run,source_commit:process.env.GITHUB_SHA,model_calls:0,transactions:0,model_secret_values_changed:false,service_auth_uses_existing_secret:true,paid_schedules_added:false,workers:[]};
fs.mkdirSync('work/provenance-deploy',{recursive:true});
for(const [seat,fallback,main,host] of targets){
 if(filter&&!filter.includes(seat))continue;
 const service=domains.find(d=>d.hostname===host)?.service||fallback,row={seat,service,public_host:host,source:main};report.workers.push(row);
 if(!/^[a-z0-9-]+$/.test(service)||!ids.has(service)){row.status='blocked_existing_service_not_verified';continue;}
 const cfg=path.resolve('work/provenance-deploy/'+seat+'.toml');
 fs.writeFileSync(cfg,`name = "${service}"\nmain = "${path.resolve(main)}"\ncompatibility_date = "2026-10-01"\n`);
 if(seat==='kimi'&&!process.env.LTZZZ_AGENT_TOKEN){row.status='blocked_existing_service_auth_secret_missing';continue;}
 try{if(seat==='kimi')execFileSync('npx',['--yes','wrangler@4','secret','put','LTZZZ_AGENT_TOKEN','-c',cfg],{input:process.env.LTZZZ_AGENT_TOKEN,stdio:['pipe','inherit','inherit']});execFileSync('npx',['--yes','wrangler@4','deploy','--keep-vars','-c',cfg],{stdio:'inherit'});row.status='deployed_pending_http_readback';}
 catch{row.status='deployment_failed';continue;}
 const urls=[...(host?['https://'+host+'/health']:[]),'https://'+service+'.ltzyz2181.workers.dev/health'];row.observations=[];
 for(let attempt=0;attempt<12;attempt++){
  for(const url of urls){try{const r=await fetch(url,{signal:AbortSignal.timeout(12000)}),d=await r.json();const good=r.ok&&d.identity_receipt_revision==='ltzzz.provider-execution.v1';row.observations.push({url,http:r.status,revision:d.identity_receipt_revision||null,configured_model:d.configured_model||null,generation_verified:false,at:new Date().toISOString()});if(good){row.status='deployed_health_revision_verified';row.verified_url=url;break;}}catch{/* explicitly unverified, no claimed success */}}
  if(row.verified_url)break;await new Promise(r=>setTimeout(r,2000));
 }
}
report.status=report.workers.every(w=>w.status==='deployed_health_revision_verified')?'deployment_health_verified':'deployment_with_blockers';
fs.mkdirSync('knowledge/results/identity',{recursive:true});fs.writeFileSync('knowledge/results/identity/provider-execution-'+run+'.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));if(report.status!=='deployment_health_verified')process.exitCode=1;
