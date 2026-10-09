const fs=require('fs'),assert=require('node:assert/strict');
const solc=require('solc'),ganache=require('ganache');
const {BrowserProvider,ContractFactory,id}=require('ethers');
(async()=>{
const mock=`pragma solidity ^0.8.24;
contract Token { mapping(address=>uint) public balanceOf; mapping(address=>mapping(address=>uint)) public allowance; address public UNDERLYING_ASSET_ADDRESS; address public POOL;
function setup(address u,address p) external {UNDERLYING_ASSET_ADDRESS=u;POOL=p;}
function mint(address a,uint v) external {balanceOf[a]+=v;}
function approve(address s,uint v) external returns(bool){allowance[msg.sender][s]=v;return true;}
function transferFrom(address f,address t,uint v) external returns(bool){require(allowance[f][msg.sender]>=v&&balanceOf[f]>=v);allowance[f][msg.sender]-=v;balanceOf[f]-=v;balanceOf[t]+=v;return true;}}
contract Pool {Token public token;bool public fail;constructor(address u){token=Token(u);}function setFail(bool f)external{fail=f;}function withdraw(address,uint a,address t)external returns(uint){require(!fail);token.mint(t,a);return a;}}`;
const out=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Funding.sol':{content:fs.readFileSync('invest-channel/contracts/OwnerAaveFunding.sol','utf8')},'Mocks.sol':{content:mock}},settings:{evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
assert(!out.errors?.some(x=>x.severity==='error'));
const provider=new BrowserProvider(ganache.provider({chain:{chainId:8453},logging:{quiet:true}}));provider.pollingInterval=10;
const owner=await provider.getSigner(0),executor=await provider.getSigner(1),treasury=await provider.getSigner(2),stranger=await provider.getSigner(3);
const deploy=async(file,name,args=[])=>{const a=out.contracts[file][name];const c=await new ContractFactory(a.abi,a.evm.bytecode.object,owner).deploy(...args);await c.waitForDeployment();return c;};
const u=await deploy('Mocks.sol','Token'),a=await deploy('Mocks.sol','Token'),p=await deploy('Mocks.sol','Pool',[await u.getAddress()]);await(await a.setup(await u.getAddress(),await p.getAddress())).wait();
const r=await deploy('Funding.sol','OwnerAaveFunding',[await owner.getAddress(),await treasury.getAddress(),await p.getAddress(),await u.getAddress(),await a.getAddress(),await executor.getAddress()]);
await(await a.mint(await owner.getAddress(),1000000000)).wait();await(await a.approve(await r.getAddress(),1000000000)).wait();
await assert.rejects(r.connect(executor).pull.staticCall(1000000,id('paused')));
await(await r.configure(false,await executor.getAddress(),1000000000)).wait();
await assert.rejects(r.connect(stranger).pull.staticCall(1000000,id('stranger')));
await assert.rejects(r.connect(executor).pull.staticCall(100000001,id('over')));
await(await r.connect(executor).pull(100000000,id('first'))).wait();
await assert.rejects(r.connect(executor).pull.staticCall(1,id('first')));
await(await r.connect(executor).pull(100000000,id('second'))).wait();
await assert.rejects(r.connect(executor).pull.staticCall(1,id('third')));
assert.equal(await u.balanceOf(await treasury.getAddress()),200000000n);
await provider.send('evm_increaseTime',[86400]);await provider.send('evm_mine',[]);
await(await p.setFail(true)).wait();const ownerABefore=await a.balanceOf(await owner.getAddress());const principalBefore=await r.principalOutstanding();const failedTx=await r.connect(executor).pull(1000000,id('failure'),{gasLimit:500000});await assert.rejects(failedTx.wait());assert.equal(await r.usedIntent(id('failure')),false);assert.equal(await a.balanceOf(await owner.getAddress()),ownerABefore);assert.equal(await r.principalOutstanding(),principalBefore);
await(await p.setFail(false)).wait();await(await u.connect(treasury).approve(await r.getAddress(),50000000)).wait();await(await r.connect(treasury).returnPrincipal(50000000)).wait();assert.equal(await u.balanceOf(await owner.getAddress()),50000000n);assert.equal(await r.principalOutstanding(),150000000n);
await assert.rejects(r.connect(executor).acceptLoss.staticCall(1));await(await r.acceptLoss(1000000)).wait();assert.equal(await r.principalOutstanding(),149000000n);
await(await r.configure(true,await executor.getAddress(),0)).wait();await assert.rejects(r.connect(executor).pull.staticCall(1,id('stop')));
console.log('PASS: paused, identity,100/200 caps,replay,failed withdrawal atomicity,principal transfer,owner-only loss,pause');
process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
