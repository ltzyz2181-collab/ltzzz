export const PROVIDER={id:'agent402-nano-candidate',url:'https://agent402.tools/v1/nano/chat/completions',network:'eip155:8453',asset:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',payTo:'0xabf4fabd7c416fb67202e5f9002389fc75e2a9d0',quote_screening_ceiling_raw:'50000'};
export function inspectQuote(http,requirements){
 if(http!==402)return {status:'blocked_expected_402',http};
 if(requirements?.x402Version!==2||!Array.isArray(requirements.accepts))return {status:'blocked_invalid_x402_v2'};
 const accepted=requirements.accepts.find(a=>a.scheme==='exact'&&a.network===PROVIDER.network&&String(a.asset).toLowerCase()===PROVIDER.asset&&String(a.payTo).toLowerCase()===PROVIDER.payTo);
 if(!accepted)return {status:'blocked_chain_asset_scheme_or_recipient'};
 if(typeof accepted.amount!=='string'||!/^[1-9]\d{0,15}$/.test(accepted.amount)||BigInt(accepted.amount)>BigInt(PROVIDER.quote_screening_ceiling_raw))return {status:'blocked_quote_amount'};
 if(accepted.extra?.assetTransferMethod==='permit2')return {status:'blocked_unimplemented_permit2'};
 return {status:'quote_verified_not_purchased',network:accepted.network,asset:accepted.asset,pay_to:accepted.payTo,amount_raw:String(accepted.amount),scheme:accepted.scheme,x402_version:2};
}
export async function procurementPreflight({fetcher=fetch}={}){
 const r={at:new Date().toISOString(),provider:PROVIDER.id,endpoint:PROVIDER.url,model_calls:0,payments_submitted:0,paid:false,tx_hash:null,production_cash_payout_enabled:false,internal_credit_redeemable:false};
 try{
  // Fixed quote-only GET; never use a payment wrapper or follow seller redirects.
  const response=await fetcher(PROVIDER.url,{method:'GET',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});
  const raw=response.headers.get('PAYMENT-REQUIRED');
  if(raw&&raw.length>60000)throw Error('quote_header_too_large');
  const quote=raw?JSON.parse(Buffer.from(raw,'base64').toString('utf8')):await response.json();
  r.quote=inspectQuote(response.status,quote);r.status=r.quote.status;
 }catch{r.status='blocked_quote_network_or_schema';}
 r.purchase_status='not_attempted';
 r.blockers=['external_provider_control_and_sample_not_independently_accepted','order_scoped_cash_reservation_and_refund_liabilities_not_implemented','restricted_external_AI_payment_executor_not_deployed','no_confirmed_cash_payment_linked_to_this_delivery'];
 r.next_step='Accept an independent external AI sample, reserve one order budget, then deploy and fault-test a restricted service-purchase executor. A quote is not payment authorization.';
 return r;
}
