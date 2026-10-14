import {x402ResourceServer,HTTPFacilitatorClient} from '@x402/core/server';
import {ExactEvmScheme} from '@x402/evm/exact/server';
import {encodePaymentRequiredHeader,decodePaymentSignatureHeader,encodePaymentResponseHeader} from '@x402/core/http';
import {recordBuyerFunding} from './wep3-order-contract.js';
import {liveReady,verifyBaseTransfer} from './wep3-base-payment.js';
const canonical=x=>JSON.stringify(x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).filter(k=>x[k]!==undefined).sort().map(k=>[k,JSON.parse(canonical(x[k]))])):Array.isArray(x)?x.map(v=>JSON.parse(canonical(v))):x);
const FACILITATOR='https://facilitator.payai.network';
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const json=(b,status=200,extra={})=>new Response(JSON.stringify(b),{status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Idempotency-Key,X-Order-Token,PAYMENT-SIGNATURE','Access-Control-Expose-Headers':'PAYMENT-REQUIRED,PAYMENT-RESPONSE','Cache-Control':'no-store',...extra}});
export async function standardX402(m,request,book){
 const url=new URL(request.url),skill=book.skills.find(s=>s.id===url.pathname.slice('/market/skill/'.length));
 if(request.method!=='POST'||!skill)return json({ok:false,error:'skill_and_post_required'},422);
 if(!liveReady(m.env))return json({ok:false,error:'treasury_not_ready',required:['X402_RECEIVE_ADDRESS (controlled rotated Base address)','X402_LIVE=1'],standard_x402_version:2},503);
 const body=await request.json().catch(()=>({})),rid=request.headers.get('Idempotency-Key');
 if(!/^[a-zA-Z0-9_-]{16,100}$/.test(rid||'')||typeof body.brief!=='string'||body.brief.length<10||body.brief.length>3000)return json({ok:false,error:'brief_and_unique_idempotency_key_required'},422);
 book.machine_requests||={};const input=await digest(JSON.stringify({skill:skill.id,brief:body.brief}));let o=book.orders[book.machine_requests[rid]];
 if(o&&o.input_hash!==input)return json({ok:false,error:'idempotency_input_mismatch'},409);
 const access=request.headers.get('X-Order-Token')||'';
 if(o?.access_hash){if(await digest(access)!==o.access_hash)return json({ok:false,error:'order_token_required'},401);}
 else {if(!/^[a-fA-F0-9]{64}$/.test(access))return json({ok:false,error:'buyer_generated_32_byte_order_token_required'},422);if(o?.payment_signature_hash)return json({ok:false,error:'legacy_order_requires_private_recovery'},409);if(o){o.access_hash=await digest(access);await m.save(book);}}
 if(!o?.payment_signature_hash&&Object.values(book.orders).filter(x=>x.live&&!x.parent_id&&x.payment_rail==='x402_v2'&&['settlement_pending','settlement_unknown','queued','processing','review_failed','blocked'].includes(x.status)).length>=3)return json({ok:false,error:'external_trial_queue_full',retry_without_new_authorization:true},503);
 async function serverReady(){if(!m.x402Server){m.x402Server=new x402ResourceServer(new HTTPFacilitatorClient({url:FACILITATOR,timeoutMs:20000})).register('eip155:8453',new ExactEvmScheme());try{await m.x402Server.initialize()}catch{m.x402Server=null;return false}}return true;}
 let server=m.x402Server;
 if(!o){
  if(Object.keys(book.machine_requests).length>=10000)return json({ok:false,error:'machine_order_capacity'},429);
  if(!await serverReady())return json({ok:false,error:'facilitator_unavailable'},503);server=m.x402Server;
  const q=await m.quote(book,skill),id='ORDER-'+crypto.randomUUID();
  const requirements=await server.buildPaymentRequirements({scheme:'exact',network:'eip155:8453',payTo:m.env.X402_RECEIVE_ADDRESS,price:'$'+(q.price_cents/100).toFixed(2),maxTimeoutSeconds:300});
  o={id,access_hash:await digest(access),skill:skill.id,worker:skill.agent,brief:body.brief,input_hash:input,live:true,status:'awaiting_payment',amount_cents:q.price_cents,currency:'usd',children:[],parent_id:null,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+300000).toISOString(),requirements,resource_url:request.url,payment_rail:'x402_v2',budget_cents:Math.floor(q.price_cents*.4),allocated_cents:0};
  book.orders[id]=o;book.machine_requests[rid]=id;await m.save(book);
 }
 const signature=request.headers.get('PAYMENT-SIGNATURE');
 if(!signature){
  const required={x402Version:2,accepts:o.requirements,resource:{url:o.resource_url,description:'LTZZZ '+skill.title,mimeType:'application/json'}};
  return json({ok:false,order_id:o.id,expires_at:o.expires_at,...required},402,{'PAYMENT-REQUIRED':encodePaymentRequiredHeader(required)});
 }
 if(signature.length>20000)return json({ok:false,error:'payment_header_too_large'},422);
 let payload;try{payload=decodePaymentSignatureHeader(signature)}catch{return json({ok:false,error:'invalid_payment_signature_header'},422)}
 if(payload.x402Version!==2||payload.resource?.url!==o.resource_url)return json({ok:false,error:'payment_resource_mismatch'},422);
 const matching=o.requirements.find(r=>canonical(payload.accepted)===canonical(r));
 if(!matching||canonical(payload.accepted)!==canonical(matching))return json({ok:false,error:'payment_requirements_mismatch'},422);
 const proofHash=await digest(signature);if(o.payment_signature_hash&&o.payment_signature_hash!==proofHash)return json({ok:false,error:'use_original_payment_authorization'},409);
 if(!o.payment_signature_hash){
  if(Date.parse(o.expires_at)<Date.now())return json({ok:false,error:'quote_expired'},410);
  const nonce=payload.payload?.authorization?.nonce;
  if(!/^0x[a-fA-F0-9]{40}$/.test(payload.payload?.authorization?.from||'')||!/^0x[a-fA-F0-9]{64}$/.test(nonce||''))return json({ok:false,error:'authorization_nonce_required'},422);
  const nonceKey='x402-nonce:'+String(payload.payload.authorization.from).toLowerCase()+':'+nonce.toLowerCase();
  if(book.events[nonceKey]&&book.events[nonceKey]!==o.id)return json({ok:false,error:'authorization_already_used'},409);
  if(!await serverReady())return json({ok:false,error:'facilitator_verify_unavailable'},503);server=m.x402Server;
  let verify;try{verify=await server.verifyPayment(payload,matching)}catch{return json({ok:false,error:'facilitator_verify_unavailable'},503)}
  if(!verify.isValid)return json({ok:false,error:'payment_not_verified'},402);
  o.payment_signature_hash=proofHash;o.payment_payload=payload;o.status='settlement_pending';book.events[nonceKey]=o.id;await m.save(book);
 }
 // Buyer capability is independent of the payment signature, which becomes public on chain.
 const result=await resumeMachineOrder(m,book,o);
 if(!result.ok)return json({ok:false,status:o.status,reason:result.error,order_id:o.id,access_token:access,result_url:'/market/order/'+o.id,retry_same_request:true},202);
 return json({ok:true,order_id:o.id,status:o.status,access_token:access,result_url:'/market/order/'+o.id},202,{'PAYMENT-RESPONSE':encodePaymentResponseHeader(o.settlement)});
}
export async function confirmMachineOrder(m,book,o){
 if(['queued','processing','delivered','review_failed','blocked'].includes(o.status))return {ok:true};
 if(o.settlement?.success!==true||!o.settlement?.transaction)return {ok:false,error:'settlement_receipt_missing'};
 const ch={protocol:'base-usdc-direct-v1',pay_to:o.requirements[0].payTo,amount_cents:o.amount_cents,created_at:o.created_at,expires_at:o.expires_at,expected_payer:o.payment_payload?.payload?.authorization?.from,expected_nonce:o.payment_payload?.payload?.authorization?.nonce};
 const checked=await verifyBaseTransfer(m.env,ch,o.settlement.transaction);if(!checked.ok)return checked;
 const key='base:'+checked.tx_hash;if(book.events[key]&&book.events[key]!==o.id)return {ok:false,error:'transaction_already_used'};
 recordBuyerFunding(o,checked);
 book.events[key]=o.id;o.payment_evidence=checked;o.status='queued';o.paid_at=new Date().toISOString();
 book.live_revenue_cents+=o.amount_cents;book.pool_available_cents+=o.amount_cents-o.budget_cents;book.pool_reserved_cents+=o.budget_cents;
 book.ledger.push({type:'x402_v2_payment',order_id:o.id,amount_cents:o.amount_cents,tx_hash:checked.tx_hash,at:o.paid_at});await m.save(book);return {ok:true};
}

export async function resumeMachineOrder(m,book,o){
 if(['queued','processing','delivered','review_failed','blocked'].includes(o.status))return {ok:true};
 if(o.settlement?.success!==true){
  if(!o.payment_payload)return {ok:false,error:'original_authorization_missing_do_not_pay_again'};
  if((o.settle_attempts||0)>=4)return {ok:false,error:'settlement_retry_cap_review_required'};
  if(!m.x402Server){m.x402Server=new x402ResourceServer(new HTTPFacilitatorClient({url:FACILITATOR,timeoutMs:20000})).register('eip155:8453',new ExactEvmScheme());try{await m.x402Server.initialize()}catch{m.x402Server=null;return {ok:false,error:'facilitator_unavailable'}}}
  o.settle_attempts=(o.settle_attempts||0)+1;o.status='settlement_pending';await m.save(book);
  try{o.settlement=await m.x402Server.settlePayment(o.payment_payload,o.requirements[0]);}catch{o.status='settlement_unknown';await m.save(book);return {ok:false,error:'settlement_unknown_retry_same_authorization'};}
  if(o.settlement.network!=='eip155:8453'||!/^0x[a-fA-F0-9]{64}$/.test(o.settlement.transaction||'')||o.settlement.success!==true){await m.save(book);return {ok:false,error:'settlement_pending_retry_same_authorization'};}
  await m.save(book);
 }
 return confirmMachineOrder(m,book,o);
}
