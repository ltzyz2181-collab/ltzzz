// Run in the owner's authenticated GitHub CLI session. Private keys only go to gh stdin.
import fs from 'node:fs';import {spawnSync} from 'node:child_process';
import {Wallet,JsonRpcProvider,Contract,getAddress,formatUnits} from 'ethers';
const repo='ltzyz2181-collab/ltzzz',ownerArg=process.argv[process.argv.indexOf('--owner')+1];
const gh=(args,input)=>{const r=spawnSync('gh',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});if(r.error||r.status!==0)throw Error('GitHub CLI operation failed; check logged-in repository administration access. No credential output copied.');return r.stdout;};
async function main(){
 if(!process.argv.includes('--owner')||!ownerArg)throw Error('Usage: node scripts/provision-funding-executor.mjs --owner PUBLIC_AAVE_WALLET_ADDRESS');
 const owner=getAddress(ownerArg),provider=new JsonRpcProvider(process.env.LTZZZ_BASE_RPC||'https://mainnet.base.org');
 if((await provider.getNetwork()).chainId!==8453n)throw Error('Base network required');
 const a=new Contract('0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB',['function balanceOf(address) view returns(uint256)','function POOL() view returns(address)','function UNDERLYING_ASSET_ADDRESS() view returns(address)'],provider);
 if((await a.POOL()).toLowerCase()!=='0xa238dd80c259a72e81d7e4664a9801593f98d1c5'||(await a.UNDERLYING_ASSET_ADDRESS()).toLowerCase()!=='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')throw Error('Aave reserve mismatch');
 const balance=await a.balanceOf(owner);if(balance===0n)throw Error('No Base aUSDC in this owner address. Check actual Aave network and asset; no keys generated.');
 const names=JSON.parse(gh(['secret','list','--repo',repo,'--json','name'])).map(x=>x.name);
 if(names.includes('FUNDING_EXECUTOR_KEY')||names.includes('LTZZZ_TREASURY_KEY'))throw Error('Funding keys already exist or provisioning is partial. Preserve them and verify public addresses; this helper will not overwrite keys.');
 const executor=Wallet.createRandom(),treasury=Wallet.createRandom();
 const receipt={at:new Date().toISOString(),chainId:8453,owner,owner_aUSDC:formatUnits(balance,6),treasury:treasury.address,executor:executor.address,secret_names:['FUNDING_EXECUTOR_KEY','LTZZZ_TREASURY_KEY'],secret_provisioned:false,onchain_deployed:false,tx_hash:null,next:'Fund executor Base ETH for gas, run funding workflow, then owner approve + configure from deployed receipt.'};
 fs.mkdirSync('knowledge/results/funding',{recursive:true});const file='knowledge/results/funding/provision-public.json';fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n');
 // Keys are never argv, console, public file or model input. No owner key is requested.
 gh(['secret','set','FUNDING_EXECUTOR_KEY','--repo',repo],executor.privateKey);
 gh(['secret','set','LTZZZ_TREASURY_KEY','--repo',repo],treasury.privateKey);
 gh(['variable','set','FUNDING_OWNER','--repo',repo,'--body',owner]);
 gh(['variable','set','FUNDING_TREASURY','--repo',repo,'--body',treasury.address]);
 receipt.secret_provisioned=true;fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
}
main().catch(()=>{console.error('BLOCKED: provisioning not completed. Verify CLI login/admin permission, Base aUSDC position, and existing secret names. Keep any public provisioning receipt; do not paste private keys into chat.');process.exitCode=1;});
