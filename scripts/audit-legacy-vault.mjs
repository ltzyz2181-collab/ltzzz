import fs from 'node:fs';
import {JsonRpcProvider,Contract,keccak256,formatUnits} from 'ethers';
import {simulationFailure,assessLegacyObservations} from './lib/legacy-vault-observation.mjs';
const vault='0x872C322e886ccd3f2Bb63e0611a6d8c620D859Ab';
const legacyAgent='0x21F502f29294c50d9C37A30dc038D8D95eB97fdc';
const out={schema_version:2,at:new Date().toISOString(),chain_id:8453,vault,transactions_submitted:0,model_calls:0,new_funding_allowed:false,source_bytecode_equivalence_verified:false,observations:[]};
out.address_match_semantics='An address match alone does not establish private-key disclosure. No credential disclosure is proven by this read-only audit.';
let pinnedBlock;
for(const url of ['https://mainnet.base.org','https://base-rpc.publicnode.com']){
  const p=new JsonRpcProvider(url,8453,{batchMaxCount:1});
  try{
    if(BigInt(await p.send('eth_chainId',[]))!==8453n)throw Error('wrong_chain');
    const block=pinnedBlock??await p.getBlockNumber(),opts={blockTag:block};pinnedBlock=block;
    const v=new Contract(vault,['function guardian() view returns(address)','function aToken() view returns(address)','function usdc() view returns(address)','function paused() view returns(bool)','function humanVetoed() view returns(bool)','function exposure() view returns(uint256)','function withdrawUSDC(uint256)','function executors(address) view returns(bool)'],p);
    const guardian=await v.guardian(opts),usdc=await v.usdc(opts),aToken=await v.aToken(opts);
    const bal=async address=>await new Contract(address,['function balanceOf(address) view returns(uint256)'],p).balanceOf(vault,opts);
    const row={rpc:url,block,guardian,guardian_matches_legacy_agent:guardian.toLowerCase()===legacyAgent.toLowerCase(),usdc,aToken,paused:await v.paused(opts),human_vetoed:await v.humanVetoed(opts),exposure_usdc:formatUnits(await v.exposure(opts),6),vault_usdc:formatUnits(await bal(usdc),6),vault_ausdc:formatUnits(await bal(aToken),6),bytecode_hash:keccak256(await p.getCode(vault,block)),executor_enumeration:'mapping is not enumerable; no claim of an empty executor set'};
    try{await v.withdrawUSDC.staticCall(1000000n,{...opts,from:guardian});row.guardian_withdraw_1usdc_simulation={outcome:'succeeded_no_transaction',permission_safety_proven:false};}catch(error){row.guardian_withdraw_1usdc_simulation=simulationFailure(error);}
    out.observations.push(row);
  }catch{out.observations.push({rpc:url,status:'read_failed'});}finally{p.destroy();}
}
Object.assign(out,assessLegacyObservations(out.observations));
fs.mkdirSync('knowledge/results/security',{recursive:true});
fs.writeFileSync(`knowledge/results/security/legacy-vault-${process.env.GITHUB_RUN_ID||'local'}-attempt-${process.env.GITHUB_RUN_ATTEMPT||'1'}.json`,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out));
