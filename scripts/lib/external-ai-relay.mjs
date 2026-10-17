import {PROVIDER} from './external-procurement-preflight.mjs';
import {procurementBody,paymentQuote} from '../../wep3-procurement.js';
import {wep3Request} from './funded-invest-runtime.mjs';
export async function externalAIRelay(token,{api=wep3Request,fetcher=fetch}={}){
 const existing=await api('/market/procurement/order',{token});if(existing.order)return existing;
 const body=procurementBody(),free=await fetcher(PROVIDER.url,{method:'POST',headers:{'Content-Type':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(20000)}),header=free.headers.get('PAYMENT-REQUIRED');if(!header||header.length>60000)throw Error('external_quote_header_invalid');const q=JSON.parse(Buffer.from(header,'base64').toString('utf8'));paymentQuote(free.status,q);
 const prepared=await api('/market/procurement/prepare-relay',{token,body:{quote:q}});if(!prepared.relay)return prepared;
 // Only the first durable handoff contains the authorization. No retries of the
 // paid HTTP request, even if it times out; all later calls reconcile the DO.
 if(prepared.relay.body!==body)throw Error('external_relay_body_mismatch');paymentQuote(402,{x402Version:2,accepts:[prepared.relay.payment_payload.accepted]});
 const auth=prepared.relay.payment_payload.payload?.authorization;if(auth?.from?.toLowerCase()!=='0x5df57a78e0a13df2ae983bdad69cfcbd3dd7a32d'||auth.value!==prepared.relay.payment_payload.accepted.amount||auth.to?.toLowerCase()!==PROVIDER.payTo)throw Error('external_relay_authorization_mismatch');
 let paid;try{paid=await fetcher(PROVIDER.url,{method:'POST',headers:{'Content-Type':'application/json','PAYMENT-SIGNATURE':Buffer.from(JSON.stringify(prepared.relay.payment_payload)).toString('base64'),'Idempotency-Key':'EXT-AI-20261017-001'},body,redirect:'error',signal:AbortSignal.timeout(90000)});}catch{return api('/market/procurement/order',{token});}
 const response=await paid.text();if(response.length>65536)throw Error('external_relay_response_too_large');return api('/market/procurement/relay-result',{token,body:{http:paid.status,body:response,payment_response:paid.headers.get('PAYMENT-RESPONSE')||''}});
}
