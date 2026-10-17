import crypto from 'node:crypto';
import {raw,decimal,clientOrderId} from './funded-invest-runtime.mjs';
const ORIGIN='https://www.okx.com',D=12,S=10n**12n;
export function okxCredentials(env=process.env){return {key:env.OKX_API_KEY,secret:env.OKX_API_SECRET||env.OKX_SECRET_KEY,pass:env.OKX_API_PASSPHRASE||env.OKX_PASSPHRASE};}
export function okxClient(credentials,{fetcher=fetch,now=()=>new Date().toISOString()}={}){
 return async(method,path,body,{publicRead=false}={})=>{
  if(!path.startsWith('/api/v5/')||(!['GET','POST'].includes(method))||(method==='POST'&&path!=='/api/v5/trade/order'))throw Error('okx_endpoint_not_allowed');
  if(method==='POST'&&(body?.instId!=='BTC-USDT'||body?.tdMode!=='cash'||body?.ordType!=='ioc'||body?.side!=='buy'||Object.keys(body).some(k=>!['instId','tdMode','ordType','side','px','sz','clOrdId'].includes(k))))throw Error('okx_order_shape_forbidden');
  const serialized=body?JSON.stringify(body):'',timestamp=now(),headers={'Content-Type':'application/json'};
  if(!publicRead){if(!credentials.key||!credentials.secret||!credentials.pass)throw Error('okx_missing_secret_triplet');Object.assign(headers,{'OK-ACCESS-KEY':credentials.key,'OK-ACCESS-PASSPHRASE':credentials.pass,'OK-ACCESS-TIMESTAMP':timestamp,'OK-ACCESS-SIGN':crypto.createHmac('sha256',credentials.secret).update(timestamp+method+path+serialized).digest('base64')});}
  let response;try{response=await fetcher(ORIGIN+path,{method,headers,body:body?serialized:undefined,redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw Error(method==='POST'?'okx_submission_unknown':'okx_read_transport_failed');}
  let result;try{result=await response.json();}catch{throw Error('okx_non_json_http_'+response.status);}
  return {http:response.status,code:result.code,data:result.data||[],ok:response.ok&&result.code==='0'};
 };
}
export function spotOrder({orderId,agent,budget,instrument,ticker,policy,priceLimit}){
 if(instrument?.instId!=='BTC-USDT'||instrument.state!=='live'||ticker?.instId!=='BTC-USDT')throw Error('okx_instrument_not_live');
 const ask=raw(ticker.askPx,D),tick=raw(instrument.tickSz,D),lot=raw(instrument.lotSz,D),min=raw(instrument.minSz,D);
 if(ask<=0n||tick<=0n||lot<=0n||min<=0n)throw Error('okx_instrument_invalid');
 if(!Number.isInteger(policy.max_slippage_bps)||policy.max_slippage_bps<0||policy.max_slippage_bps>50||!Number.isInteger(policy.fee_reserve_bps)||policy.fee_reserve_bps<50||policy.fee_reserve_bps>100)throw Error('okx_policy_exceeds_bound');
 // Keep room below the exchange's moving upper band instead of pricing exactly
 // at our maximum allowed 50bps. The policy is a ceiling, not a target price.
 const max=ask*BigInt(10000+Math.min(policy.max_slippage_bps,5))/10000n;
 let ceiling=max;
 if(priceLimit){if(priceLimit.instId!=='BTC-USDT'||typeof priceLimit.enabled!=='boolean')throw Error('okx_price_band_invalid');if(priceLimit.enabled){const band=raw(priceLimit.buyLmt,D);if(band<=0n)throw Error('okx_price_band_invalid');if(band<ceiling)ceiling=band;}}
 const px=ceiling/tick*tick;
 if(px<ask)throw Error('okx_price_band_below_ask_wait');
 if(px<=0n)throw Error('okx_price_below_tick');
 const usable=raw(budget,D)*BigInt(10000-policy.fee_reserve_bps)/10000n,qty=(usable*S/px)/lot*lot;
 if(qty<min)throw Error('okx_quota_below_minimum');
 return {instId:'BTC-USDT',tdMode:'cash',ordType:'ioc',side:'buy',px:decimal(px,D),sz:decimal(qty,D),clOrdId:clientOrderId(orderId,agent)};
}
export async function recoverPriceBandRejection(client,record,{authorization,request,lease,save}){
 if(authorization!=='owner-fixed-price-band-v1'||record.state!=='rejected'||record.order_code!=='51137'||record.price_band_recovery_count||record.order_id||record.trade_executed||record.paid)return record;
 if(request.clOrdId!==record.request.clOrdId||request.clOrdId!==clientOrderId(record.order_round,record.agent)||request.instId!=='BTC-USDT'||request.tdMode!=='cash'||request.ordType!=='ioc'||request.side!=='buy')throw Error('okx_reprice_identity_mismatch');
 if(record.order_round!=='OWNER-FUNDED-20261017-01'||raw(request.sz,D)*raw(request.px,D)/S>raw(record.budget_usdt,D)*9950n/10000n)throw Error('okx_reprice_budget_mismatch');
 const found=await client('GET','/api/v5/trade/order?instId=BTC-USDT&clOrdId='+request.clOrdId);
 if(found.ok)throw Error('okx_reprice_existing_order_requires_reconciliation');
 if(found.code!=='51603')throw Error('okx_reprice_lookup_uncertain');
 record.price_band_recovery_history=[...(record.price_band_recovery_history||[]),{request:record.request,state:record.state,exchange_code:record.exchange_code,order_code:record.order_code,submission_lease:record.submission_lease,at:new Date().toISOString()}];
 record.request=request;record.price_band_recovery_count=1;record.state='submission_authorized';record.submission_lease=lease;await save(record);return record;
}
export async function spotReadiness(client){
 const config=await client('GET','/api/v5/account/config');if(!config.ok)return {ok:false,status:'okx_config_rejected',code:config.code,http:config.http};
 if(!String(config.data[0]?.perm||'').split(',').map(s=>s.trim()).includes('trade'))return {ok:false,status:'okx_trade_permission_missing'};
 const balance=await client('GET','/api/v5/account/balance?ccy=USDT');if(!balance.ok)return {ok:false,status:'okx_balance_rejected',code:balance.code,http:balance.http};
 const detail=balance.data[0]?.details?.find(x=>x.ccy==='USDT'),available=detail?.availBal||'0';raw(available,D);
 const fees=await client('GET','/api/v5/account/trade-fee?instType=SPOT&instId=BTC-USDT');
 if(!fees.ok||typeof fees.data[0]?.taker!=='string'||!/^[-+]?0(?:\.\d{1,12})?$/.test(fees.data[0].taker)||raw(fees.data[0].taker.replace(/^[-+]/,''),D)>5000000000n)return {ok:false,status:'okx_fee_exceeds_reserved_bound_or_unverified'};
 return {ok:true,status:'verified_configured_cash_account',available_usdt:available,account_id_hash:crypto.createHash('sha256').update(String(config.data[0]?.uid||'unknown')).digest('hex').slice(0,16)};
}
export async function executeSpot(client,record,{freshLease=false,save=async()=>{},pause=ms=>new Promise(r=>setTimeout(r,1500))}={}){
 const path='/api/v5/trade/order?instId=BTC-USDT&clOrdId='+record.request.clOrdId;
 let known=await client('GET',path);
 if(!known.ok&&known.code!=='51603')throw Error('okx_order_lookup_uncertain');
 if(!known.ok){
  if(!freshLease||record.state!=='submission_authorized')return {...record,state:'submission_unknown_requires_reconciliation'};
  const budget=raw(record.budget_usdt,D),cost=raw(record.request.sz,D)*raw(record.request.px,D)/S;if(budget<=0n||budget>20n*S||cost<=0n||cost>budget*9950n/10000n)throw Error('okx_order_exceeds_reserved_budget');
  const fresh=await client('GET','/api/v5/market/ticker?instId=BTC-USDT',undefined,{publicRead:true});if(!fresh.ok||fresh.data[0]?.instId!=='BTC-USDT'||raw(record.request.px,D)>raw(fresh.data[0].askPx,D)*10050n/10000n)throw Error('okx_quote_stale_or_slippage_exceeded');
  if(record.price_band_recovery_count){const b=await client('GET','/api/v5/public/price-limit?instId=BTC-USDT',undefined,{publicRead:true});if(!b.ok||b.data[0]?.instId!=='BTC-USDT'||b.data[0]?.enabled!==true||raw(record.request.px,D)>raw(b.data[0].buyLmt,D))throw Error('okx_price_band_changed_before_submission');}
  record.state='submission_started';await save(record);
  let placed;try{placed=await client('POST','/api/v5/trade/order',record.request);}catch{record.state='submission_unknown_requires_reconciliation';await save(record);return record;}
  const row=placed.data[0];
  if(!placed.ok||row?.sCode!=='0'||!row?.ordId){record.state=placed.http===200&&row?.sCode&&row.sCode!=='0'?'rejected':'submission_unknown_requires_reconciliation';record.exchange_code=placed.code;record.order_code=row?.sCode||null;await save(record);return record;}
  record.order_id=row.ordId;record.state='accepted_pending_fill';await save(record);
  for(let i=0;i<4;i++){known=await client('GET',path);if(known.ok&&['filled','canceled','mmp_canceled'].includes(known.data[0]?.state))break;if(i<3)await pause();}
 }
 if(known.ok){const row=known.data[0];if(row?.instId!=='BTC-USDT'||row.clOrdId!==record.request.clOrdId||row.side!=='buy'||row.tdMode!=='cash'||row.ordType!=='ioc'||raw(row.sz,D)!==raw(record.request.sz,D)||raw(row.px,D)!==raw(record.request.px,D))throw Error('okx_order_identity_mismatch');const filled=raw(row.accFillSz||'0',D),px=raw(row.avgPx||'0',D),spent=filled*px/S;
  Object.assign(record,{order_id:row.ordId,exchange_state:row.state,filled_btc:decimal(filled,D),spent_usdt:decimal(spent,D),fee:row.fee||'0',fee_currency:row.feeCcy||null,trade_executed:filled>0n,paid:filled>0n,tx_hash:null,settlement_type:'exchange_spot_trade',state:filled>0n?(row.state==='filled'?'filled':'partially_filled'):(['canceled','mmp_canceled'].includes(row.state)?'canceled_unfilled':'accepted_pending_fill')});
  if(spent>raw(record.budget_usdt,D))throw Error('okx_spend_exceeded_reserved_quota');await save(record);
 }
 return record;
}
