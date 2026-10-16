import test from 'node:test';import assert from 'node:assert/strict';import {Interface} from 'ethers';
import {BASE,readRpc,unsignedCandidate,inspectOwnerWallet} from '../lib/owner-web3-preview.mjs';
const profile={address:'0xb99c6751f443842f4987bb2017580405572df905',chain_id:8453,asset:'USDC',candidate_amount_usdc:'50'};
const values={balanceRaw:'50000000',ethRaw:'1000000000000000',allowanceRaw:'0',decimals:'6',code:'0x6001'};
test('50 USDC unsigned preview binds exact approval, official pool, native asset and owner recipient',()=>{
 const p=unsignedCandidate(profile,values);assert.equal(p.balance_usdc,'50.0');assert.equal(p.unsigned_transactions.length,2);assert.equal(p.unsigned_transactions[0].to,BASE.usdc);
 const token=new Interface(['function approve(address,uint256) returns (bool)']),pool=new Interface(['function supply(address,uint256,address,uint16)']);
 const approval=token.decodeFunctionData('approve',p.unsigned_transactions[0].data);assert.equal(approval[0],BASE.pool);assert.equal(approval[1],50000000n);
 const supply=pool.decodeFunctionData('supply',p.unsigned_transactions[1].data);assert.equal(supply[0],BASE.usdc);assert.equal(supply[1],50000000n);assert.equal(supply[2].toLowerCase(),profile.address);assert.equal(p.transactions_submitted,0);assert.equal(p.investment_selected,false);assert.equal(p.simulation_verified,false);
});
test('insufficient funds and missing gas remain explicit; profiles and metadata fail closed',()=>{
 const p=unsignedCandidate(profile,{...values,balanceRaw:'49999999',ethRaw:'0'});assert.equal(p.blockers.length,2);assert.equal(unsignedCandidate(profile,{...values,allowanceRaw:'50000000'}).unsigned_transactions.length,1);
 for(const change of [{chain_id:1},{asset:'AAVE'},{address:'0xb99c...'},{candidate_amount_usdc:'-1'},{candidate_amount_usdc:'NaN'}])assert.throws(()=>unsignedCandidate({...profile,...change},values));assert.throws(()=>unsignedCandidate(profile,{...values,decimals:'18'}));
});
test('RPC helper rejects every signing and broadcasting method before network access',async()=>{
 for(const method of ['eth_sendTransaction','eth_sendRawTransaction','eth_sign','personal_sign'])await assert.rejects(()=>readRpc(BASE.rpcs[0],method,[],{fetcher:()=>{throw Error('must not fetch')}}),/read_only_rpc/);
 await assert.rejects(()=>readRpc('https://attacker.invalid','eth_call',[]),/read_only_rpc/);
});
function network({disagree=false,wrongChain=false}={}){const seen=[];return {seen,fetcher:async(url,options)=>{
 const p=JSON.parse(options.body);seen.push({url,...p});let result;
 if(p.method==='eth_chainId')result=wrongChain?'0x1':'0x2105';else if(p.method==='eth_blockNumber')result=url===BASE.rpcs[0]?'0x101':'0x100';else if(p.method==='eth_getBalance')result='0x38d7ea4c68000';else if(p.method==='eth_getCode')result='0x6001';else if(p.method==='eth_call'){const selector=p.params[0].data.slice(0,10);result=selector==='0x313ce567'?'0x6':selector==='0x70a08231'?(disagree&&url===BASE.rpcs[0]?'0x1':'0x2faf080'):'0x0';}else throw Error('unexpected RPC');return Response.json({jsonrpc:'2.0',id:1,result});}};}
test('independent observations use one pinned block and no privileged method',async()=>{
 const n=network(),r=await inspectOwnerWallet(profile,n);assert.equal(r.status,'verified_readonly_unsigned_candidate');assert.equal(r.block_number,'256');assert.equal(r.transactions_submitted,0);assert.ok(n.seen.filter(x=>!['eth_chainId','eth_blockNumber'].includes(x.method)).every(x=>x.params.at(-1)==='0x100'));
});
test('wrong chain or disagreed RPC values never produce a verified preview',async()=>{for(const opts of [{wrongChain:true},{disagree:true}]){const r=await inspectOwnerWallet(profile,network(opts));assert.ok(r.status.startsWith('blocked_'));assert.equal(r.preview,undefined);assert.equal(r.transactions_submitted,0);}});
