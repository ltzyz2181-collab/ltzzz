import {Wallet,Interface,Transaction,keccak256} from 'ethers';
import {AAVE,aaveStatus,withAaveReadProvider,broadcastAaveRaw} from './wep3-aave.js';
import {cashFloorRaw} from './wep3-cash-liabilities.js';
export const OKX_FUNDING={id:'OKX-FUND-20261017-001',revision:'okx-funding-v1',chain:'USDC-Base',chain_id:8453,account_hash:'dc5657b650a7580e',address:'0x217ba12313a5555b3bd6d4cf64893f74e8fba117',amount_raw:'20000000',destination_evidence:'knowledge/results/funded-invest/inspection-39004684738-attempt-1.json'};
const erc=new Interface(['function transfer(address,uint256) returns(bool)','event Transfer(address indexed from,address indexed to,uint256 value)']);
export const publicFunding=o=>{if(!o)return null;const {raw,...visible}=o;return visible;};
export function fundingPending(book){return !!book.okx_funding&&!['confirmed','failed'].includes(book.okx_funding.status);}
export function fundingTransferProof(receipt,o){return receipt?.status===1&&receipt.logs?.some(log=>{if(log.address?.toLowerCase()!==AAVE.usdc.toLowerCase())return false;try{const p=erc.parseLog(log);return p?.name==='Transfer'&&p.args.from.toLowerCase()===o.treasury.toLowerCase()&&p.args.to.toLowerCase()===OKX_FUNDING.address&&p.args.value===20000000n;}catch{return false;}});}
function validateStored(o){const tx=Transaction.from(o.raw);if(o.id!==OKX_FUNDING.id||o.amount_raw!==OKX_FUNDING.amount_raw||o.destination!==OKX_FUNDING.address||tx.hash!==o.tx_hash||tx.chainId!==8453n||tx.from?.toLowerCase()!==o.treasury.toLowerCase()||tx.to?.toLowerCase()!==AAVE.usdc.toLowerCase()||tx.value!==0n||tx.data!==erc.encodeFunctionData('transfer',[OKX_FUNDING.address,20000000n]))throw Error('funding_stored_transaction_mismatch');}
export function fundingRelay(book){const o=book.okx_funding;if(!o?.raw||['confirmed','failed'].includes(o.status)||book.aave?.paused||book.aave?.active_intent)return {ok:false,error:'funding_no_valid_pending_relay'};validateStored(o);return {ok:true,id:o.id,amount_raw:o.amount_raw,tx_hash:o.tx_hash,raw:o.raw};}
export async function fundOKX(m,book,{execute=false,verifiedDestination,statusReader=aaveStatus,readProvider=withAaveReadProvider,broadcast=broadcastAaveRaw}={}){
 let o=book.okx_funding;
 if(!execute)return {ok:true,revision:OKX_FUNDING.revision,policy:OKX_FUNDING,order:publicFunding(o),paid:false,tx_hash:o?.status==='confirmed'?o.tx_hash:null};
 if(o&&['confirmed','failed'].includes(o.status))return {ok:true,revision:OKX_FUNDING.revision,order:publicFunding(o),reused:true};
 if(book.aave?.paused)return {ok:false,error:'treasury_paused'};
 if(book.aave?.active_intent)return {ok:false,error:'aave_intent_pending_before_funding'};
 if(Object.values(book.anchors||{}).some(a=>a.raw&&!['anchored','transaction_failed'].includes(a.status)))return {ok:false,error:'anchor_pending_before_funding'};
 if(!o){
  const v=verifiedDestination;if(!v||v.account_hash!==OKX_FUNDING.account_hash||v.chain!==OKX_FUNDING.chain||v.address?.toLowerCase()!==OKX_FUNDING.address||v.asset?.toLowerCase()!==AAVE.usdc.toLowerCase()||v.canDep!==true||!Number.isFinite(v.checked_at)||Math.abs(Date.now()-v.checked_at)>60000)return {ok:false,error:'fresh_authenticated_OKX_destination_required'};
  const s=await statusReader(m,book);if(!s.ok||s.address?.toLowerCase()!==m.env.X402_RECEIVE_ADDRESS?.toLowerCase())return {ok:false,error:'treasury_state_unavailable'};
  if(BigInt(s.usdc_raw)-20000000n<cashFloorRaw(book))return {ok:false,error:'funding_cash_reserve'};
  o={id:OKX_FUNDING.id,amount_raw:OKX_FUNDING.amount_raw,destination:OKX_FUNDING.address,treasury:s.address,chain_id:8453,status:'reserved',tx_hash:null,at:new Date().toISOString(),destination_verified_at:new Date(v.checked_at).toISOString(),settlement_type:'same_owner_exchange_capital_transfer',investment_executed:false};book.okx_funding=o;await m.save(book);
 }
 try{
  const w=new Wallet(m.env.TREASURY_EXECUTOR_KEY);if(w.address.toLowerCase()!==o.treasury.toLowerCase())throw Error('funding_signer_mismatch');
  if(!o.raw){const prepared=await readProvider(async p=>{const data=erc.encodeFunctionData('transfer',[OKX_FUNDING.address,20000000n]),fees=await p.getFeeData(),gas=await p.estimateGas({from:w.address,to:AAVE.usdc,data}),fee=fees.maxFeePerGas||fees.gasPrice;if(!fee||gas*fee>20000000000000n||await p.getBalance(w.address)<gas*fee)throw Error('funding_gas_cap_or_missing');return w.connect(p).populateTransaction({to:AAVE.usdc,data,value:0n,gasLimit:gas,maxFeePerGas:fee,maxPriorityFeePerGas:fees.maxPriorityFeePerGas||0n});});o.raw=await w.signTransaction(prepared.value);o.tx_hash=keccak256(o.raw);o.status='signed_not_confirmed';await m.save(book);}
  validateStored(o);
  let read;try{read=await readProvider(async p=>({receipt:await p.getTransactionReceipt(o.tx_hash),head:await p.getBlockNumber()}));}catch{const sent=await broadcast(o.raw,o.tx_hash);o.status='pending';o.broadcast_attempts=sent.attempts;await m.save(book);return {ok:true,revision:OKX_FUNDING.revision,order:publicFunding(o)};}
  const {receipt,head}=read.value;
  if(!receipt){const sent=await broadcast(o.raw,o.tx_hash);o.status='pending';o.broadcast_attempts=sent.attempts;}
  else if(receipt.hash?.toLowerCase()!==o.tx_hash.toLowerCase())throw Error('funding_receipt_hash_mismatch');
  else if(receipt.status!==1)o.status='failed';
  else if(!fundingTransferProof(receipt,o))throw Error('funding_transfer_proof_mismatch');
  else if(head<receipt.blockNumber+2)o.status='pending_confirmations';
  else{o.status='confirmed';o.block_number=receipt.blockNumber;o.receipt_status=1;o.exchange_credit_verified=false;book.ledger||=[];if(!book.ledger.some(r=>r.type==='OKX_capital_transfer'&&r.order_id===o.id))book.ledger.push({type:'OKX_capital_transfer',order_id:o.id,amount_raw:o.amount_raw,currency:'Base_USDC',tx_hash:o.tx_hash,investment_executed:false,revenue:false,at:new Date().toISOString()});}
  await m.save(book);return {ok:true,revision:OKX_FUNDING.revision,order:publicFunding(o)};
 }catch(error){o.error=String(error.message).includes('funding_')?String(error.message).slice(0,80):'funding_transport_or_state_uncertain';await m.save(book);return {ok:false,error:o.error,order:publicFunding(o)};}
}
