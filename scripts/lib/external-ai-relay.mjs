import {dailyHireId,dailyHireBody} from '../../wep3-procurement-contract.js';
import {PROVIDER} from './external-procurement-preflight.mjs';
import {procurementBody,paymentQuote} from '../../wep3-procurement.js';
import {wep3Request} from './funded-invest-runtime.mjs';
export async function externalAIRelay(token,{api=wep3Request,fetcher=fetch,date,context,existingOnly=false}={}){
 const id=date?dailyHireId(date):'EXT-AI-20261017-001',readPath=date?'/market/procurement/daily?date='+date:'/market/procurement/order';
 const existing=await api(readPath,{token});if(existing.order)return existing;
 if(existingOnly)return {...existing,status:'blocked_original_order_missing_no_repurchase',paid:false,tx_hash:null};
 const body=date?dailyHireBody(date,context):procurementBody();
 const free=await fetcher(PROVIDER.url,{method:'POST',headers:{'Content-Type':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(20000)}),header=free.headers.get('PAYMENT-REQUIRED');if(!header||header.length>60000)throw Error('external_quote_header_invalid');const q=JSON.parse(Buffer.from(header,'base64').toString('utf8'));paymentQuote(free.status,q);
 const prepared=await api(date?'/market/procurement/daily-prepare-relay':'/market/procurement/prepare-relay',{token,body:{quote:q,...(date?{date,context}:{})}});if(!prepared.relay)return prepared;
 // Only the first durable handoff contains the authorization. No retries of the
 // paid HTTP request, even if it times out; all later calls reconcile the DO.
 if(prepared.relay.body!==body)throw Error('external_relay_body_mismatch');paymentQuote(402,{x402Version:2,accepts:[prepared.relay.payment_payload.accepted]});
 const auth=prepared.relay.payment_payload.payload?.authorization;if(auth?.from?.toLowerCase()!=='0x5df57a78e0a13df2ae983bdad69cfcbd3dd7a32d'||auth.value!==prepared.relay.payment_payload.accepted.amount||auth.to?.toLowerCase()!==PROVIDER.payTo)throw Error('external_relay_authorization_mismatch');
 try{
  const paid=await fetcher(PROVIDER.url,{method:'POST',headers:{'Content-Type':'application/json','PAYMENT-SIGNATURE':Buffer.from(JSON.stringify(prepared.relay.payment_payload)).toString('base64'),'Idempotency-Key':id},body,redirect:'error',signal:AbortSignal.timeout(90000)});
  const response=await paid.text();if(response.length>65536)throw Error('external_relay_response_too_large');
  return {...await api(date?'/market/procurement/daily-relay-result':'/market/procurement/relay-result',{token,body:{http:paid.status,body:response,payment_response:paid.headers.get('PAYMENT-RESPONSE')||'',...(date?{date}:{})}}),paid_request_attempted_this_run:true};
 }catch{
  // Even a lost body or failed result import happened AFTER the one paid attempt.
  // Preserve that fact and only reconcile; never transmit the authorization again.
  let current;try{current=await api(readPath,{token});}catch{current={ok:false,status:'payment_submitted_unknown'};}
  return {...current,paid_request_attempted_this_run:true};
 }
}
