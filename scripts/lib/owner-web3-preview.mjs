import {Interface,parseUnits,formatUnits,isAddress} from 'ethers';
export const BASE={chainId:8453,usdc:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',pool:'0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',rpcs:['https://base-rpc.publicnode.com','https://mainnet.base.org','https://base.drpc.org']};
const token=new Interface(['function balanceOf(address) view returns (uint256)','function allowance(address,address) view returns (uint256)','function decimals() view returns (uint8)','function approve(address,uint256) returns (bool)']);
const pool=new Interface(['function supply(address,uint256,address,uint16)']);
const METHODS=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getBalance','eth_call','eth_getCode']);
export async function readRpc(url,method,params,{fetcher=fetch}={}){
 if(!BASE.rpcs.includes(url)||!METHODS.has(method))throw Error('read_only_rpc_required');
 const response=await fetcher(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)});
 const result=await response.json();if(!response.ok||result.error||result.result===undefined)throw Error('rpc_read_failed');return result.result;
}
export function unsignedCandidate(profile,{balanceRaw,ethRaw,allowanceRaw,decimals,code}){
 if(profile.chain_id!==BASE.chainId||!isAddress(profile.address)||profile.asset!=='USDC'||!/^\d+(?:\.\d{1,6})?$/.test(profile.candidate_amount_usdc))throw Error('invalid_public_wallet_profile');
 const amount=parseUnits(profile.candidate_amount_usdc,6);if(amount<=0n)throw Error('positive_amount_required');
 const balance=BigInt(balanceRaw),gas=BigInt(ethRaw),allowance=BigInt(allowanceRaw),blockers=[];
 if(BigInt(decimals)!==6n||!/^0x[\da-f]+$/i.test(code)||code==='0x0')throw Error('unexpected_protocol_or_asset');
 if(balance<amount)blockers.push('insufficient_Base_USDC_for_candidate');if(gas===0n)blockers.push('no_Base_ETH_for_wallet_gas');
 const unsigned=[];
 if(allowance<amount)unsigned.push({purpose:'exact_amount_approval_candidate',chainId:BASE.chainId,from:profile.address,to:BASE.usdc,value:'0x0',data:token.encodeFunctionData('approve',[BASE.pool,amount])});
 unsigned.push({purpose:'Aave_supply_candidate_not_selected_or_signed',chainId:BASE.chainId,from:profile.address,to:BASE.pool,value:'0x0',data:pool.encodeFunctionData('supply',[BASE.usdc,amount,profile.address,0])});
 return {address:profile.address,chain_id:BASE.chainId,balance_usdc:formatUnits(balance,6),eth_balance:formatUnits(gas,18),allowance_usdc:formatUnits(allowance,6),candidate_amount_usdc:profile.candidate_amount_usdc,blockers,unsigned_transactions:unsigned,gas_estimated:false,simulation_verified:false,protocol_source_equivalence_verified:false,investment_selected:false,signature_required_from:'owner_in_OKX_Web3_wallet',signatures_created:0,transactions_submitted:0,paid:false,tx_hash:null,warning:'Unsigned candidate only. Gas, live liquidity, protocol risk and owner choice remain to be checked; no existing treasury or investment limits changed.'};
}
export async function inspectOwnerWallet(profile,{fetcher=fetch}={}){
 // Validate the profile before any network access.
 if(profile.chain_id!==BASE.chainId||!isAddress(profile.address)||profile.asset!=='USDC'||!/^\d+(?:\.\d{1,6})?$/.test(profile.candidate_amount_usdc))throw Error('invalid_public_wallet_profile');
 const report={at:new Date().toISOString(),mode:'read_only_and_unsigned_preview',address:profile.address,chain_id:BASE.chainId,model_calls:0,signatures_created:0,transactions_submitted:0,paid:false,tx_hash:null,rpcs:[]};
 const heads=await Promise.all(BASE.rpcs.map(async url=>{try{const chain=await readRpc(url,'eth_chainId',[],{fetcher});if(BigInt(chain)!==8453n)throw Error('wrong_chain');const height=BigInt(await readRpc(url,'eth_blockNumber',[],{fetcher}));return {url,height};}catch{report.rpcs.push({url,status:'chain_or_head_unavailable'});return null;}}));
 const available=heads.filter(Boolean);if(available.length<2){report.status='blocked_two_independent_RPC_required';return report;}
 const block=available.reduce((a,b)=>a<b.height?a:b.height,available[0].height);report.block_number=block.toString();const tag='0x'+block.toString(16);
 const observations=await Promise.all(available.map(async({url})=>{try{
  const call=data=>readRpc(url,'eth_call',[{to:BASE.usdc,data},tag],{fetcher});
  const [balanceRaw,ethRaw,allowanceRaw,decimals,code]=await Promise.all([call(token.encodeFunctionData('balanceOf',[profile.address])),readRpc(url,'eth_getBalance',[profile.address,tag],{fetcher}),call(token.encodeFunctionData('allowance',[profile.address,BASE.pool])),call(token.encodeFunctionData('decimals',[])),readRpc(url,'eth_getCode',[BASE.pool,tag],{fetcher})]);
  const values={balanceRaw:BigInt(balanceRaw).toString(),ethRaw:BigInt(ethRaw).toString(),allowanceRaw:BigInt(allowanceRaw).toString(),decimals:BigInt(decimals).toString(),code};report.rpcs.push({url,status:'read_at_pinned_block'});return values;
 }catch{report.rpcs.push({url,status:'pinned_block_read_failed'});return null;}}));
 const values=observations.filter(Boolean);if(values.length<2||values.some(x=>JSON.stringify(x)!==JSON.stringify(values[0]))){report.status='blocked_RPC_disagreement_or_incomplete';return report;}
 report.preview=unsignedCandidate(profile,values[0]);report.status=report.preview.blockers.length?'verified_readonly_candidate_blocked':'verified_readonly_unsigned_candidate';return report;
}
