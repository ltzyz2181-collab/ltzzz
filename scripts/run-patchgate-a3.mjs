import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {canonical,sha256,verifyDeployment} from './lib/patchgate.mjs';
export const TARGET={service:'ltzzz-patchgate-canary',url:'https://ltzzz-patchgate-canary.ltzyz2181.workers.dev/canary'};
const REPO='ltzyz2181-collab/ltzzz',SHA=/^[a-f0-9]{40}$/,ROOTS=['workers/patchgate-canary/index.js','wrangler.patchgate-canary.toml','config/patchgate-a3.json','config/patch-policy.json','scripts/run-patchgate-a3.mjs','scripts/lib/patchgate.mjs','.github/workflows/patchgate-a3.yml','tools/push-receipt-commit.mjs'];
const safeError=e=>/^[a-zA-Z0-9_:-]{1,180}$/.test(e?.message||'')?e.message:'a3_executor_or_transport_failed';
export function validateA3Policy(policy,base){
  if(policy?.schema!=='ltzzz.patchgate.a3-isolated.v1'||policy.task_id!=='PLAN-PATCHGATE-ESCROW-20261023'||policy.enabled!==true||policy.service!==TARGET.service||policy.url!==TARGET.url||policy.freshness_seconds!==300||policy.automatic_rollback!==false||policy.generic_production_deploy_enabled!==false||policy.financial_execution!==false||base?.canary_targets?.filter(v=>v.url===TARGET.url).length!==1)throw Error('single_registered_inert_canary_required');
  return policy;
}
export function trustedContext(env=process.env){
  if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||!['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)||!SHA.test(env.GITHUB_SHA||'')||!/^\d+$/.test(env.GITHUB_RUN_ID||'')||!/^\d+$/.test(env.GITHUB_RUN_ATTEMPT||''))throw Error('trusted_main_A3_execution_required');
  return {task_id:'PLAN-PATCHGATE-ESCROW-20261023',source_commit:env.GITHUB_SHA,run_id:env.GITHUB_RUN_ID,run_attempt:env.GITHUB_RUN_ATTEMPT};
}
const git=args=>{const r=spawnSync('git',args,{encoding:'utf8'});if(r.status!==0)throw Error('a3_git_readback_failed');return r.stdout.trim();};
export function sourceReadback(source,run=git){
  if(run(['rev-parse','HEAD'])!==source)throw Error('a3_checkout_source_mismatch');run(['fetch','origin','main']);
  const observed=run(['rev-parse','origin/main']);if(!SHA.test(observed))throw Error('a3_main_readback_failed');
  const files=ROOTS.map(file=>{const before=run(['rev-parse',source+':'+file]),after=run(['rev-parse',observed+':'+file]);if(!SHA.test(before)||before!==after)throw Error('a3_runtime_source_changed');return {path:file,git_blob:before};});
  return {observed_main_commit:observed,source_files:files,source_set_sha256:sha256(canonical(files))};
}
export function activeVersion(result){
  const deployments=Array.isArray(result)?result:result?.deployments;
  if(!Array.isArray(deployments)||!deployments.length)throw Error('cloudflare_current_deployment_missing');
  const deployment=[...deployments].sort((a,b)=>Date.parse(b.created_on)-Date.parse(a.created_on))[0],versions=deployment.versions;
  if(!Array.isArray(versions)||versions.length!==1||versions[0].percentage!==100||typeof versions[0].version_id!=='string'||!versions[0].version_id)throw Error('canary_single_active_version_required');
  return {deployment_id:deployment.id||null,id:versions[0].version_id};
}
export async function collectCanary({source,base,api,fetcher=fetch,clock=Date.now}){
  if(!SHA.test(source)||!SHA.test(base))throw Error('full_A3_subject_commits_required');
  const started=clock(),initial=activeVersion(await api('/deployments'));
  const response=await fetcher(TARGET.url,{redirect:'error',headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)}),body=Buffer.from(await response.arrayBuffer());
  if(body.length>4096)throw Error('canary_metadata_too_large');
  const current=activeVersion(await api('/deployments')),observed=clock(),finished=clock();
  const evidence={head_sha:source,base_sha:base,target_environment:'canary',expected_version_id:initial.id,observation:{url:TARGET.url,http_status:response.status,redirected:response.redirected,started_at_utc:new Date(started).toISOString(),finished_at_utc:new Date(finished).toISOString(),http_date:response.headers.get('Date'),header_source_commit:response.headers.get('X-Source-Commit'),header_version_id:response.headers.get('X-Worker-Version-Id'),body_base64:body.toString('base64'),body_sha256:sha256(body)},platform:{http_status:200,source:'cloudflare_current_deployment_api',service_name:TARGET.service,deployment_id:current.deployment_id,observed_at_utc:new Date(observed).toISOString(),versions:[{id:current.id,percentage:100}]}};
  const verification=verifyDeployment({subject:{head_sha:source,base_sha:base},evidence,allowedTargets:[{url:TARGET.url}],freshnessSeconds:300,now:finished});
  return {evidence,verification};
}
export async function collectCapabilities({source,expectedVersion,api,fetcher=fetch,clock=Date.now}){
  if(!SHA.test(source||'')||typeof expectedVersion!=='string'||!expectedVersion)throw Error('capability_subject_required');
  const started=clock(),initial=activeVersion(await api('/deployments')),url=new URL('/capabilities',TARGET.url).href;
  const response=await fetcher(url,{redirect:'error',headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)}),bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>4096)throw Error('capability_metadata_too_large');
  let body;try{body=JSON.parse(bytes.toString('utf8'));}catch{throw Error('capability_json_required');}
  const current=activeVersion(await api('/deployments')),finished=clock(),date=Date.parse(response.headers.get('Date'));
  const expected={schema:'ltzzz.deep-superagent.capability-card.v1',coordinator:'deepseek',worker_seats:['doubao','qianwen','kimi','grok'],decision_seat:'gpt',deployment_executor:'trusted_CI_after_GPT_decision',financial_execution:false,external_submissions_enabled:false,native_paid_reserved_enabled:false,source_commit:source};
  const checks={transport:response.status===200&&response.redirected===false&&/application\/json/i.test(response.headers.get('Content-Type')||''),contract:canonical(body)===canonical(expected),commit:body?.source_commit===source&&response.headers.get('X-Source-Commit')===source,current_version:initial.id===expectedVersion&&current.id===expectedVersion&&response.headers.get('X-Worker-Version-Id')===expectedVersion,fresh:Number.isFinite(date)&&finished>=started&&finished-started<=300000&&date>=started-300000&&date<=finished+5000};
  return {passed:Object.values(checks).every(Boolean),checks,url,http_status:response.status,body,body_sha256:sha256(bytes),header_source_commit:response.headers.get('X-Source-Commit'),header_version_id:response.headers.get('X-Worker-Version-Id'),http_date:response.headers.get('Date'),platform_version_id:current.id,observed_at_utc:new Date(finished).toISOString()};
}
export function reconcileExisting(readback){
  if(readback.verification.passed)return {already_current:true};
  const e=readback.evidence,body=JSON.parse(Buffer.from(e.observation.body_base64,'base64').toString('utf8'));
  if(!SHA.test(body.source_commit||''))throw Error('existing_canary_source_unknown');
  const verified=verifyDeployment({subject:{head_sha:body.source_commit,base_sha:e.base_sha},evidence:{...e,head_sha:body.source_commit},allowedTargets:[{url:TARGET.url}],freshnessSeconds:300,now:Date.parse(e.observation.finished_at_utc)});
  if(!verified.passed)throw Error('existing_canary_not_reconciled');
  return {already_current:false,previous_source_commit:body.source_commit,previous_version_id:e.expected_version_id};
}
function redact(value,secrets){if(typeof value==='string')return secrets.filter(Boolean).reduce((v,s)=>v.replaceAll(s,'[REDACTED]'),value);if(Array.isArray(value))return value.map(v=>redact(v,secrets));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redact(v,secrets)]));return value;}
export async function main(env=process.env){
  const context=trustedContext(env),policy=validateA3Policy(JSON.parse(fs.readFileSync('config/patchgate-a3.json')),JSON.parse(fs.readFileSync('config/patch-policy.json')));
  const report={schema:'ltzzz.patchgate.a3-live.v1',...context,at_utc:new Date().toISOString(),scope:policy.scope,status:'started',target:TARGET,model_calls:0,transactions:0,paid:false,tx_hash:null,generic_production_deploy_enabled:false,automatic_rollback:false,financial_execution:false};
  const folder='knowledge/results/patchgate/a3',file=path.join(folder,context.run_id+'-attempt-'+context.run_attempt+'.json'),secrets=[env.CLOUDFLARE_API_TOKEN];
  const save=()=>{fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(file,JSON.stringify(redact(report,secrets),null,2)+'\n');};
  try{
    if(!env.CLOUDFLARE_API_TOKEN||!env.CLOUDFLARE_ACCOUNT_ID)throw Error('existing_cloud_deployment_credentials_required');
    Object.assign(report,sourceReadback(context.source_commit));
    const base=git(['rev-parse',context.source_commit+'^1']);report.base_commit=base;
    const api=async(suffix,{allow404=false}={})=>{
      const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/workers/scripts/'+TARGET.service+suffix,{headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN},redirect:'error',signal:AbortSignal.timeout(20000)});
      if(r.status===404&&allow404)return null;const d=await r.json();if(!r.ok||d.success!==true)throw Error('cloudflare_A3_api_'+r.status);return d.result;
    };
    const settings=await api('/settings',{allow404:true});
    if(settings&&(settings.bindings?.some(v=>v.type==='secret_text')||!settings.bindings?.some(v=>v.name==='CANARY_PROFILE'&&v.text==='patchgate-a3-isolated-v1')))throw Error('preexisting_canary_service_not_owned_by_this_profile');
    if(settings){const existing=await collectCanary({source:context.source_commit,base,api});report.reconciliation=reconcileExisting(existing);if(report.reconciliation.already_current)Object.assign(report,existing);}
    if(!report.reconciliation?.already_current){
      report.status='deployment_started';save();
      const deployed=spawnSync('npx',['--yes','wrangler@4','deploy','-c','wrangler.patchgate-canary.toml','--keep-vars','--var','CANARY_SOURCE_COMMIT:'+context.source_commit],{encoding:'utf8',timeout:180000});
      if(deployed.status!==0){report.deployment_diagnostic=redact({exit:deployed.status,stderr:String(deployed.stderr||'').slice(-4000),stdout:String(deployed.stdout||'').slice(-4000)},secrets);throw Error('canary_deploy_failed');}
      report.deployment_completed=true;save();
    }else report.deployment_reused_without_repeat=true;
    const deadline=Date.now()+120000;
    do{
      try{Object.assign(report,await collectCanary({source:context.source_commit,base,api}));if(report.verification.passed)break;}catch(e){report.readback_error=safeError(e);}
      if(Date.now()<deadline)await new Promise(r=>setTimeout(r,2000));
    }while(Date.now()<deadline);
    if(!report.verification?.passed)throw Error('canary_live_reverification_failed');
    report.capabilities_verification=await collectCapabilities({source:context.source_commit,expectedVersion:report.evidence.expected_version_id,api});
    if(!report.capabilities_verification.passed)throw Error('capability_live_reverification_failed');
    delete report.readback_error;report.status='single_isolated_A3_target_deployed_and_reverified';report.finished_at_utc=new Date().toISOString();save();
    fs.writeFileSync(path.join(folder,'latest.json'),JSON.stringify(redact(report,secrets),null,2)+'\n');
    const stateFile='knowledge/results/patchgate/status.json',state=JSON.parse(fs.readFileSync(stateFile));
    state.A3={status:report.status,isolated_target:TARGET.url,actual_version_reverification:true,source_commit:context.source_commit,version_id:report.evidence.expected_version_id,run_id:context.run_id,acceptance_path:file,isolated_automatic_deploy_verified:true,generic_production_deploy_enabled:false,automatic_rollback_verified:false,financial_execution:false};
    fs.writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n');
  }catch(e){report.status='blocked_A3_deploy_or_readback';report.error=safeError(e);report.finished_at_utc=new Date().toISOString();save();process.exitCode=1;}
  console.log(JSON.stringify({status:report.status,error:report.error||null,receipt:file,checks:report.verification?.checks||null,model_calls:0,transactions:0}));return report;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))await main();
