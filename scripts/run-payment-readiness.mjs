import fs from 'node:fs';
import path from 'node:path';
import {createHash,createHmac} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const ORIGIN='https://ltzzz-wep3.ltzyz2181.workers.dev';
export const ROUTES=['/health','/market/catalog','/market/treasury','/market/aave/status','/market/runtime-state','/market/procurement/order','/market/procurement/daily?date=2026-11-03'];
const ALLOWED=new Set(['ok','error','status','revision','source_commit','source_sha','deployed_commit','runtime_revision','market_runtime_revision','aave_runtime_revision','procurement_runtime_revision','daily_hire_revision','atomic_ledger_ready','legacy_writes_enabled','controlled','chain_id','address','usdc_raw','paused','active_intent','book_sha256','order_count','ledger_count','live_revenue_cents','test_revenue_cents','aave_intent_count','first_supply_confirmed','exit_test_confirmed','order_id','id','paid','tx_hash','delivery_accepted','independent_review_status','model_generation_attempts','request_sha256','response_sha256','deliverable_sha256','http','reused','max_usdc','currency','generation_verified']);
const safeValue=v=>typeof v==='boolean'||v===null||(typeof v==='number'&&Number.isFinite(v))||(typeof v==='string'&&v.length<=180&&/^[a-zA-Z0-9_.:/?= -]*$/.test(v));
export function publicMetadata(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 const result={};for(const [key,v]of Object.entries(value))if(ALLOWED.has(key)&&safeValue(v))result[key]=v;
 for(const key of ['order','rails','storage_status'])if(value[key]&&typeof value[key]==='object'){
  if(key==='rails')result.rails=Object.fromEntries(Object.entries(value.rails).filter(([k])=>['stripe','x402','base_usdc','solana_usdc','alipay'].includes(k)).map(([k,v])=>[k,Object.fromEntries(['configured','mode','status','network','asset','receiver_ready'].filter(f=>safeValue(v?.[f])).map(f=>[f,v[f]]))]));
  else result[key]=publicMetadata(value[key]);
 }
 return result;
}
export async function readSnapshot(route,{token,fetcher=fetch}={}){
 if(!ROUTES.includes(route))throw Error('fixed_read_only_route_required');
 const authenticated=['/market/runtime-state','/market/procurement/order','/market/procurement/daily?date=2026-11-03'].includes(route);
 if(authenticated&&!token)return {route,status:'blocked_existing_runner_auth_missing'};
 try{
  const r=await fetcher(ORIGIN+route,{method:'GET',headers:{Accept:'application/json',...(authenticated?{'X-Lab-Pin':token}:{})},redirect:'error',signal:AbortSignal.timeout(45000)});
  const raw=await r.text();if(raw.length>524288)throw Error('metadata_response_too_large');
  let data;try{data=JSON.parse(raw);}catch{return {route,http_status:r.status,status:'not_json'};}
  return {route,http_status:r.status,observed_at_utc:new Date().toISOString(),response_sha256:createHash('sha256').update(raw).digest('hex'),metadata:publicMetadata(data)};
 }catch{return {route,status:'transport_or_response_failed_without_retry'};}
}
export function credentialPresence(env){return {api_key_id:Boolean(env.CDP_API_KEY_ID),api_key_secret:Boolean(env.CDP_API_KEY_SECRET),wallet_secret:Boolean(env.CDP_WALLET_SECRET)};}
export async function main(env=process.env){
 if(env.GITHUB_REPOSITORY!=='ltzyz2181-collab/ltzzz'||env.GITHUB_REF!=='refs/heads/main'||!['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''))throw Error('trusted_main_snapshot_required');
 const presence=credentialPresence(env),token=env.WEP3_RUNNER_TOKEN||(env.CLOUDFLARE_API_TOKEN?createHmac('sha256',env.CLOUDFLARE_API_TOKEN).update('ltzzz-runner-v2').digest('hex'):'');
 const policy=JSON.parse(fs.readFileSync('config/small-payment-autonomy.json')),authority=JSON.parse(fs.readFileSync('config/small-payment-activation-authority.json'));
 const report={schema:'ltzzz.payment.readiness-observation.v1',task_id:'PLAN-PATCHGATE-ESCROW-20261023',source_commit:env.GITHUB_SHA,run_id:env.GITHUB_RUN_ID,run_attempt:env.GITHUB_RUN_ATTEMPT,at_utc:new Date().toISOString(),status:'observed_not_activated',model_calls:0,new_payment_attempts:0,new_signatures:0,transactions_submitted:0,paid:false,tx_hash:null,
  configuration:{enabled:policy.enabled,controller_count:policy.controllers.length,payee_count:policy.payees.length,purpose_count:policy.purposes.length,budget_id_count:policy.registered_budget_ids.length,activation_authority_enabled:authority.enabled,authorization_mode:authority.authorization_mode,review_role:policy.independent_reviews.review_role},
  testnet:{network:'base-sepolia',expected_chain_id:84532,credential_presence:presence,existing_named_account:'ltzzz-ops-v1',account_creation:false,signing:false,faucet_request:false,live_escrow_transactions:[],readiness:'unverified'},snapshots:[]};
 for(const route of ROUTES)report.snapshots.push(await readSnapshot(route,{token}));
 try{const r=await fetch('https://sepolia.base.org',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify([{jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]},{jsonrpc:'2.0',id:2,method:'eth_blockNumber',params:[]}]),redirect:'error',signal:AbortSignal.timeout(20000)}),d=await r.json();const chain=d.find(v=>v.id===1)?.result,block=d.find(v=>v.id===2)?.result;report.testnet.RPC={http_status:r.status,chain_id:Number.parseInt(chain,16),block_number:Number.parseInt(block,16),verified:r.ok&&chain==='0x14a34'&&/^0x[0-9a-f]+$/i.test(block||'')};}catch{report.testnet.RPC={verified:false,status:'read_only_RPC_unavailable'};}
 report.testnet.readiness=Object.values(presence).every(Boolean)?'credentials_present_account_control_and_gas_not_yet_verified':'blocked_missing_existing_CDP_credentials';
 const folder='knowledge/results/patchgate/payment-readiness';fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,env.GITHUB_RUN_ID+'-attempt-'+env.GITHUB_RUN_ATTEMPT+'.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(folder,'latest.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,receipt:file,configuration:report.configuration,testnet:report.testnet,observations:report.snapshots.map(v=>({route:v.route,http_status:v.http_status,status:v.status||v.metadata?.status||null})),transactions_submitted:0}));return report;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))await main();
