import {Transaction,Interface,keccak256} from 'ethers';
import {wep3Request,TREASURY} from './funded-invest-runtime.mjs';
const RPCS=['https://mainnet.base.org','https://base.drpc.org','https://base-rpc.publicnode.com','https://1rpc.io/base','https://base.llamarpc.com'];
const pool='0xa238dd80c259a72e81d7e4664a9801593f98d1c5',usdc='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const abi=new Interface(['function supply(address,uint256,address,uint16)','function approve(address,uint256)','function transfer(address,uint256)']);
export function validateRelay(r,{kind,intent_id,amount_raw}){
 const tx=Transaction.from(r.raw);if(tx.hash!==r.tx_hash||tx.chainId!==8453n||tx.from?.toLowerCase()!==TREASURY.toLowerCase()||tx.value!==0n||keccak256(r.raw)!==r.tx_hash)throw Error('relay_transaction_identity_mismatch');
 if(kind==='aave'){
  if(r.intent_id!==intent_id||r.amount_raw!==amount_raw)throw Error('relay_intent_mismatch');
  const data=r.step_kind==='supply'?abi.encodeFunctionData('supply',[usdc,BigInt(amount_raw),TREASURY,0]):r.step_kind==='approve'?abi.encodeFunctionData('approve',[pool,BigInt(amount_raw)]):null;
  if(!data||tx.to?.toLowerCase()!==(r.step_kind==='supply'?pool:usdc)||tx.data!==data)throw Error('relay_Aave_calldata_mismatch');
 }else if(kind==='okx'){
  if(r.id!=='OKX-FUND-20261017-001'||r.amount_raw!=='20000000'||tx.to?.toLowerCase()!==usdc||tx.data!==abi.encodeFunctionData('transfer',['0x217ba12313a5555b3bd6d4cf64893f74e8fba117',20000000n]))throw Error('relay_OKX_calldata_mismatch');
 }else throw Error('relay_kind_invalid');
 return tx.hash;
}
// The Cloudflare Worker remains the only signer. The authenticated relay exposes
// one validated, already persisted transaction to this process's memory only.
// Never log the raw envelope, request body, or a provider error that may echo it.
export async function relayPersisted({kind,intent_id,amount_raw,token,api=wep3Request,fetcher=fetch}){
 let r;try{r=await api(kind==='aave'?'/market/aave/relay':'/market/okx/funding-relay',{token,body:kind==='aave'?{intent_id}:{}});}catch{return {status:'relay_unavailable',signed:false};}
 if(!r.raw)return {status:'no_pending_signed_transaction',signed:false};
 const hash=validateRelay(r,{kind,intent_id,amount_raw}),attempts=[];
 for(const url of RPCS){
  const rpc=async(method,params)=>{const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),redirect:'error',signal:AbortSignal.timeout(10000)});const q=await response.json();if(!response.ok||q.error)throw Error('relay_rpc_failed');return q.result;};
  try{if(BigInt(await rpc('eth_chainId',[]))!==8453n)throw Error();let receipt;try{receipt=await rpc('eth_getTransactionReceipt',[hash]);}catch{};if(receipt?.transactionHash?.toLowerCase()===hash.toLowerCase()){attempts.push({url,receipt_observed:true});return {status:'receipt_observed_reconcile_on_worker',tx_hash:hash,attempts,signed:false};}const sent=await rpc('eth_sendRawTransaction',[r.raw]);if(sent?.toLowerCase()!==hash.toLowerCase())throw Error();attempts.push({url,submitted:true});return {status:'same_persisted_transaction_relayed',tx_hash:hash,attempts,signed:false};}catch{attempts.push({url,ok:false});}
 }
 return {status:'relay_transport_unknown_reconcile_same_hash',tx_hash:hash,attempts,signed:false};
}
