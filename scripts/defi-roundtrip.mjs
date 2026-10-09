import fs from 'node:fs';
import {Contract,JsonRpcProvider,Wallet,NonceManager,formatUnits,formatEther} from 'ethers';
const dir='knowledge/results/defi';fs.mkdirSync(dir,{recursive:true});
const file=`${dir}/${process.env.GITHUB_RUN_ID}.json`;const record={at:new Date().toISOString(),chainId:8453,amount_usdc:'1',hypothesis:'Deployed LTZZZ Vault can supply and redeem 1 USDC via Aave Base',exit_plan:'withdraw 1 USDC then skim to guardian immediately',transactions:[]};
function save(){fs.writeFileSync(file,JSON.stringify(record,null,2));}
const walletAddress='0x21F502f29294c50d9C37A30dc038D8D95eB97fdc';const vaultAddress='0x872C322e886ccd3f2Bb63e0611a6d8c620D859Ab';const usdcAddress='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';const aAddress='0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB';
let phase='read_chain';
try{
 const p=new JsonRpcProvider(process.env.LTZZZ_BASE_RPC||'https://mainnet.base.org');if((await p.getNetwork()).chainId!==8453n)throw Error('chain');
 const token=new Contract(usdcAddress,['function balanceOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)'],p);
 const a=new Contract(aAddress,['function balanceOf(address) view returns(uint256)'],p);
 const vault=new Contract(vaultAddress,['function guardian() view returns(address)','function usdc() view returns(address)','function aavePool() view returns(address)','function aToken() view returns(address)','function paused() view returns(bool)','function humanVetoed() view returns(bool)','function getExposure() view returns(uint256)','function depositUSDC(uint256)','function allocate(uint256,uint256)','function withdrawUSDC(uint256)','function skim()'],p);
 const block=await p.getBlockNumber();const overrides={blockTag:block};
 const before=await token.balanceOf(walletAddress,overrides);const reserve=await token.balanceOf(vaultAddress,overrides);const exposure=await vault.getExposure(overrides);
 record.snapshot={block,wallet:walletAddress,usdc:formatUnits(before,6),eth:formatEther(await p.getBalance(walletAddress,block)),vault_usdc:formatUnits(reserve,6),vault_ausdc:formatUnits(await a.balanceOf(vaultAddress,overrides),6),exposure_usdc:formatUnits(exposure,6)};record.status='balance_verified';save();
 phase='check_signer';const key=process.env.LTZZZ_WALLET_PRIVATE_KEY;if(!key){record.status='blocked_missing_wallet_secret';save();process.exit(0);}
 const signer=new Wallet(key,p);if(signer.address.toLowerCase()!==walletAddress.toLowerCase())throw Error('signer_address_mismatch');
 if((await vault.guardian()).toLowerCase()!==signer.address.toLowerCase()||(await vault.usdc()).toLowerCase()!==usdcAddress.toLowerCase()||(await vault.aavePool()).toLowerCase()!=='0xa238dd80c259a72e81d7e4664a9801593f98d1c5'||(await vault.aToken()).toLowerCase()!==aAddress.toLowerCase())throw Error('vault_identity_mismatch');
 if(await vault.paused()||await vault.humanVetoed()||reserve!==0n||before<6000000n||exposure+1000000n>100000000n)throw Error('balance_or_vault_gate');
 // Never repeat an incomplete run: a submitted transaction is evidence requiring reconciliation.
 const prior=fs.readdirSync(dir).filter(x=>x.endsWith('.json')&&x!==`${process.env.GITHUB_RUN_ID}.json`).map(x=>JSON.parse(fs.readFileSync(`${dir}/${x}`))).find(x=>x.transactions?.length);
 if(prior){record.status='blocked_existing_roundtrip_receipt';record.previous=prior.at;save();process.exit(0);}
 const managed=new NonceManager(signer);const writeToken=token.connect(managed),writeVault=vault.connect(managed);
 async function send(name,fn){phase=name;const tx=await fn();record.transactions.push({step:name,tx_hash:tx.hash,status:'submitted'});save();const receipt=await tx.wait(2);if(!receipt||receipt.status!==1)throw Error('tx_reverted');Object.assign(record.transactions.at(-1),{status:'confirmed',block:receipt.blockNumber,gas_used:String(receipt.gasUsed)});save();}
 await send('approve_1usdc',()=>writeToken.approve(vaultAddress,1000000n));
 await send('deposit_1usdc',()=>writeVault.depositUSDC(1000000n));
 await send('supply_1usdc',()=>writeVault.allocate(1n,1000000n));
 await send('withdraw_1usdc',()=>writeVault.withdrawUSDC(1000000n));
 if(await token.balanceOf(vaultAddress)!==1000000n)throw Error('withdraw_balance_mismatch');
 await send('return_to_guardian',()=>writeVault.skim());
 const after=await token.balanceOf(walletAddress);record.after={wallet_usdc:formatUnits(after,6),vault_usdc:formatUnits(await token.balanceOf(vaultAddress),6),exposure_usdc:formatUnits(await vault.getExposure(),6)};
 record.status=after===before&&(await token.balanceOf(vaultAddress))===0n&&(await vault.getExposure())===exposure?'verified_roundtrip':'balance_mismatch';save();
}catch{record.status='blocked_or_failed';record.phase=phase;record.note='See confirmed/submitted transaction evidence; no raw key-bearing RPC error printed.';save();process.exitCode=1;}
