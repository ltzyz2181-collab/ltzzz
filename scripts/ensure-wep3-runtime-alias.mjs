import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';
// Cloudflare's safe rename rollout: ship both class names first, then rename
// while the old name remains an alias. Settings expose names, not secret values.
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;if(!account||!token)throw Error('Cloudflare_deployment_credentials_missing');
const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/workers/scripts/ltzzz-wep3/settings',{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});const settings=await response.json();if(!response.ok||!settings.success)throw Error('Cloudflare_runtime_binding_inspection_failed');
const current=settings.result?.bindings?.find(b=>b.name==='MARKET')?.class_name;
if(current==='MarketRuntimeV3'){console.log('State-preserving runtime rename already applied; no compatibility downgrade.');process.exit(0);}
if(current!=='MarketRuntimeV2')throw Error('unexpected_durable_class_refuse_migration');
const config=fs.readFileSync('wrangler.wep3.toml','utf8'),marker='# Receipt-sensor runtime rollover:';if(!config.includes(marker))throw Error('reviewed_runtime_migration_missing');
const compat=config.slice(0,config.indexOf(marker)).replace('class_name = "MarketRuntimeV3"','class_name = "MarketRuntimeV2"').replace('main = "wep3-worker.js"','main = '+JSON.stringify(path.resolve('wep3-worker.js'))),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ltzzz-runtime-alias-'));
try{
 const file=path.join(dir,'wrangler.toml');fs.writeFileSync(file,compat);execFileSync('npx',['wrangler','deploy','-c',file],{stdio:'inherit'});
 let ready=false;for(let i=0;i<30;i++){try{const r=await fetch('https://ltzzz-wep3.ltzyz2181.workers.dev/health',{cache:'no-store',signal:AbortSignal.timeout(10000)}),h=await r.json();if(r.ok&&h.runtime_alias_ready==='MarketRuntimeV3_aliases_MarketRuntimeV2'&&h.aave_runtime_revision==='aave-guard-v8'){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,2000));}
 if(!ready)throw Error('runtime_alias_rollout_not_observed_refuse_rename');console.log('Both runtime class names deployed; safe to rename the existing namespace.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
