import {externalAIRelay} from './lib/external-ai-relay.mjs';
import {relayPersisted} from './lib/wep3-signed-relay.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {buildDispatch,runnerToken,wep3Request,intentId,raw,SEATS,confirmedAaveAllocation} from './lib/funded-invest-runtime.mjs';
import {okxCredentials,okxClient,spotOrder,spotReadiness,executeSpot,recoverPriceBandRejection} from './lib/okx-funded-spot.mjs';
const {values}=parseArgs({options:{venue:{type:'string',default:'all'},agent:{type:'string',default:'all'},phase:{type:'string',default:'run'}},strict:true});
const venues={all:'all',web3:'web3',defi:'web3',okx_web3_defi:'web3',cex:'cex',okx:'cex',okx_cex:'cex'};
if(!venues[values.venue]||!['run','prepare','execute'].includes(values.phase)||(values.agent!=='all'&&!SEATS[values.agent])){console.error('invalid_executor_arguments');process.exit(2);}
const venue=venues[values.venue],selected=values.agent,day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const armed=process.env.ARM_REAL_ORDERS==='1'&&process.env.ARM_ACK===day;
const policy=JSON.parse(fs.readFileSync('policy/funded-owner-round-20261017.json','utf8'));
const root='knowledge/results/funded-invest',roundFile=path.join(root,policy.order_id+'.json');fs.mkdirSync(root,{recursive:true});
const runId=process.env.GITHUB_RUN_ID||('local-'+Date.now()),attempt=process.env.GITHUB_RUN_ATTEMPT||'1',lease=runId+'-'+attempt;
const report={at:new Date().toISOString(),run_id:runId,run_attempt:attempt,order_id:policy.order_id,venue,agent:selected,armed,model_calls:0,native_model_calls:0,paid:false,tx_hash:null,confirmed_investment_orders:0,results:[],network_context:process.env.GITHUB_ACTIONS?'github_hosted_runner_no_vpn_step':'local_network_not_independently_verified',owner_no_vpn_verified:false};
const reportFile=path.join(root,'run-'+runId+'-attempt-'+attempt+'.json');
const write=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n');fs.renameSync(temp,file);};
const save=()=>write(reportFile,report);const token=runnerToken(),api=(p,body)=>wep3Request(p,{body,token});const exchange=okxClient(okxCredentials());
let round;
function claimFile(agent){return path.join(root,policy.order_id+'-cex-'+agent+'.json');}
async function prepare(){
 if(fs.existsSync(roundFile)){round=JSON.parse(fs.readFileSync(roundFile));report.reused_frozen_dispatch=true;}
 else{const [status,snapshot]=await Promise.all([api('/market/aave/status'),api('/market/receipts/snapshot')]);round=buildDispatch(policy,status,snapshot);round.source_commit=process.env.GITHUB_SHA||null;}
 report.dispatch=round;
 try{report.cex_readiness=await spotReadiness(exchange);}catch{report.cex_readiness={ok:false,status:'okx_credentials_or_read_unavailable',missing_secret_triplet:!Object.values(okxCredentials()).every(Boolean)};}
 if(!armed){report.execution_status='dry_run_only';save();return;}
 if(!fs.existsSync(roundFile))write(roundFile,round);
 if(venue!=='web3'&&report.cex_readiness.ok){
  if(raw(report.cex_readiness.available_usdt,12)<raw(round.cex_funding_budget_usdt||policy.cex.total_usdt,12)){report.cex_readiness={...report.cex_readiness,ok:false,status:'configured_OKX_account_insufficient_USDT'};save();return;}
  const [i,t,b]=await Promise.all([exchange('GET','/api/v5/public/instruments?instType=SPOT&instId=BTC-USDT',undefined,{publicRead:true}),exchange('GET','/api/v5/market/ticker?instId=BTC-USDT',undefined,{publicRead:true}),exchange('GET','/api/v5/public/price-limit?instId=BTC-USDT',undefined,{publicRead:true})]);
  if(!i.ok||!t.ok||!b.ok||!b.data[0])throw Error('okx_market_or_price_band_read_failed');report.cex_price_band=b.data[0];
  for(const grant of round.cex.filter(g=>selected==='all'||g.id===selected)){
   if(fs.existsSync(claimFile(grant.id))){const record=JSON.parse(fs.readFileSync(claimFile(grant.id)));if(record.state==='rejected'&&record.order_code==='51137'&&process.env.REPRICE_REJECTED_OKX==='owner-fixed-price-band-v1'){const request=spotOrder({orderId:policy.order_id,agent:grant.id,budget:grant.amount,instrument:i.data[0],ticker:t.data[0],priceLimit:b.data[0],policy:policy.cex});await recoverPriceBandRejection(exchange,record,{authorization:process.env.REPRICE_REJECTED_OKX,request,lease,save:async r=>write(claimFile(grant.id),r)});}continue;}
   try{const request=spotOrder({orderId:policy.order_id,agent:grant.id,budget:grant.amount,instrument:i.data[0],ticker:t.data[0],priceLimit:b.data[0],policy:policy.cex});write(claimFile(grant.id),{agent:grant.id,budget_usdt:grant.amount,score:grant.score,request,order_round:policy.order_id,state:'submission_authorized',submission_lease:lease,custody:'configured_OKX_account',trade_executed:false,paid:false,tx_hash:null,hypothesis:'Bounded cash BTC spot exposure, no leverage; experiment may lose value',exit_plan:'No lock-up; same-account cash sale can close. No automated stop-loss or profit guarantee is claimed.'});}catch(error){report.results.push({agent:grant.id,venue:'cex',status:'not_prepared',error:error.message});}
  }
 }
 report.execution_status='prepared_claims_require_persistence';save();
}
async function execute(){
 if(!armed)throw Error('not_armed_for_current_policy_day');
 if(process.env.GITHUB_ACTIONS&&process.env.FUNDED_CLAIMS_PERSISTED!=='1')throw Error('claims_not_committed');
 round=JSON.parse(fs.readFileSync(roundFile,'utf8'));report.dispatch=round;
 // Purchase only the single fixed owner-authorized external order; its DO persists
 // the nonce and authorization before transmission and never buys on a retry.
 try{report.external_ai=process.env.EXTERNAL_RECONCILE_ONLY==='1'?await api('/market/procurement/order'):await externalAIRelay(token);for(let p=0;p<3&&['payment_submitted_unknown','delivery_received_payment_pending'].includes(report.external_ai.order?.status);p++){await new Promise(r=>setTimeout(r,3000));report.external_ai=await api('/market/procurement/order');}}catch(error){report.external_ai={status:'blocked_or_uncertain_query_existing_order_before_retry',error:error.message,paid:false,tx_hash:null};}report.model_calls=report.external_ai?.paid_request_attempted_this_run?(report.external_ai?.order?.deliverable?1:null):0;report.paid_provider_request_attempts_this_run=report.external_ai?.paid_request_attempted_this_run?1:0;report.external_order_total_generation_attempts=report.external_ai?.order?.model_generation_attempts||0;save();
 if(venue!=='cex')for(const grant of round.web3.filter(g=>selected==='all'||g.id===selected)){
  if(BigInt(grant.amount_raw)<=0n){report.results.push({agent:grant.id,venue:'web3',status:'no_budget'});continue;}
  const input={intent_id:intentId(policy.order_id,grant.id),action:'supply',amount_usdc:grant.amount};
  const result={agent:grant.id,venue:'aave_Base_USDC',intent_id:input.intent_id,amount_usdc:grant.amount,custody:'LTZZZ_treasury',paid:false,tx_hash:null,native_model_call:false,hypothesis:'Supply the reputation-allocated budget to Aave V3 Base without borrowing',exit_plan:'Withdraw through existing guarded executor back to LTZZZ treasury; no personal wallet or Safe involved'};
  try{
   let prior;try{prior=await api('/market/aave/intent?id='+input.intent_id);}catch(error){if(error.message!=='wep3_http_404_intent_missing')throw error;}
   let actual;
   if(confirmedAaveAllocation(prior,grant,input.intent_id)){actual=prior;result.preview_status='existing_confirmed_receipt_no_reexecution';}
   else{
    const profilePath='config/owner-web3-readonly.json';
    if(fs.existsSync(profilePath)){const profile=JSON.parse(fs.readFileSync(profilePath));if(profile.existing_round_id===policy.order_id&&profile.address?.toLowerCase()!==round.treasury.address.toLowerCase())throw Error('owner_requested_Web3_child_wallet_requires_its_own_funds_and_signer');}
    const preview=await api('/market/aave/preview',input);result.preview_status=preview.status;
    actual=await api('/market/aave/execute',input);
    for(let p=0;p<6&&['pending','pending_confirmations'].includes(actual.status);p++){result.relay=await relayPersisted({kind:'aave',intent_id:input.intent_id,amount_raw:grant.amount_raw,token});await new Promise(r=>setTimeout(r,3000));actual=await api('/market/aave/execute',input);}
   }
   result.receipt=actual;const supply=actual.steps?.find(s=>s.kind==='supply');
   if(actual.status==='confirmed'&&supply?.tx_hash&&supply.status==='confirmed'){Object.assign(result,{status:'confirmed',paid:true,on_chain_executed:true,tx_hash:supply.tx_hash,settlement_type:'Aave_supply'});report.confirmed_investment_orders++;}
   else result.status='pending_or_unknown_reconcile_same_intent';
  }catch(error){result.status='blocked_or_unknown_reconcile_same_intent';result.error=error.message;}
  report.results.push(result);save();if(result.status!=='confirmed')break;
 }
 if(venue!=='web3'){
  let ready;try{ready=await spotReadiness(exchange);}catch{ready={ok:false,status:'okx_credentials_or_read_unavailable',missing_secret_triplet:!Object.values(okxCredentials()).every(Boolean)};}report.cex_readiness=ready;
  for(const grant of round.cex.filter(g=>selected==='all'||g.id===selected)){
   const file=claimFile(grant.id);if(!ready.ok||!fs.existsSync(file)){report.results.push({agent:grant.id,venue:'okx_cash_spot',status:!ready.ok?ready.status:raw(ready.available_usdt,12)<raw(round.cex_funding_budget_usdt||policy.cex.total_usdt,12)?'configured_OKX_trading_USDT_insufficient':'claim_not_prepared_or_below_minimum',paid:false,tx_hash:null});continue;}
   let record=JSON.parse(fs.readFileSync(file));try{record=await executeSpot(exchange,record,{freshLease:record.submission_lease===lease&&record.state==='submission_authorized',save:async r=>write(file,r)});}catch(error){record={...record,state:'blocked_or_unknown',error:error.message};write(file,record);}
   report.results.push({venue:'okx_cash_spot',...record});save();if(record.state.includes('unknown'))break;
  }
 }
 report.paid=report.results.some(r=>r.paid)||report.external_ai?.order?.paid===true;report.tx_hash=report.results.find(r=>r.tx_hash)?.tx_hash||report.external_ai?.order?.tx_hash||null;
 report.execution_status='completed_with_per_order_states';save();
}
try{if(!token)throw Error('runner_authentication_missing');if(values.phase!=='execute')await prepare();if(values.phase!=='prepare'&&armed)await execute();console.log(JSON.stringify({file:reportFile,status:report.execution_status,armed,results:report.results.map(r=>({agent:r.agent,venue:r.venue,status:r.status||r.state,paid:r.paid,tx_hash:r.tx_hash,order_id:r.order_id})),external_ai:report.external_ai?.order?.status}));}
catch(error){report.execution_status='blocked';report.error=/^[a-zA-Z0-9_-]+$/.test(error.message)?error.message:'executor_transport_or_schema_failure';save();console.error(report.error);process.exitCode=1;}
