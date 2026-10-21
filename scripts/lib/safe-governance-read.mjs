export const SAFE='0x76379a52a9e82c259E5Db417104C65C26f9C58a3';
const selectors={owners:'0xa0e67e2b',threshold:'0xe75235b8',nonce:'0xaffed0e0'};
const word=hex=>{if(!/^0x[\da-fA-F]{64}$/.test(hex||''))throw Error('invalid_uint256');return BigInt(hex);};
export function decodeOwners(value){
 if(!/^0x[\da-fA-F]+$/.test(value||''))throw Error('invalid_owners');const h=value.slice(2);
 if(h.length<128||word('0x'+h.slice(0,64))!==32n)throw Error('invalid_owners_offset');
 const count=Number(word('0x'+h.slice(64,128)));if(!Number.isSafeInteger(count)||count<1||count>100||h.length!==128+64*count)throw Error('invalid_owners_length');
 const owners=[];for(let i=0;i<count;i++){const cell=h.slice(128+64*i,192+64*i);if(!/^0{24}[\da-fA-F]{40}$/.test(cell)||/^0+$/.test(cell))throw Error('invalid_owner_address');owners.push('0x'+cell.slice(24).toLowerCase());}
 if(new Set(owners).size!==owners.length)throw Error('duplicate_owner');return owners;
}
export async function readSafeGovernance({fetcher=fetch,rpcs=['https://ethereum-rpc.publicnode.com','https://ethereum.publicnode.com','https://eth.llamarpc.com']}={}){
 const observations=[];let id=0;
 for(const rpc of rpcs){
  const row={rpc,observed_at:new Date().toISOString()};observations.push(row);
  const call=async(method,params)=>{const r=await fetcher(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:AbortSignal.timeout(12000)});const d=await r.json();if(!r.ok||d.error||d.result==null)throw Error('rpc_read_failed');return d.result;};
  try{
   if(await call('eth_chainId',[])!=='0x1')throw Error('wrong_chain');
   const block=await call('eth_blockNumber',[]);if(!/^0x[\da-f]+$/i.test(block))throw Error('invalid_block');
   const values=await Promise.all(Object.entries(selectors).map(async([k,data])=>[k,await call('eth_call',[{to:SAFE,data},block])]));
   const d=Object.fromEntries(values),owners=decodeOwners(d.owners),threshold=Number(word(d.threshold));if(!Number.isSafeInteger(threshold)||threshold<1||threshold>owners.length)throw Error('invalid_threshold');
   Object.assign(row,{status:'verified_view_reads',block,owners,threshold,nonce:word(d.nonce).toString()});
  }catch{row.status='unverified_rpc_or_decode_failure';}
 }
 const valid=observations.filter(x=>x.status==='verified_view_reads'),identity=x=>JSON.stringify([x.owners.slice().sort(),x.threshold,x.nonce]),agree=valid.length>0&&valid.every(x=>identity(x)===identity(valid[0]));
 return {safe:SAFE,chain_id:1,observations,status:!valid.length?'unverified':!agree?'rpc_disagreement':valid.length>1?'consistent_across_rpc_endpoints':'single_endpoint_verified',current:agree?{owners:valid[0].owners,owner_count:valid[0].owners.length,threshold:valid[0].threshold,nonce:valid[0].nonce}:null,endpoint_count:valid.length,independent_provider_consensus_claimed:false,seat_owner_mapping_verified:false,private_key_control_verified:false,read_only:true,model_calls:0,transactions:0,signatures:0};
}
