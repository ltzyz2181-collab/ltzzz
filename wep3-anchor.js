import {Wallet,JsonRpcProvider,keccak256} from 'ethers';
export async function anchorSnapshot(m,book,snapshot){
 book.anchors||={};const week=Math.floor(Date.now()/(7*86400000));
 if(!snapshot.receipts.length)return {ok:true,status:'no_live_receipts',on_chain:false,tx_hash:null};
 if(!m.env.TREASURY_EXECUTOR_KEY)return {ok:true,status:'treasury_signer_missing',on_chain:false,tx_hash:null};
 const p=new JsonRpcProvider('https://mainnet.base.org',8453,{staticNetwork:true});
 let item=book.anchors[week];
 try{
  if(BigInt(await p.send('eth_chainId',[]))!==8453n)return {ok:false,error:'wrong_chain'};
  const w=new Wallet(m.env.TREASURY_EXECUTOR_KEY,p);
  if(w.address.toLowerCase()!==String(m.env.X402_RECEIVE_ADDRESS).toLowerCase())return {ok:false,error:'treasury_key_mismatch'};
  if(item){
   const receipt=await p.getTransactionReceipt(item.tx_hash);
   if(receipt){item.status=receipt.status===1?'anchored':'transaction_failed';item.on_chain=receipt.status===1;await m.save(book);}
   else if(item.raw){await p.broadcastTransaction(item.raw).catch(()=>{});}
   const {raw,...visible}=item;return {ok:true,...visible,erc8004_registered:false};
  }
  if(await p.getBalance(w.address)===0n)return {ok:true,status:'treasury_eth_gas_missing',on_chain:false,tx_hash:null};
  const fees=await p.getFeeData(),data='0x'+snapshot.root,gas=await p.estimateGas({from:w.address,to:w.address,data}),fee=fees.maxFeePerGas||fees.gasPrice;
  if(!fee||gas*fee>20000000000000n)return {ok:true,status:'anchor_gas_cap',on_chain:false,tx_hash:null};
  if(await p.getBalance(w.address)<gas*fee)return {ok:true,status:'treasury_eth_gas_missing',on_chain:false,tx_hash:null};
  const tx=await w.populateTransaction({to:w.address,value:0n,data,gasLimit:gas,maxFeePerGas:fee,maxPriorityFeePerGas:fees.maxPriorityFeePerGas||0n}),raw=await w.signTransaction(tx);
  item={root:snapshot.root,receipt_count:snapshot.receipts.length,network:'eip155:8453',at:new Date().toISOString(),tx_hash:keccak256(raw),raw,status:'submitted',on_chain:false,anchor_method:'public_transaction_calldata_sha256'};
  book.anchors[week]=item;await m.save(book);await p.broadcastTransaction(raw);
  const {raw:hidden,...visible}=item;return {ok:true,...visible,erc8004_registered:false};
 }catch{return {ok:true,status:item?'submission_or_confirmation_pending':'anchor_rpc_or_gas_unavailable',on_chain:false,tx_hash:item?.tx_hash||null};}
}
