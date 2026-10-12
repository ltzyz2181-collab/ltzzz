// Direct Base USDC receipt verification; this is not a standard x402 signed-payment facilitator.
export const BASE_USDC='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const excluded=new Set(['0x1893a134aa6ea22e8c08518b559e1706f4da0ef7','0x21f502f29294c50d9c37a30dc038d8d95eb97fdc']);
export function receiverReady(env){const a=String(env.X402_RECEIVE_ADDRESS||'').toLowerCase();return /^0x[a-f0-9]{40}$/.test(a)&&a!=='0x'+'0'.repeat(40)&&!excluded.has(a);}
export function liveReady(env){return env.X402_LIVE==='1'&&receiverReady(env);}
export async function verifyBaseTransfer(env,ch,txHash){
 if(!liveReady(env))return {ok:false,error:'live_receiver_not_ready'};
 if(ch.protocol!=='base-usdc-direct-v1'||String(ch.pay_to).toLowerCase()!==env.X402_RECEIVE_ADDRESS.toLowerCase())return {ok:false,error:'challenge_receiver_or_mode_mismatch'};
 const rpc=env.BASE_RPC_URL||'https://mainnet.base.org';
 async function call(method,params){const r=await fetch(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});const j=await r.json();if(!r.ok||j.error)throw Error('rpc_unavailable');return j.result;}
 try{
  if(BigInt(await call('eth_chainId',[]))!==8453n)return {ok:false,error:'wrong_chain'};
  const r=await call('eth_getTransactionReceipt',[txHash]);if(!r)return {ok:false,error:'transaction_not_found'};
  if(r.status!=='0x1'||String(r.transactionHash).toLowerCase()!==txHash.toLowerCase())return {ok:false,error:'transaction_failed_or_mismatched'};
  const height=BigInt(await call('eth_blockNumber',[]));if(height<BigInt(r.blockNumber)+2n)return {ok:false,error:'confirmations_pending'};
  const block=await call('eth_getBlockByNumber',[r.blockNumber,false]);
  if(!block||String(block.hash).toLowerCase()!==String(r.blockHash).toLowerCase())return {ok:false,error:'block_mismatch'};
  const ts=Number(BigInt(block.timestamp))*1000;
  if(ts<Date.parse(ch.created_at)-120000||ts>Date.parse(ch.expires_at))return {ok:false,error:'payment_outside_challenge_window'};
  const to=env.X402_RECEIVE_ADDRESS.toLowerCase(),amount=BigInt(ch.amount_cents)*10000n;
  const log=(r.logs||[]).find(l=>!l.removed&&l.address?.toLowerCase()===BASE_USDC&&l.topics?.length===3&&l.topics[0]?.toLowerCase()===TRANSFER&&l.topics[2]?.toLowerCase()==='0x'+to.slice(2).padStart(64,'0')&&/^0x[a-fA-F0-9]{64}$/.test(l.data||'')&&BigInt(l.data)===amount);
  if(!log)return {ok:false,error:'matching_usdc_transfer_missing'};
  return {ok:true,chain_id:8453,asset:BASE_USDC,receiver:to,amount_raw:amount.toString(),tx_hash:txHash.toLowerCase(),block_number:r.blockNumber,block_hash:r.blockHash,log_index:log.logIndex,confirmations:Number(height-BigInt(r.blockNumber)+1n)};
 }catch{return {ok:false,error:'rpc_unavailable'};}
}
