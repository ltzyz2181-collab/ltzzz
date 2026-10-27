import {assertReadOnlyExchange} from '../../lib/financial-exit-guard.js';
import crypto from 'node:crypto';
import {raw,decimal} from './funded-invest-runtime.mjs';
export const FUND_ID='OKX-FUND-20261017-001',TRANSFER_ID='lzfund20261017001',CONVERSION_ID='lzconvert20261017001';
const USDC='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',DEST='0x217ba12313a5555b3bd6d4cf64893f74e8fba117';
export function verifyDestination(config,networks,addresses,now=Date.now()){
 const account=config?.data?.[0],hash=crypto.createHash('sha256').update(String(account?.uid||'unknown')).digest('hex').slice(0,16);
 if(!config?.ok||hash!=='dc5657b650a7580e'||!String(account.perm).split(',').includes('trade'))throw Error('OKX_funding_account_or_permission_mismatch');
 const n=networks?.ok&&networks.data.find(x=>x.ccy==='USDC'&&x.chain==='USDC-Base');if(!n||n.canDep!==true||n.ctAddr?.toLowerCase()!==USDC||raw(n.minDep)>20000000n)throw Error('OKX_Base_native_USDC_deposit_unavailable');
 const a=addresses?.ok&&addresses.data.find(x=>x.ccy==='USDC'&&x.chain==='USDC-Base'&&x.selected===true);if(!a||a.addr?.toLowerCase()!==DEST||a.to!=='6'||a.tag||a.memo)throw Error('OKX_verified_deposit_destination_changed');
 return {account_hash:hash,chain:'USDC-Base',address:DEST,asset:USDC,canDep:true,checked_at:now};
}
export function capitalClient(credentials,{fetcher=fetch,now=()=>new Date().toISOString()}={}){return async(method,path,body)=>{
 assertReadOnlyExchange(method);
 if(method==='POST'){
  const transfer=path==='/api/v5/asset/transfer'&&body?.ccy==='USDC'&&body.amt==='20'&&body.from==='6'&&body.to==='18'&&body.type==='0'&&body.clientId===TRANSFER_ID&&Object.keys(body).length===6;
  const convert=path==='/api/v5/trade/order'&&body?.instId==='USDC-USDT'&&body.tdMode==='cash'&&body.ordType==='ioc'&&body.side==='sell'&&body.clOrdId===CONVERSION_ID&&raw(body.sz,12)<=20000000000000n&&raw(body.sz,12)>0n&&raw(body.px,12)>=990000000000n&&Object.keys(body).length===7;
  if(!transfer&&!convert)throw Error('OKX_capital_operation_forbidden');
 }else if(method!=='GET'||!path.startsWith('/api/v5/'))throw Error('OKX_capital_endpoint_forbidden');
 if(!credentials.key||!credentials.secret||!credentials.pass)throw Error('OKX_capital_credentials_missing');
 const text=body?JSON.stringify(body):'',ts=now(),headers={'Content-Type':'application/json','OK-ACCESS-KEY':credentials.key,'OK-ACCESS-PASSPHRASE':credentials.pass,'OK-ACCESS-TIMESTAMP':ts,'OK-ACCESS-SIGN':crypto.createHmac('sha256',credentials.secret).update(ts+method+path+text).digest('base64')};
 let response;try{response=await fetcher('https://www.okx.com'+path,{method,headers,body:body?text:undefined,redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw Error(method==='POST'?'OKX_capital_submission_unknown':'OKX_capital_read_unavailable');}
 const r=await response.json();return {ok:response.ok&&r.code==='0',http:response.status,code:r.code,data:r.data||[]};
};}
export function conversionOrder(instrument,ticker){
 if(instrument?.instId!=='USDC-USDT'||instrument.state!=='live'||ticker?.instId!=='USDC-USDT')throw Error('OKX_USDC_conversion_instrument_unavailable');
 const bid=raw(ticker.bidPx,12),tick=raw(instrument.tickSz,12),lot=raw(instrument.lotSz,12),min=raw(instrument.minSz,12);if(bid<995000000000n||bid>1005000000000n||tick<=0n||lot<=0n)throw Error('OKX_stablecoin_quote_outside_bound');
 const floor=bid*9950n/10000n,px=(floor+tick-1n)/tick*tick,qty=20000000000000n/lot*lot;if(qty<min||px<990000000000n)throw Error('OKX_conversion_minimum_or_price_invalid');
 return {instId:'USDC-USDT',tdMode:'cash',ordType:'ioc',side:'sell',px:decimal(px,12),sz:decimal(qty,12),clOrdId:CONVERSION_ID};
}
// One owner-confirmed recovery of an explicit permission rejection, never a
// timeout recovery. Keep the same request/clientId and preserve the old result.
export async function recoverPermissionRejectedTransfer(client,record,{authorization,lease,persist}){
 if(authorization!=='owner-confirmed-20261017'||record.response_code!=='50120'||!['rejected','submission_unknown'].includes(record.state)||record.permission_recovery_count||record.transId||record.path!=='/api/v5/asset/transfer')return record;
 const expected={ccy:'USDC',amt:'20',from:'6',to:'18',type:'0',clientId:TRANSFER_ID};
 if(JSON.stringify(record.request)!==JSON.stringify(expected))throw Error('OKX_recovery_transfer_identity_mismatch');
 const prior=await client('GET','/api/v5/asset/transfer-state?clientId='+TRANSFER_ID+'&type=0');
 if(prior.ok)return record; // Reconcile the existing operation; never resubmit it.
 if(prior.http!==200||prior.code!=='58129'||prior.data.length)throw Error('OKX_recovery_prior_lookup_uncertain');
 const funding=await client('GET','/api/v5/asset/balances?ccy=USDC'),trading=await client('GET','/api/v5/account/balance?ccy=USDC,USDT');
 if(!funding.ok||!trading.ok||raw(funding.data.find(x=>x.ccy==='USDC')?.availBal||'0',12)<20000000000000n||(trading.data[0]?.details||[]).some(x=>['USDC','USDT'].includes(x.ccy)&&raw(x.availBal||'0',12)>0n))throw Error('OKX_recovery_balance_evidence_inconsistent');
 record.permission_recovery_history=[...(record.permission_recovery_history||[]),{state:record.state,response_code:record.response_code,operation_code:record.operation_code||null,lease:record.lease,lookup_code:prior.code,owner_authorization:authorization,at:new Date().toISOString()}];
 record.permission_recovery_count=1;record.state='submission_authorized';record.lease=lease;await persist(record);return record;
}
// Durable submission authorization must be committed before POST. An uncertain
// prior submission may only be looked up; it can never submit a second request.
export async function capitalOnce(client,record,{persist,lease}){
 if(record.state==='submission_authorized'&&record.lease===lease){if(record.path==='/api/v5/trade/order'){const t=await client('GET','/api/v5/market/ticker?instId=USDC-USDT');if(!t.ok||raw(record.request.px,12)<raw(t.data[0]?.bidPx,12)*9950n/10000n)throw Error('OKX_conversion_quote_stale');}record.state='submission_started';await persist(record);let r;try{r=await client('POST',record.path,record.request);}catch{record.state='submission_unknown';await persist(record);return record;}
  const row=r.data[0];record.response_code=r.code;record.response_http=r.http;if(!r.ok||(row?.sCode&&row.sCode!=='0')){record.state=r.http===200||r.code==='50120'?'rejected':'submission_unknown';record.operation_code=row?.sCode||null;await persist(record);return record;}record.state='accepted_pending_reconciliation';await persist(record);
 }
 if(record.state==='rejected')return record;
 const isTransfer=record.path==='/api/v5/asset/transfer',q=isTransfer?'/api/v5/asset/transfer-state?clientId='+TRANSFER_ID:'/api/v5/trade/order?instId=USDC-USDT&clOrdId='+CONVERSION_ID;
 const r=await client('GET',q);if(!r.ok||!r.data[0]){record.state='submission_unknown';record.lookup_code=r.code;await persist(record);return record;}const row=r.data[0];
 if(isTransfer){if(row.clientId!==TRANSFER_ID||row.ccy!=='USDC'||row.from!=='6'||row.to!=='18'||raw(row.amt,12)!==20000000000000n)throw Error('OKX_transfer_identity_mismatch');record.state=row.state==='success'?'confirmed':row.state==='failed'?'failed':'accepted_pending_reconciliation';record.transId=row.transId;}
 else{if(row.clOrdId!==CONVERSION_ID||row.instId!=='USDC-USDT'||row.tdMode!=='cash'||row.side!=='sell'||row.ordType!=='ioc'||raw(row.sz,12)!==raw(record.request.sz,12)||raw(row.px,12)!==raw(record.request.px,12))throw Error('OKX_conversion_identity_mismatch');const filled=raw(row.accFillSz||'0',12),price=raw(row.avgPx||'0',12);if(filled>raw(record.request.sz,12))throw Error('OKX_conversion_fill_exceeds_cap');let net=filled*price/(10n**12n);if(row.feeCcy!=='USDT'&&row.fee!=='0')throw Error('OKX_conversion_fee_currency_unverified');const fee=String(row.fee||'0');if(!/^-?\d+(?:\.\d{1,12})?$/.test(fee))throw Error('OKX_conversion_fee_invalid');if(fee.startsWith('-'))net-=raw(fee.slice(1),12);else net+=raw(fee,12);if(fee.startsWith('-')&&raw(fee.slice(1),12)>100000000000n)throw Error('OKX_conversion_fee_exceeds_reserved_bound');if(net<0n)throw Error('OKX_conversion_net_negative');Object.assign(record,{state:['filled','canceled'].includes(row.state)?'confirmed':'accepted_pending_reconciliation',ordId:row.ordId,filled_usdc:decimal(filled,12),net_usdt:decimal(net,12),fee:row.fee,fee_currency:row.feeCcy});}
 await persist(record);return record;
}
