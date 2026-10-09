import fs from 'node:fs';
import solc from 'solc';
import {Contract,ContractFactory,JsonRpcProvider,Wallet,id,parseUnits,Interface} from 'ethers';
const dir='knowledge/results/funding';fs.mkdirSync(dir,{recursive:true});
const stamp=process.env.GITHUB_RUN_ID||String(Date.now());
const record=(r)=>{fs.writeFileSync(`${dir}/${stamp}.json`,JSON.stringify({at:new Date().toISOString(),chainId:8453,...r},null,2)+'\n');console.log(r.status);};
const source=fs.readFileSync('invest-channel/contracts/OwnerAaveFunding.sol','utf8');
const build=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Funding.sol':{content:source}},settings:{evmVersion:'shanghai',optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
if(build.errors?.some(e=>e.severity==='error'))throw Error('Solidity compile failed');
const artifact=build.contracts['Funding.sol'].OwnerAaveFunding;
fs.writeFileSync(`${dir}/contract-artifact.json`,JSON.stringify(artifact,null,2));
const env=process.env;
const authorization=(router,executor)=>[
 {purpose:'Approve bounded aUSDC funding grant; revocable',chainId:8453,from:env.FUNDING_OWNER,to:'0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB',value:'0',data:new Interface(['function approve(address,uint256)']).encodeFunctionData('approve',[router,1000000000n])},
 {purpose:'Activate funding with 1000USDC total grant;100/200 hard caps',chainId:8453,from:env.FUNDING_OWNER,to:router,value:'0',data:new Interface(['function configure(bool,address,uint256)']).encodeFunctionData('configure',[false,executor,1000000000n])}
];
const missing=['FUNDING_OWNER','FUNDING_TREASURY','FUNDING_EXECUTOR_KEY'].filter(k=>!env[k]);
if(missing.length){record({status:'blocked_configuration',missing,compiled:true,deployed:false});process.exit(0);}
try{
 const provider=new JsonRpcProvider(env.LTZZZ_BASE_RPC||'https://mainnet.base.org');
 if((await provider.getNetwork()).chainId!==8453n)throw Error('Wrong network');
 const signer=new Wallet(env.FUNDING_EXECUTOR_KEY,provider);
 let address=env.FUNDING_ROUTER_ADDRESS;
 if(!address){
  // Do not redeploy after a receipt has committed, even if variables are not yet updated.
  const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json')&&f!=='contract-artifact.json');
  for(const file of files){const r=JSON.parse(fs.readFileSync(`${dir}/${file}`));if(r.status==='deployed_paused'&&r.owner.toLowerCase()===env.FUNDING_OWNER.toLowerCase()&&r.treasury.toLowerCase()===env.FUNDING_TREASURY.toLowerCase())address=r.router;}
 }
 if(!address){
  const deployed=await new ContractFactory(artifact.abi,artifact.evm.bytecode.object,signer).deploy(env.FUNDING_OWNER,env.FUNDING_TREASURY,'0xA238Dd80C259a72e81d7e4664a9801593F98d1c5','0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913','0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB',signer.address);
  const receipt=await deployed.deploymentTransaction().wait();if(receipt.status!==1)throw Error('Deployment reverted');
  record({status:'deployed_paused',owner:env.FUNDING_OWNER,treasury:env.FUNDING_TREASURY,router:await deployed.getAddress(),tx_hash:receipt.hash,block:receipt.blockNumber,deployed:true,owner_authorization:authorization(await deployed.getAddress(),signer.address),next:'Owner approve aUSDC and configure(false,executor,grant).'});process.exit(0);
 }
 const router=new Contract(address,artifact.abi,signer);
 if((await router.owner()).toLowerCase()!==env.FUNDING_OWNER.toLowerCase()||(await router.treasury()).toLowerCase()!==env.FUNDING_TREASURY.toLowerCase()||(await router.executor()).toLowerCase()!==signer.address.toLowerCase())throw Error('Identity mismatch');
 if(await router.paused()){record({status:'blocked_owner_activation',router:address,deployed:true,owner_authorization:authorization(address,signer.address)});process.exit(0);}
 const token=new Contract(await router.usdc(),['function balanceOf(address) view returns(uint256)'],provider);
 const balance=await token.balanceOf(env.FUNDING_TREASURY);
 const target=parseUnits('100',6); // Refill only a verified shortage, never blindly withdraw daily.
 if(balance>=target){record({status:'no_refill_needed',router:address,treasury_usdc_raw:String(balance)});process.exit(0);}
 const amount=target-balance;
 const day=BigInt(Math.floor(Date.now()/86400000));
 const left=200000000n-await router.dailyPulled(day);
 if(left<amount){record({status:'daily_limit_wait',router:address});process.exit(0);}
 const intent=id(`ltzzz-funding-v1:${address}:${day}:${await router.dailyPulled(day)}`);
 if(await router.usedIntent(intent)){record({status:'intent_already_executed',router:address,intent});process.exit(0);}
 await router.pull.staticCall(amount,intent);
 const tx=await router.pull(amount,intent);const receipt=await tx.wait();
 if(receipt.status!==1)throw Error('Funding reverted');
 const after=await token.balanceOf(env.FUNDING_TREASURY);
 record({status:'funded',router:address,amount_raw:String(amount),before_raw:String(balance),after_raw:String(after),tx_hash:receipt.hash,block:receipt.blockNumber,intent,principal_outstanding_raw:String(await router.principalOutstanding())});
}catch{record({status:'failed_chain_operation',deployed:null,note:'Inspect chain/configuration; no raw provider error or credential printed.'});process.exitCode=1;}
