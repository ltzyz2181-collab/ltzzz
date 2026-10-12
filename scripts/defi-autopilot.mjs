import fs from 'node:fs';
import {Contract,JsonRpcProvider,formatUnits,formatEther} from 'ethers';
const dir='knowledge/results/defi';fs.mkdirSync(dir,{recursive:true});
const file=`${dir}/${process.env.GITHUB_RUN_ID}.json`;const record={at:new Date().toISOString(),chainId:8453,amount_usdc:'1',hypothesis:'Weekly 1 USDC pilot; preserve original exposure after supply/redeem; other days read-only',exit_plan:'withdraw 1 USDC then skim to guardian immediately',transactions:[]};
function save(){fs.writeFileSync(file,JSON.stringify(record,null,2));}
const walletAddress='0x21F502f29294c50d9C37A30dc038D8D95eB97fdc';const vaultAddress='0x872C322e886ccd3f2Bb63e0611a6d8c620D859Ab';const usdcAddress='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';const aAddress='0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB';
let phase='read_chain';
try{
 const p=new JsonRpcProvider(process.env.LTZZZ_BASE_RPC||'https://mainnet.base.org');if((await p.getNetwork()).chainId!==8453n)throw Error('chain');
 const token=new Contract(usdcAddress,['function balanceOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)'],p);
 const a=new Contract(aAddress,['function balanceOf(address) view returns(uint256)'],p);
 const vault=new Contract(vaultAddress,['function guardian() view returns(address)','function usdc() view returns(address)','function aavePool() view returns(address)','function aToken() view returns(address)','function paused() view returns(bool)','function humanVetoed() view returns(bool)','function getExposure() view returns(uint256)','function depositUSDC(uint256)','function allocate(uint256,uint256)','function withdrawUSDC(uint256)','function skim()'],p);
 const block=await p.getBlockNumber();const overrides={blockTag:block};
 const before=await token.balanceOf(walletAddress,overrides);record.snapshot={block,wallet:walletAddress,usdc:formatUnits(before,6),eth:formatEther(await p.getBalance(walletAddress,block))};record.status="wallet_balance_verified";save();
 const reserve=await token.balanceOf(vaultAddress,overrides);const exposure=await vault.getExposure(overrides);
 record.snapshot={block,wallet:walletAddress,usdc:formatUnits(before,6),eth:formatEther(await p.getBalance(walletAddress,block)),vault_usdc:formatUnits(reserve,6),vault_ausdc:formatUnits(await a.balanceOf(vaultAddress,overrides),6),exposure_usdc:formatUnits(exposure,6)};record.status='balance_verified';save();
 record.status='quarantined_read_only';record.note='Compromised guardian; new funding and legacy signing disabled. No migration claimed.';save();p.destroy();
}catch{record.status='blocked_or_failed';record.phase=phase;record.note='See confirmed/submitted transaction evidence; no raw key-bearing RPC error printed.';save();process.exitCode=1;}
