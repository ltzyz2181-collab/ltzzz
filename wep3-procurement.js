import {Wallet,Interface} from 'ethers';
import {aaveStatus,withAaveReadProvider,AAVE} from './wep3-aave.js';
import {cashFloorRaw} from './wep3-cash-liabilities.js';
import {PROVIDER,inspectQuote} from './scripts/lib/external-procurement-preflight.mjs';
export const PROCUREMENT_ORDER='EXT-AI-20261017-001';
export const PROCUREMENT_REVISION='external-purchase-v4';
const ABI=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)','event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)']);
const TYPES={TransferWithAuthorization:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}]};
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export const publicPurchase=o=>{if(!o)return null;const {payment_payload,...visible}=o;return visible;};
const paidStatus=o=>!o.deliverable?'paid_delivery_unavailable':o.delivery_accepted?'paid_delivery_schema_valid_pending_review':'paid_delivery_rejected';
function paymentLedger(book,o){book.ledger||=[];if(!book.ledger.some(r=>r.type==='external_AI_cash_payment'&&r.order_id===o.id))book.ledger.push({type:'external_AI_cash_payment',order_id:o.id,amount_raw:o.amount_raw,currency:'Base_USDC',tx_hash:o.tx_hash,paid:true,at:new Date().toISOString()});}
export function paymentQuote(http,q){const screened=inspectQuote(http,q);if(screened.status!=='quote_verified_not_purchased')throw Error(screened.status);const a=q.accepts.find(a=>a.network===PROVIDER.network&&a.scheme==='exact'&&a.asset?.toLowerCase()===PROVIDER.asset&&a.payTo?.toLowerCase()===PROVIDER.payTo);if(a.extra?.name!=='USD Coin'||a.extra?.version!=='2')throw Error('unexpected_USDC_domain');if(!Number.isInteger(a.maxTimeoutSeconds)||a.maxTimeoutSeconds<30)throw Error('invalid_quote_timeout');return a;}
export function transferMatches(receipt,o){if(!receipt||Number(receipt.status)!==1)return false;let transfer=false,nonce=false;for(const log of receipt.logs||[]){if(log.address?.toLowerCase()!==AAVE.usdc.toLowerCase())continue;let p;try{p=ABI.parseLog(log);}catch{continue;}if(p?.name==='Transfer'&&p.args.from.toLowerCase()===o.payer.toLowerCase()&&p.args.to.toLowerCase()===PROVIDER.payTo&&p.args.value===BigInt(o.amount_raw))transfer=true;if(p?.name==='AuthorizationUsed'&&p.args.authorizer.toLowerCase()===o.payer.toLowerCase()&&p.args.nonce.toLowerCase()===o.nonce.toLowerCase())nonce=true;}return transfer&&nonce;}
async function chainPayment(o){
 const read=await withAaveReadProvider(async p=>{
  let tx=o.tx_hash;
  if(!tx){const logs=await p.getLogs({address:AAVE.usdc,topics:[ABI.getEvent('AuthorizationUsed').topicHash,'0x'+o.payer.slice(2).toLowerCase().padStart(64,'0'),o.nonce],fromBlock:o.before_block,toBlock:'latest'});tx=logs[0]?.transactionHash;}
  if(!tx)return {verified:false,tx_hash:null};
  const receipt=await p.getTransactionReceipt(tx);return {verified:transferMatches(receipt,o),tx_hash:tx,receipt_status:receipt?.status??null,block_number:receipt?.blockNumber??null};
 });return read.value;
}
const prompt='LTZZZ hires one external AI for a small engineering deliverable. Return ONLY JSON {issues:[{id,method,reason}],tests:[{id,expected_http}]}. Review this caller against the API: caller sends GET /market/aave/preview and puts a JSON body only on POST. The API accepts POST /market/aave/preview with {intent_id,action,amount_usdc}; it returns {ok,status,balances,plan}. GET /market/aave/status returns single_cap_usdc and exposure_cap_usdc at top level. Caller reads status.limits and falls back to an old saved limit if absent. Explain the two concrete integration defects and give one positive preview test and one wrong-auth test. No instructions to transfer funds or edit policy. Do not claim tests ran.';
export const procurementBody=()=>JSON.stringify({model:'deepseek/deepseek-chat',messages:[{role:'user',content:prompt}],max_tokens:768,stream:false});
export async function externalPurchase(m,book,{execute=false,fetcher=fetch,statusReader=aaveStatus,paymentVerifier=chainPayment,now=Date.now,providedQuote,relayPrepare=false}={}){
 book.procurement||={};let o=book.procurement[PROCUREMENT_ORDER];
 if(o){
  if(['payment_submitted_unknown','delivery_received_payment_pending'].includes(o.status)){
   try{const proof=await paymentVerifier(o);if(proof.verified){Object.assign(o,{paid:true,tx_hash:proof.tx_hash,payment_proof:proof,status:paidStatus(o),completed_at:new Date(now()).toISOString()});paymentLedger(book,o);await m.save(book);}else if(proof.tx_hash){o.tx_hash=proof.tx_hash;o.payment_proof=proof;await m.save(book);}}
   catch{ /* An unknown payment is reserved, never bought again. */ }
  }
  return {ok:true,revision:PROCUREMENT_REVISION,order:publicPurchase(o),reused:true};
 }
 if(!execute)return {ok:true,revision:PROCUREMENT_REVISION,status:'ready_for_one_owner_authorized_purchase',order_id:PROCUREMENT_ORDER,max_usdc:'0.05',endpoint:PROVIDER.url,paid:false,tx_hash:null};
 const status=await statusReader(m,book);if(!status.ok||status.address?.toLowerCase()!==m.env.X402_RECEIVE_ADDRESS?.toLowerCase())return {ok:false,error:'treasury_state_unavailable'};
 if(status.paused)return {ok:false,error:'treasury_paused'};
 let pendingInvestment=0n;
 if(status.active_intent){
  const active=book.aave?.intents?.[status.active_intent];
  if(!active||!['supply','withdraw'].includes(active.action)||!/^\d+$/.test(active.amount_raw||''))return {ok:false,error:'pending_investment_liability_unverified'};
  if(active.action==='supply')pendingInvestment=BigInt(active.amount_raw);
 }
 let wallet;try{wallet=new Wallet(m.env.TREASURY_EXECUTOR_KEY);if(wallet.address.toLowerCase()!==status.address.toLowerCase())throw Error();}catch{return {ok:false,error:'treasury_signer_not_controlled'};}
 // A free quote is not a model generation. The exact same body is used for payment.
 const body=procurementBody();
 let q,accepted;
 try{if(providedQuote){q=providedQuote;accepted=paymentQuote(402,q);}else{const r=await fetcher(PROVIDER.url,{method:'POST',headers:{'Content-Type':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(20000)});const h=r.headers.get('PAYMENT-REQUIRED');if(h&&h.length>60000)throw Error();q=h?JSON.parse(atob(h)):await r.json();accepted=paymentQuote(r.status,q);}}catch{return {ok:false,error:'external_quote_not_accepted',paid:false,tx_hash:null};}
 const value=BigInt(accepted.amount);if(BigInt(status.usdc_raw)-value-pendingInvestment<cashFloorRaw(book))return {ok:false,error:'cash_liabilities_reserve'};
 const timestamp=Math.floor(now()/1000),nonce='0x'+Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
 o={id:PROCUREMENT_ORDER,status:'reserved',payer:wallet.address,pay_to:accepted.payTo,amount_raw:accepted.amount,nonce,valid_before:timestamp+Math.min(120,accepted.maxTimeoutSeconds),before_block:status.block_number,paid:false,tx_hash:null,delivery_accepted:false,provider:'agent402.tools',model_requested:'deepseek/deepseek-chat',model_identity_verification:'provider_report_only',spec_provided_in_prompt:true,original_design_claimed:false,request_sha256:await digest(body),at:new Date(now()).toISOString()};
 book.procurement[o.id]=o;book.ledger||=[];book.ledger.push({type:'external_AI_purchase_reserved',order_id:o.id,amount_raw:o.amount_raw,currency:'Base_USDC',paid:false,tx_hash:null,at:o.at});await m.save(book);
 const authorization={from:wallet.address,to:accepted.payTo,value:accepted.amount,validAfter:String(timestamp-10),validBefore:String(o.valid_before),nonce};
 const signature=await wallet.signTypedData({name:'USD Coin',version:'2',chainId:8453,verifyingContract:AAVE.usdc},TYPES,authorization);
 o.model_generation_attempts=1;o.acceptance_kind='deterministic_structural_contract_check_not_independent_model_review';o.independent_review_status='pending';
 o.payment_payload={x402Version:2,resource:q.resource,accepted,payload:{signature,authorization}};o.status='payment_submitted_unknown';await m.save(book);
 if(relayPrepare){o.relay_handed_off=true;await m.save(book);return {ok:true,revision:PROCUREMENT_REVISION,order:publicPurchase(o),relay:{body,payment_payload:o.payment_payload}};}
 try{
  const r=await fetcher(PROVIDER.url,{method:'POST',headers:{'Content-Type':'application/json','PAYMENT-SIGNATURE':btoa(JSON.stringify(o.payment_payload)),'Idempotency-Key':o.id},body,redirect:'error',signal:AbortSignal.timeout(90000)});
  o.http=r.status;
  const raw=await r.text();if(raw.length>65536)throw Error('response_too_large');o.response_sha256=await digest(raw);
  let result;try{result=JSON.parse(raw);}catch{result=null;}
  const choice=result?.choices?.[0],text=choice?.message?.content;
  if(typeof text==='string'){o.deliverable=text.slice(0,16000);o.deliverable_sha256=await digest(text);o.model_reported=result.model||null;o.usage=result.usage||null;o.finish_reason=choice.finish_reason;try{const artifact=JSON.parse(text.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));o.delivery_accepted=!!(r.ok&&choice.finish_reason==='stop'&&Array.isArray(artifact.issues)&&artifact.issues.length>=2&&artifact.issues.every(i=>typeof i.id==='string'&&typeof i.method==='string'&&typeof i.reason==='string'&&i.reason.length>=10)&&Array.isArray(artifact.tests)&&artifact.tests.some(t=>t.expected_http===200)&&artifact.tests.some(t=>t.expected_http===401));o.artifact=artifact;}catch{} }
  const receipt=r.headers.get('PAYMENT-RESPONSE');if(receipt&&receipt.length<20000){try{const s=JSON.parse(atob(receipt));if(s.success&&s.network===PROVIDER.network&&/^0x[a-fA-F0-9]{64}$/.test(s.transaction||''))o.tx_hash=s.transaction;}catch{}}
  o.status='delivery_received_payment_pending';await m.save(book);
  const proof=await paymentVerifier(o);if(proof.verified)Object.assign(o,{paid:true,tx_hash:proof.tx_hash,payment_proof:proof,status:paidStatus(o)});else if(proof.tx_hash)o.tx_hash=proof.tx_hash;
  if(o.paid)paymentLedger(book,o);await m.save(book);
 }catch{await m.save(book);}
 return {ok:true,revision:PROCUREMENT_REVISION,order:publicPurchase(o)};
}

export async function completeExternalRelay(m,book,{http,body,payment_response},{paymentVerifier=chainPayment}={}){
 const o=book.procurement?.[PROCUREMENT_ORDER];if(!o?.relay_handed_off)return {ok:false,error:'external_relay_not_prepared'};
 if(o.relay_result_received)return externalPurchase(m,book,{paymentVerifier});
 if(!Number.isInteger(http)||http<100||http>599||typeof body!=='string'||body.length>65536||typeof payment_response!=='string'||payment_response.length>20000)return {ok:false,error:'external_relay_response_invalid'};
 const raw=body,paymentResponse=payment_response;o.http=http;o.response_sha256=await digest(raw);
  let result;try{result=JSON.parse(raw);}catch{result=null;}
  const choice=result?.choices?.[0],text=choice?.message?.content;
  if(typeof text==='string'){o.deliverable=text.slice(0,16000);o.deliverable_sha256=await digest(text);o.model_reported=result.model||null;o.usage=result.usage||null;o.finish_reason=choice.finish_reason;try{const artifact=JSON.parse(text.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));o.delivery_accepted=!!(http>=200&&http<300&&choice.finish_reason==='stop'&&Array.isArray(artifact.issues)&&artifact.issues.length>=2&&artifact.issues.every(i=>typeof i.id==='string'&&typeof i.method==='string'&&typeof i.reason==='string'&&i.reason.length>=10)&&Array.isArray(artifact.tests)&&artifact.tests.some(t=>t.expected_http===200)&&artifact.tests.some(t=>t.expected_http===401));o.artifact=artifact;}catch{} }
  const receipt=paymentResponse;if(receipt&&receipt.length<20000){try{const s=JSON.parse(atob(receipt));if(s.success&&s.network===PROVIDER.network&&/^0x[a-fA-F0-9]{64}$/.test(s.transaction||''))o.tx_hash=s.transaction;}catch{}}

 o.relay_result_received=true;o.status='delivery_received_payment_pending';await m.save(book);
 try{const proof=await paymentVerifier(o);if(proof.verified){Object.assign(o,{paid:true,tx_hash:proof.tx_hash,payment_proof:proof,status:paidStatus(o)});paymentLedger(book,o);await m.save(book);}}catch{}
 return {ok:true,revision:PROCUREMENT_REVISION,order:publicPurchase(o)};
}
