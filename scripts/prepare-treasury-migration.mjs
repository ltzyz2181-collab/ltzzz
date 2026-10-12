import {JsonRpcProvider,FetchRequest,Contract,Interface,formatUnits} from 'ethers';
import {nativeRpcFetch} from '../wep3-aave.js';
import {mkdir,writeFile} from 'node:fs/promises';
const TREASURY='0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d';
const SAFE='0x76379a52a9e82c259E5Db417104C65C26f9C58a3';
const OLD='0x21F502f29294c50d9C37A30dc038D8D95eB97fdc';
const VAULT='0x872C322e886ccd3f2Bb63e0611a6d8c620D859Ab';
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const AUSDC='0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB';
const erc=new Interface(['function transfer(address,uint256) returns(bool)']);
const vabi=['function guardian() view returns(address)','function withdrawUSDC(uint256)','function skim()'];
async function rpc(url,id){const r=new FetchRequest(url);r.timeout=15000;r.getUrlFunc=nativeRpcFetch;const p=new JsonRpcProvider(r,id,{staticNetwork:true,batchMaxCount:1});if(BigInt(await p.send('eth_chainId',[]))!==BigInt(id))throw Error('chain_mismatch');return p;}
const out={created_at:new Date().toISOString(),treasury:TREASURY,executed:false,tx_hash:null,notes:['Unsigned proposals only. No private keys read; no transactions sent.','Ethereum transfers remain Ethereum assets; bridging is a separate operation.']};
try{
 const p=await rpc('https://ethereum-rpc.publicnode.com',1);
 const s=new Contract(SAFE,['function getOwners() view returns(address[])','function getThreshold() view returns(uint256)','function nonce() view returns(uint256)'],p);
 const [owners,threshold,nonce,eth]=await Promise.all([s.getOwners(),s.getThreshold(),s.nonce(),p.getBalance(SAFE)]);
 const tokens=[['USDT','0xdAC17F958D2ee523a2206206994597C13D831ec7',6],['USDC','0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',6]];
 const transactions=[],balances={ETH:formatUnits(eth,18)};
 for(const [symbol,address,decimals] of tokens){const amount=await new Contract(address,['function balanceOf(address) view returns(uint256)'],p).balanceOf(SAFE);balances[symbol]=formatUnits(amount,decimals);if(amount>0n)transactions.push({to:address,value:'0',data:erc.encodeFunctionData('transfer',[TREASURY,amount]),contractMethod:null,contractInputsValues:null});}
 if(eth>0n)transactions.push({to:TREASURY,value:eth.toString(),data:'0x',contractMethod:null,contractInputsValues:null});
 out.safe={chain_id:1,address:SAFE,owners:[...owners],threshold:Number(threshold),nonce:nonce.toString(),balances,signature_status:'missing',execution_gas_paid_by_executor:true};
 out.safe_builder={version:'1.0',chainId:'1',createdAt:Date.now(),meta:{name:'LTZZZ Safe to controlled treasury',description:'Owner-authorized recovery; re-read nonce and balances before signing.',txBuilderVersion:'1.18.0',createdFromSafeAddress:SAFE,createdFromOwnerAddress:''},transactions};
}catch(e){out.safe={status:'read_failed',error:e.message};}
try{
 const p=await rpc('https://base-rpc.publicnode.com',8453);
 const v=new Contract(VAULT,vabi,p),u=new Contract(USDC,['function balanceOf(address) view returns(uint256)'],p),a=new Contract(AUSDC,['function balanceOf(address) view returns(uint256)'],p);
 const [guardian,ausdc,held,oldcash,gas]=await Promise.all([v.guardian(),a.balanceOf(VAULT),u.balanceOf(VAULT),u.balanceOf(OLD),p.getBalance(OLD)]);
 if(guardian.toLowerCase()!==OLD.toLowerCase())throw Error('guardian_changed_reaudit_required');
 const vi=new Interface(vabi);
 out.legacy={chain_id:8453,guardian,vault:VAULT,balances:{vault_aUSDC:formatUnits(ausdc,6),vault_USDC:formatUnits(held,6),guardian_USDC:formatUnits(oldcash,6),guardian_ETH:formatUnits(gas,18)},status:'prepared_not_executed',sequential_calls:[
 {to:VAULT,value:'0',data:vi.encodeFunctionData('withdrawUSDC',[(1n<<256n)-1n]),requires:'guardian signature; withdraw all; wait status=1 and 3 confirmations'},
 {to:VAULT,value:'0',data:vi.encodeFunctionData('skim',[]),requires:'re-read exposure and Vault balance; skim to fixed old guardian'},
 {to:USDC,method:'transfer',args:[TREASURY,'RE_READ_GUARDIAN_USDC_BALANCE'],requires:'encode actual post-skim balance, never precomputed amount'},
 {to:TREASURY,value:'2000000000000000',data:'0x',requires:'optional 0.002 Base ETH gas; only if guardian has balance plus execution fee'}
 ],completion_requires:['all tx hashes and receipts status=1','fresh treasury USDC/ETH increases','old Vault aUSDC/cash checked for dust','old guardian balance checked; no new funds into old addresses']};
}catch(e){out.legacy={status:'read_failed',error:e.message};}
await mkdir('knowledge/results/migrations',{recursive:true});const path='knowledge/results/migrations/treasury-migration-20261012.json';await writeFile(path,JSON.stringify(out,null,2)+'\n');
if(out.safe_builder)await writeFile('knowledge/results/migrations/safe-to-treasury-builder-20261012.json',JSON.stringify(out.safe_builder,null,2)+'\n');
console.log(JSON.stringify({path,safe:out.safe,legacy:out.legacy,executed:false},null,2));
