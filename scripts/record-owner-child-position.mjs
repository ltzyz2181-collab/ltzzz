import fs from 'node:fs';
import {Interface,formatUnits} from 'ethers';
import {OWNER_CHILD as C} from '../wep3-owner-child-allocation.js';
import {BASE,readRpc} from './lib/owner-web3-preview.mjs';
import {runnerToken,wep3Request} from './lib/funded-invest-runtime.mjs';
const abi=new Interface(['function balanceOf(address) view returns(uint256)','function getUserAccountData(address) view returns(uint256,uint256,uint256,uint256,uint256,uint256)']);
const report={at:new Date().toISOString(),run_id:process.env.GITHUB_RUN_ID||null,round:C.round,address:C.beneficiary,chain_id:8453,read_only:true,model_calls:0,transactions_submitted:0,treasury_can_withdraw:false,observations:[]};
try{report.intent=await wep3Request('/market/aave/intent?id='+C.intent_id,{token:runnerToken()});}catch{report.intent_error='existing_child_intent_not_verified';}
const heads=await Promise.all(BASE.rpcs.map(async url=>{try{if(BigInt(await readRpc(url,'eth_chainId',[]))!==8453n)throw Error();return {url,head:BigInt(await readRpc(url,'eth_blockNumber',[]))};}catch{return null;}}));
const available=heads.filter(Boolean);
if(available.length>=2){const block=available.reduce((n,p)=>p.head<n?p.head:n,available[0].head),tag='0x'+block.toString(16);report.block_number=block.toString();
 const observations=await Promise.all(available.map(async({url})=>{try{const [balance,account]=await Promise.all([readRpc(url,'eth_call',[{to:C.ausdc,data:abi.encodeFunctionData('balanceOf',[C.beneficiary])},tag]),readRpc(url,'eth_call',[{to:C.pool,data:abi.encodeFunctionData('getUserAccountData',[C.beneficiary])},tag])]);const debt=abi.decodeFunctionResult('getUserAccountData',account)[1];return {provider:url,ausdc_raw:BigInt(balance).toString(),debt_base:debt.toString()};}catch{return null;}}));
 report.observations=observations.filter(Boolean);const first=report.observations[0];
 if(report.observations.length>=2&&report.observations.every(p=>p.ausdc_raw===first.ausdc_raw&&p.debt_base===first.debt_base)){report.ausdc=formatUnits(first.ausdc_raw,6);report.zero_Aave_debt=first.debt_base==='0';const proof=report.intent?.steps?.find(s=>s.kind==='supply')?.child_supply_proof;report.status=report.intent?.status==='confirmed'&&proof?.verified&&BigInt(first.ausdc_raw)>0n&&report.zero_Aave_debt?'confirmed_child_Aave_position':'chain_read_verified_completion_pending';}
 else report.status='blocked_RPC_disagreement_or_incomplete';
}else report.status='blocked_two_independent_RPC_required';
const path='knowledge/results/funded-invest/owner-child-position-'+(process.env.GITHUB_RUN_ID||'local')+'-attempt-'+(process.env.GITHUB_RUN_ATTEMPT||'1')+'.json';fs.mkdirSync('knowledge/results/funded-invest',{recursive:true});fs.writeFileSync(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({file:path,status:report.status,ausdc:report.ausdc,zero_Aave_debt:report.zero_Aave_debt}));if(report.status!=='confirmed_child_Aave_position')process.exitCode=1;
