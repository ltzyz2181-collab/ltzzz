import {selectKimiModel} from '../lib/kimi-profile.js';
import {routedModel} from './model-routing.mjs';
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,run=process.env.GITHUB_RUN_ID||'local';
if(!account||!token||!process.env.LTZZZ_AGENT_TOKEN)throw Error('existing_deployment_credentials_and_service_token_required');
const wrangler=(args,input)=>execFileSync('npx',['--yes','wrangler@4',...args],{...(input===undefined?{}:{input}),stdio:input===undefined?'inherit':['pipe','inherit','inherit']});
async function healthAt(url,predicate){for(let i=0;i<18;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(10000)}),d=await r.json();if(r.ok&&predicate(d))return d;}catch{}if(i<17)await new Promise(r=>setTimeout(r,2000));}throw Error('deployment_readback_not_verified');}
const api=async route=>{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+route,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});const d=await r.json();if(!r.ok||!d.success)throw Error('cloudflare_read_failed_'+r.status);return d.result;};
const scripts=await api('/workers/scripts'),ids=new Set(scripts.map(s=>s.id));let domains=[];try{domains=await api('/workers/domains');}catch{/* fixed known names only; never creates a guessed worker */}
const targets=[['qianwen','ltzzz-qianwen-proxy','qianwen-proxy-worker.js','api-qianwen.ltzzz.com'],['deepseek','ltzzz-deepseek-proxy','deepseek-proxy-worker-v2.js','api-deep.ltzzz.com'],['kimi','ltzzz-kimi-proxy','kimi-proxy-worker.js','api-kimi.ltzzz.com'],['doubao','ltzzz-doubao-proxy','doubao-proxy-worker.js','api-doubao.ltzzz.com'],['grok','ltzzz-xai-proxy','xai-proxy-worker.js','api-xai.ltzzz.com'],['gpt','ltzzz-gpt-proxy','ltzzz-gpt-proxy-worker.js',null]];
const filter=process.env.DEPLOY_SEATS?.split(','),report={at:new Date().toISOString(),run_id:run,source_commit:process.env.GITHUB_SHA,model_calls:0,transactions:0,other_model_keys_retained:true,kimi_model_key_bound_from_verified_domestic_secret:false,service_auth_uses_existing_secret:true,paid_schedules_added:false,workers:[]};
fs.mkdirSync('work/provenance-deploy',{recursive:true});
try {
// Migrate the existing Worker caller BEFORE enabling any generation gate.
if(!ids.has('ltzzz-daily-automation'))throw Error('canonical_daily_caller_not_registered');
wrangler(['secret','put','LTZZZ_AGENT_TOKEN','-c','wrangler.daily.toml'],process.env.LTZZZ_AGENT_TOKEN);
wrangler(['deploy','--keep-vars','-c','wrangler.daily.toml']);
await healthAt('https://ltzzz-daily-automation.ltzyz2181.workers.dev/health',d=>d.proxy_caller_auth_revision==='proxy-auth-v1');
report.internal_worker_caller_migrated_before_gate=true;
report.auth_gate_revision='proxy-auth-v1';

for(const [seat,fallback,main,host] of targets){
 if(filter&&!filter.includes(seat))continue;
 const service=domains.find(d=>d.hostname===host)?.service||fallback,row={seat,service,public_host:host,source:main};report.workers.push(row);
 if(!/^[a-z0-9-]+$/.test(service)||!ids.has(service)){row.status='blocked_existing_service_not_verified';continue;}
 const cfg=path.resolve('work/provenance-deploy/'+seat+'.toml');
 fs.writeFileSync(cfg,`name = "${service}"\nmain = "${path.resolve(main)}"\ncompatibility_date = "2026-10-01"\n[vars]\nREQUIRE_TOKEN = "true"\n\n`);
 if(seat==='kimi'&&!process.env.LTZZZ_AGENT_TOKEN){row.status='blocked_existing_service_auth_secret_missing';continue;}
 try{wrangler(['secret','put','LTZZZ_AGENT_TOKEN','-c',cfg],process.env.LTZZZ_AGENT_TOKEN);row.service_token_injected=true;
 if(seat==='doubao'){
  row.expected_configured_model=routedModel('doubao','doubao-seed-2-1-pro-260915');
  if(!/^doubao-seed-[A-Za-z0-9-]*pro[A-Za-z0-9-]*$/.test(row.expected_configured_model))throw Error('verified_pro_model_required');
  wrangler(['secret','put','DOUBAO_MODEL','-c',cfg],row.expected_configured_model);row.model_configuration_applied=true;
 }
 if(seat==='kimi'){
   const key=process.env.MOONSHOT_API_KEY_CN;if(!key){row.status='blocked_domestic_key_secret_missing';continue;}
   const c=await fetch('https://api.moonshot.cn/v1/models',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)});row.domestic_key_catalogue_http=c.status;
   if(!c.ok){row.status='blocked_domestic_key_verification';continue;}
   const d=await c.json();row.highest_supported_model=selectKimiModel((d.data||[]).map(x=>x.id));
   execFileSync('npx',['--yes','wrangler@4','secret','put','KIMI_API_KEY','-c',cfg],{input:key,stdio:['pipe','inherit','inherit']});row.kimi_key_binding_applied=true;report.kimi_model_key_bound_from_verified_domestic_secret=true;
   execFileSync('npx',['--yes','wrangler@4','secret','put','LTZZZ_AGENT_TOKEN','-c',cfg],{input:process.env.LTZZZ_AGENT_TOKEN,stdio:['pipe','inherit','inherit']});
  }execFileSync('npx',['--yes','wrangler@4','deploy','--keep-vars','-c',cfg],{stdio:'inherit'});row.status='deployed_pending_http_readback';}
 catch{row.status='deployment_failed';continue;}
 const urls=[...(host?['https://'+host+'/health']:[]),'https://'+service+'.ltzyz2181.workers.dev/health'];row.observations=[];
 for(let attempt=0;attempt<12;attempt++){
  for(const url of urls){try{const r=await fetch(url,{signal:AbortSignal.timeout(12000)}),d=await r.json();const good=r.ok&&d.identity_receipt_revision==='ltzzz.provider-execution.v1'&&d.proxy_auth_revision==='proxy-auth-v1'&&d.auth_required===true&&d.auth_configured===true&&(seat!=='doubao'||d.daily_recovery_revision==='doubao-proxy-daily-v2'&&d.configured_model===row.expected_configured_model)&&(seat!=='kimi'||d.selected_api_region==='cn'&&d.configured_upstream==='https://api.moonshot.cn/v1/chat/completions'&&d.auth_configured===true);row.observations.push({url,http:r.status,revision:d.identity_receipt_revision||null,daily_recovery_revision:d.daily_recovery_revision||null,configured_model:d.configured_model||null,generation_verified:false,at:new Date().toISOString()});if(good){row.status='deployed_health_revision_verified';row.verified_url=url;break;}}catch{/* explicitly unverified, no claimed success */}}
  if(row.verified_url)break;await new Promise(r=>setTimeout(r,2000));
 }
 if(row.verified_url){
  row.auth_checks=[];const origin=new URL(row.verified_url).origin;
  try{for(const [kind,credential] of [['anonymous',null],['wrong','deliberately-invalid-proxy-token'],['valid',process.env.LTZZZ_AGENT_TOKEN]]){
   const headers=credential?{Authorization:'Bearer '+credential}:{};
   let observation;for(let i=0;i<6;i++){try{const r=await fetch(origin+'/auth/check',{headers,signal:AbortSignal.timeout(12000)}),d=await r.json();observation={kind,http:r.status,authenticated:d.authenticated===true,model_calls:d.model_calls??null};if(r.status===(kind==='valid'?200:401))break;}catch{observation={kind,http:null,status:'transport_or_non_json_error'};}if(i<5)await new Promise(r=>setTimeout(r,1000));}
   row.auth_checks.push(observation);
  }
  const anonymous=await fetch(origin+(seat==='gpt'?'/chat':'/'),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(12000)});
  row.anonymous_generation_http=anonymous.status;
  if(row.auth_checks[0].http!==401||row.auth_checks[1].http!==401||row.auth_checks[2].http!==200||!row.auth_checks[2].authenticated||anonymous.status!==401)row.status='blocked_proxy_auth_acceptance';
  }catch{row.status='blocked_proxy_auth_acceptance_transport';}
 }
 if(seat==='kimi'&&row.verified_url){try{const c=await fetch(row.verified_url.replace('/health','/catalogue'),{headers:{Authorization:'Bearer '+process.env.LTZZZ_AGENT_TOKEN},signal:AbortSignal.timeout(25000)}),d=await c.json();row.worker_domestic_catalogue_http=c.status;row.runtime_selected_model=d.selected_model||null;if(!c.ok||!d.ok||d.selected_model!==row.highest_supported_model)row.status='blocked_runtime_domestic_key_catalogue';}catch{row.status='blocked_runtime_domestic_key_catalogue';}}
}
}catch{report.infrastructure_error='caller_migration_or_deployment_transport_blocked';}
report.status=!report.infrastructure_error&&report.workers.every(w=>w.status==='deployed_health_revision_verified')?'deployment_health_verified':'deployment_with_blockers';
fs.mkdirSync('knowledge/results/identity',{recursive:true});fs.writeFileSync('knowledge/results/identity/provider-execution-'+run+'.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));if(report.status!=='deployment_health_verified')process.exitCode=1;
