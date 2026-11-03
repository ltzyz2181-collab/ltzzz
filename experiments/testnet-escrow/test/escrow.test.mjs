import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import ganache from 'ganache';import solc from 'solc';
import {BrowserProvider,ContractFactory,ZeroHash,id} from 'ethers';
const input={language:'Solidity',sources:Object.fromEntries(['TestnetTaskEscrow.sol','MockToken.sol'].map(f=>[f,{content:fs.readFileSync(new URL('../contracts/'+f,import.meta.url),'utf8')}])),settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}};
const output=JSON.parse(solc.compile(JSON.stringify(input),{import:p=>{try{return {contents:fs.readFileSync(new URL('../node_modules/'+p,import.meta.url),'utf8')};}catch{return {error:'dependency_not_found'};}}}));
assert.deepEqual((output.errors||[]).filter(v=>v.severity==='error'),[]);
const artifact=name=>output.contracts[name+'.sol'][name];
const TASK=id('PLAN-PATCHGATE-ESCROW-20261023:local-only'),DELIVERY=id('local-public-test-delivery');
async function fixture(t,chainId=31337){
 const rpc=ganache.provider({logging:{quiet:true},wallet:{totalAccounts:4},chain:{chainId,hardfork:'shanghai'}}),provider=new BrowserProvider(rpc);provider.pollingInterval=10;
 t.after(async()=>{provider.destroy();await rpc.disconnect();});
 const funder=await provider.getSigner(0),controller=await provider.getSigner(1),stranger=await provider.getSigner(2);
 const deploy=async(name,args=[])=>{const a=artifact(name),c=await new ContractFactory(a.abi,a.evm.bytecode.object,funder).deploy(...args);await c.waitForDeployment();return c;};
 const token=await deploy('MockToken');
 const escrow=chainId===31337?await deploy('TestnetTaskEscrow',[await token.getAddress(),await controller.getAddress(),await funder.getAddress()]):null;
 if(escrow)await (await token.approve(await escrow.getAddress(),100_000_000)).wait();
 const now=async()=>Number((await rpc.request({method:'eth_getBlockByNumber',params:['latest',false]})).timestamp);
 const create=async(order='order-1',amount=1_000_000,seconds=100)=>{const end=(await now())+seconds;const tx=await escrow.create(id(order),TASK,amount,end);const receipt=await tx.wait();assert.equal(receipt.status,1);return {key:id(order),end,receipt};};
 const advance=async seconds=>{await rpc.request({method:'evm_increaseTime',params:[seconds]});await rpc.request({method:'evm_mine',params:[]});};
 return {rpc,provider,funder,controller,stranger,token,escrow,deploy,now,create,advance};
}
test('real local EVM funding and controller release preserve exact balances and bind delivery',async t=>{
 const f=await fixture(t),{escrow,token,controller,funder}=f;const before=await token.balanceOf(await funder.getAddress());const o=await f.create();
 assert.equal(await token.balanceOf(await escrow.getAddress()),1_000_000n);assert.equal(await escrow.totalOpen(),1_000_000n);
 const receipt=await (await escrow.connect(controller).release(o.key,DELIVERY)).wait();assert.equal(receipt.status,1);
 assert.equal(await escrow.totalOpen(),0n);assert.equal(await token.balanceOf(await funder.getAddress()),before);
 const row=await escrow.escrows(o.key);assert.equal(row.state,2n);assert.equal(row.deliveryHash,DELIVERY);
 const log=receipt.logs.map(v=>{try{return escrow.interface.parseLog(v);}catch{return null;}}).find(v=>v?.name==='Released');assert.equal(log.args.beneficiary,await funder.getAddress());assert.equal(log.args.amount,1_000_000n);
 await assert.rejects(()=>escrow.connect(controller).release(o.key,DELIVERY));await assert.rejects(()=>f.create());
});
test('expired refund can be triggered by outsider while paused and only returns to fixed funder',async t=>{
 const f=await fixture(t),o=await f.create(),addr=await f.funder.getAddress(),before=await f.token.balanceOf(addr);
 await assert.rejects(()=>f.escrow.connect(f.stranger).refund(o.key));await (await f.escrow.connect(f.controller).setPaused(true)).wait();await f.advance(101);
 const receipt=await (await f.escrow.connect(f.stranger).refund(o.key,{gasLimit:200000})).wait();assert.equal(receipt.status,1);assert.equal((await f.escrow.escrows(o.key)).state,3n);
 assert.equal(await f.token.balanceOf(addr),before+1_000_000n);assert.equal(await f.escrow.totalOpen(),0n);assert.equal(await f.token.balanceOf(await f.stranger.getAddress()),0n);
 await assert.rejects(()=>f.escrow.connect(f.controller).release(o.key,DELIVERY));await assert.rejects(()=>f.escrow.refund(o.key));
});
test('outsider cannot create, release or pause; caller cannot change beneficiary',async t=>{
 const f=await fixture(t),o=await f.create();await assert.rejects(async()=>f.escrow.connect(f.stranger).create(id('attack'),TASK,1,(await f.now())+100));
 await assert.rejects(()=>f.escrow.connect(f.stranger).release(o.key,DELIVERY));await assert.rejects(()=>f.escrow.connect(f.stranger).setPaused(true));
 assert.equal(await f.escrow.funder(),await f.funder.getAddress());assert.equal(await f.escrow.totalOpen(),1_000_000n);
});
test('per-order and total-open fake-token caps reject excess without reserving balances',async t=>{
 const f=await fixture(t);await assert.rejects(()=>f.create('excess',1_000_001));await f.create('one');await f.create('two');await f.create('three');
 await assert.rejects(()=>f.create('four',1));assert.equal(await f.escrow.totalOpen(),3_000_000n);assert.equal(await f.token.balanceOf(await f.escrow.getAddress()),3_000_000n);
});
test('pause prevents new funding and release but does not confiscate or delete escrow',async t=>{
 const f=await fixture(t),o=await f.create();await (await f.escrow.connect(f.controller).setPaused(true)).wait();
 await assert.rejects(()=>f.create('two'));await assert.rejects(()=>f.escrow.connect(f.controller).release(o.key,DELIVERY));assert.equal((await f.escrow.escrows(o.key)).state,1n);
 await (await f.escrow.connect(f.controller).setPaused(false)).wait();await (await f.escrow.connect(f.controller).release(o.key,DELIVERY,{gasLimit:200000})).wait();assert.equal(await f.escrow.totalOpen(),0n);
});
test('empty hashes, unknown orders, invalid deadlines and release at exact timeout are refused',async t=>{
 const f=await fixture(t);await assert.rejects(async()=>f.escrow.create(ZeroHash,TASK,1,(await f.now())+100));await assert.rejects(async()=>f.escrow.create(id('empty'),ZeroHash,1,(await f.now())+100));
 await assert.rejects(()=>f.create('zero',0));await assert.rejects(()=>f.create('past',1,-1));await assert.rejects(()=>f.create('too-far',1,86401));
 await assert.rejects(()=>f.escrow.connect(f.controller).release(id('unknown'),DELIVERY));const o=await f.create();await assert.rejects(()=>f.escrow.connect(f.controller).release(o.key,ZeroHash));
 await f.advance(o.end-(await f.now()));await assert.rejects(()=>f.escrow.connect(f.controller).release(o.key,DELIVERY));await (await f.escrow.refund(o.key)).wait();assert.equal((await f.escrow.escrows(o.key)).state,3n);
});
test('fee-on-transfer funding is reverted atomically, including reservation and token balances',async t=>{
 const f=await fixture(t),before=await f.token.balanceOf(await f.funder.getAddress());await (await f.token.setShortTransfer(true)).wait();
 await assert.rejects(()=>f.create());assert.equal(await f.escrow.totalOpen(),0n);assert.equal((await f.escrow.escrows(id('order-1'))).state,0n);assert.equal(await f.token.balanceOf(await f.funder.getAddress()),before);
});
test('constructor rejects mainnet chain even with otherwise valid local addresses',async t=>{
 const f=await fixture(t,8453);await assert.rejects(async()=>f.deploy('TestnetTaskEscrow',[await f.token.getAddress(),await f.controller.getAddress(),await f.funder.getAddress()]));
});
test('only approved public testnet chain can be used besides the local EVM',async t=>{
 const f=await fixture(t,84532),escrow=await f.deploy('TestnetTaskEscrow',[await f.token.getAddress(),await f.controller.getAddress(),await f.funder.getAddress()]);assert.equal(await escrow.token(),await f.token.getAddress());
});
test('short outgoing transfer reverts release and refund atomically; order remains reserved',async t=>{
 const f=await fixture(t),o=await f.create();await (await f.token.setShortTransfer(true)).wait();
 await assert.rejects(()=>f.escrow.connect(f.controller).release(o.key,DELIVERY));assert.equal((await f.escrow.escrows(o.key)).state,1n);assert.equal(await f.escrow.totalOpen(),1_000_000n);
 await f.advance(101);await assert.rejects(()=>f.escrow.refund(o.key));assert.equal((await f.escrow.escrows(o.key)).state,1n);
 await (await f.token.setShortTransfer(false)).wait();await (await f.escrow.refund(o.key,{gasLimit:200000})).wait();assert.equal(await f.escrow.totalOpen(),0n);
});
