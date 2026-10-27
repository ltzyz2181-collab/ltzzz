import test from 'node:test';import assert from 'node:assert/strict';import {Interface,Wallet,keccak256} from 'ethers';import {amountRaw,buildAavePlan,budgetKeys,AAVE,executeAave,investmentLimits,autoAave,aaveStorageStatus,publicAaveIntent,withAaveReadProvider,AAVE_RPC_URLS,reconcileAaveTransactions,aaveStatus} from '../../wep3-aave.js';
const address='0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d',input={intent_id:'AAVE_TEST_INTENT_123',action:'supply',amount_usdc:'1'};
const ctx={address,usdc_raw:'20000000',ausdc_raw:'0',allowance_raw:'0',cash_floor_raw:'5000000',day_raw:'0',week_raw:'0',month_raw:'0',first_supply_confirmed:false,exit_test_confirmed:false};
test('decimal integers and transaction injection fail closed',()=>{assert.equal(amountRaw('1.000001'),1000001n);for(const s of ['1e2','0','-1','1.0000001',1])assert.throws(()=>amountRaw(s));assert.throws(()=>buildAavePlan({...input,to:address},ctx));});
test('first1USDC approval exact, pool/asset/receiver fixed',()=>{const p=buildAavePlan(input,ctx);assert.equal(p.steps[0].to,AAVE.usdc);const a=new Interface(['function approve(address,uint256)']);assert.equal(a.decodeFunctionData('approve',p.steps[0].data)[1],1000000n);const pool=new Interface(['function supply(address,uint256,address,uint16)']);const args=pool.decodeFunctionData('supply',p.steps[1].data);assert.equal(args[0],AAVE.usdc);assert.equal(args[2],address);assert.equal(args[3],0n);});
test('first exit, cash reserve, exposure and each period cap enforced',()=>{assert.throws(()=>buildAavePlan({...input,amount_usdc:'20'},ctx),/first_supply/);assert.throws(()=>buildAavePlan({...input,amount_usdc:'2'},{...ctx,first_supply_confirmed:true}),/exit_test/);assert.throws(()=>buildAavePlan(input,{...ctx,usdc_raw:'5999999'}),/cash_reserve/);assert.throws(()=>buildAavePlan(input,{...ctx,ausdc_raw:'100000000'}),/exposure/);for(const [k,v] of [['day_raw','60000000'],['week_raw','300000000'],['month_raw','500000000']])assert.throws(()=>buildAavePlan(input,{...ctx,[k]:v}),/period_cap/);});
test('withdraw only own treasury and cannot borrow/withdraw other wallets',()=>{const i={...input,action:'withdraw'},p=buildAavePlan(i,{...ctx,ausdc_raw:'2000000'});const a=new Interface(['function withdraw(address,uint256,address)']);assert.equal(a.decodeFunctionData('withdraw',p.steps[0].data)[2],address);assert.throws(()=>buildAavePlan({...input,action:'borrow'},ctx));assert.throws(()=>buildAavePlan(i,ctx),/insufficient/);});
test('UTC budget keys use Monday week and calendar month',()=>{assert.deepEqual(budgetKeys(Date.parse('2026-10-12T09:00:00Z')),{day:'2026-10-12',week:'2026-10-12',month:'2026-10'});});

test('existing pending intent preview cannot sign, broadcast or access RPC',async()=>{const i={id:'AAVE_TEST_INTENT_123',action:'supply',amount_raw:'1000000',treasury:address,status:'pending',steps:[{kind:'approve',to:AAVE.usdc,raw:'private-signed-bytes',tx_hash:'0xabc',status:'submitted'}]};const book={aave:{intents:{[i.id]:i}}};const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('must not call network')};try{const r=await executeAave({env:{},save:()=>{throw Error('must not save')}},book,input,{preview:true});assert.equal(r.status,'preview_only');assert.equal(r.signed,false);assert.equal(r.already_signed_steps,true);assert.equal(JSON.stringify(r).includes('private-signed-bytes'),false);assert.equal(book.aave.failures,0);}finally{globalThis.fetch=original;}});

test('Worker RPC transport only forwards explicit readonly JSON and preserves bytes',async()=>{const {nativeRpcFetch}=await import('../../wep3-aave.js');const original=globalThis.fetch;try{globalThis.fetch=async(url,options)=>{assert.equal(url,'https://base-rpc.publicnode.com');assert.equal(options.method,'POST');assert.equal(new TextDecoder().decode(options.body),'{"method":"eth_chainId"}');return new Response('{"result":"0x2105"}',{status:200,headers:{'content-type':'application/json'}});};const r=await nativeRpcFetch({url:'https://base-rpc.publicnode.com',method:'POST',headers:{},body:new TextEncoder().encode('{"method":"eth_chainId"}')});assert.equal(r.statusCode,200);assert.equal(JSON.parse(new TextDecoder().decode(r.body)).result,'0x2105');}finally{globalThis.fetch=original;}});

test('post-exit limits follow actual equity and trusted reputation, not fixed20/100',()=>{const base={exit_test_confirmed:true,usdc_raw:'1000000000',ausdc_raw:'0',cash_floor_raw:'5000000',capital_reputation:160};const l=investmentLimits(base);assert.equal(l.exposure,845750000n);assert.equal(l.single,211437500n);assert.equal(investmentLimits({...base,capital_reputation:79}).single,0n);assert.ok(investmentLimits({...base,capital_reputation:100}).single<l.single);assert.equal(investmentLimits({...base,exit_test_confirmed:false}).single,20000000n);assert.equal(investmentLimits({...base,capital_reputation:NaN}).single,0n);assert.equal(amountRaw('200'),200000000n);});
test('failed exit cannot unlock larger pilot and spoofed score field cannot enter API',()=>{assert.throws(()=>buildAavePlan({...input,capital_reputation:200},ctx),/arbitrary/);const good={...ctx,first_supply_confirmed:true,exit_test_confirmed:true,capital_reputation:160,usdc_raw:'1000000000'};assert.doesNotThrow(()=>buildAavePlan({...input,amount_usdc:'200'},good));assert.throws(()=>buildAavePlan({...input,amount_usdc:'200'},{...good,exit_test_confirmed:false}),/exit_test/);});

const pending=()=>({id:input.intent_id,action:'supply',amount_raw:'1000000',treasury:address,status:'pending',steps:[{kind:'approve',raw:'signed-private-bytes',tx_hash:'0xabc',status:'submitted'}]});
const noEffects={env:{},save(){throw Error('must not save')}};
test('orphaned string pointer is auto-cleared by auto; malformed/terminal pointers block before effects',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('must not access RPC')};
 const noSaveEffects={env:{},save(){}};
 try{
  for(const aave of [{active_intent:input.intent_id},{active_intent:input.intent_id,intents:{}}]){
   const b={aave},r=await autoAave(noSaveEffects,b);
   assert.equal(r.ok,true);assert.equal(r.status,'cleared_stale_active_intent');assert.equal(b.aave.active_intent,null);
  }
  for(const aave of [{active_intent:input.intent_id,intents:{[input.intent_id]:null}},{active_intent:input.intent_id,intents:{[input.intent_id]:{...pending(),steps:null}}},{active_intent:input.intent_id,intents:{[input.intent_id]:{...pending(),status:'confirmed'}}},{active_intent:{unexpected:true},intents:{}}]){
   const b={aave},before=JSON.stringify(b);
   for(const run of [()=>autoAave(noEffects,b),()=>autoAave(noEffects,b,{preview:true}),()=>executeAave(noEffects,b,input)]){
    const r=await run();assert.equal(r.ok,false);assert.equal(r.status,'blocked_reconciliation');assert.equal(r.signed,false);assert.equal(JSON.stringify(b),before);
   }
  }
 }finally{globalThis.fetch=original;}
});
test('auto preview resumes the exact existing intent and redacts signed transaction',async()=>{
 const i=pending(),b={aave:{active_intent:i.id,intents:{[i.id]:i}}};
 const r=await autoAave(noEffects,b,{preview:true});assert.equal(r.intent_id,i.id);assert.equal(r.status,'preview_only');assert.equal(r.already_signed_steps,true);assert.equal(r.signed,false);assert.equal(JSON.stringify(r).includes('signed-private-bytes'),false);assert.equal(b.aave.active_intent,i.id);
});
test('malformed public intent yields explicit reconciliation error instead of throwing',()=>{
 for(const i of [undefined,null,{},pending()&&{...pending(),amount_raw:'bad'}, {...pending(),steps:[null]}]){assert.equal(publicAaveIntent(i).status,'blocked_reconciliation');}
 assert.equal(aaveStorageStatus({}).status,'no_active_intent');
});
test('read RPC fails over a healthy chainId with failed balance reads and destroys every provider',async()=>{
 const visited=[],destroyed=[];
 const r=await withAaveReadProvider(async p=>{if(p.url===AAVE_RPC_URLS[0])throw Error('balance read failed');return 'verified balances';},url=>({url,async send(){visited.push(url);return '0x2105'},destroy(){destroyed.push(url)}}));
 assert.deepEqual(visited,AAVE_RPC_URLS.slice(0,2));assert.deepEqual(destroyed,visited);assert.equal(r.value,'verified balances');assert.equal(r.rpc_url,'https://base.drpc.org');assert.deepEqual(r.rpc_attempts.map(x=>x.ok),[false,true]);
});
test('read RPC rejects wrong chains and records total unavailability without leaking RPC errors',async()=>{
 let reads=0;const destroyed=[];
 await assert.rejects(withAaveReadProvider(async()=>{reads++;},url=>({async send(){return '0x1'},destroy(){destroyed.push(url)}})),e=>{assert.equal(e.message,'base_rpc_unavailable');assert.equal(e.rpc_attempts.length,AAVE_RPC_URLS.length);return true;});
 assert.equal(reads,0);assert.deepEqual(destroyed,AAVE_RPC_URLS);
});

test('HTTP 429 cannot consume twelve hidden retries per RPC and exhaust Worker subrequests',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('rate limited',{status:429});};
 try{await assert.rejects(withAaveReadProvider(async()=>{throw Error('must not read on rejected chain check')}));assert.equal(calls,AAVE_RPC_URLS.length);}
 finally{globalThis.fetch=original;}
});

test('runner distinguishes a verified reconciliation block from HTTP failures and never signs in preview',async()=>{
 const fs=await import('node:fs'),path=await import('node:path'),{spawnSync}=await import('node:child_process');
 fs.mkdirSync('work',{recursive:true});const dir=fs.mkdtempSync(path.resolve('work/aave-runner-test-')),script=path.resolve('scripts/run-treasury-aave.mjs');
 try{for(const [action,http,result,exit] of [
  ['auto-preview',422,{ok:false,status:'blocked_reconciliation',error:'orphaned_active_intent_requires_reconciliation',signed:false},0],
  ['auto-preview',500,{ok:false,error:'market_exception'},1],
  ['auto-preview',401,{ok:false,error:'pin_required'},1],
  ['diagnose',200,{ok:true,status:'diagnostic_only',storage:{ok:false},signed:false},0],
  ['status',200,{ok:false,error:'base_rpc_read_failed'},1],
  ['auto',200,{ok:false,error:'another_intent_pending'},1]
 ]){
  const mock=`globalThis.fetch=async()=>new Response(${JSON.stringify(JSON.stringify(result))},{status:${http}});await import(${JSON.stringify('file://'+script)});`;
  const r=spawnSync(process.execPath,['--input-type=module','-e',mock],{cwd:dir,env:{...process.env,AAVE_ACTION:action,AAVE_EXPECTED_REVISION:'',GITHUB_RUN_ID:'test',WEP3_RUNNER_TOKEN:'fixture'},encoding:'utf8'});
  assert.equal(r.status,exit,r.stderr);const report=JSON.parse(r.stdout.trim());assert.equal(report.on_chain_executed,false);assert.equal(report.tx_hash,null);assert.equal(report.service_verified,exit===0);if(exit===0)assert.equal(report.execution_blocked,true);
 }}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('signed intent reconciliation reads existing hash without signing, clearing, or assuming absent means never broadcast',async()=>{
 const wallet=Wallet.createRandom(),data=new Interface(['function approve(address,uint256)']).encodeFunctionData('approve',[AAVE.pool,1000000n]);
 const raw=await wallet.signTransaction({chainId:8453,to:AAVE.usdc,data,nonce:0,gasLimit:60000,maxFeePerGas:1000000n,maxPriorityFeePerGas:1n,value:0n,type:2});
 const i={...pending(),treasury:wallet.address,steps:[{kind:'approve',raw,tx_hash:keccak256(raw),status:'signed_not_confirmed'}]},b={aave:{active_intent:i.id,intents:{[i.id]:i}}},before=JSON.stringify(b),calls=[];
 const original=globalThis.fetch;globalThis.fetch=async(url,o)=>{const q=JSON.parse(new TextDecoder().decode(o.body));calls.push(q.method);let result;
  if(q.method==='eth_chainId')result='0x2105';else if(q.method==='eth_blockNumber')result='0x3212345';else if(q.method==='eth_getTransactionCount')result='0x0';else if(['eth_getTransactionReceipt','eth_getTransactionByHash'].includes(q.method))result=null;else throw Error('unexpected effect '+q.method);
  return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result}),{headers:{'content-type':'application/json'}});
 };
 try{const r=await reconcileAaveTransactions(noEffects,b);assert.equal(r.ok,true);assert.equal(r.transactions[0].tx_hash,i.steps[0].tx_hash);assert.equal(r.transactions[0].chain_status,'not_found_on_checked_rpc');assert.equal(r.broadcast_history_unknown,true);assert.equal(r.signed,false);assert.equal(r.on_chain_executed,false);assert.equal(JSON.stringify(r).includes(raw),false);assert.equal(JSON.stringify(b),before);assert.equal(calls.some(x=>/sendRaw|sendTransaction/.test(x)),false);}finally{globalThis.fetch=original;}
});
test('mismatched stored signed bytes block reconciliation before RPC',async()=>{
 const i=pending(),b={aave:{active_intent:i.id,intents:{[i.id]:i}}};const r=await reconcileAaveTransactions(noEffects,b);assert.equal(r.error,'stored_transaction_mismatch');assert.equal(r.signed,false);
});
test('full status transport verifies reserve and reads all balances at one block',async()=>{
 const erc=new Interface(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function decimals() view returns(uint8)']),at=new Interface(['function POOL() view returns(address)','function UNDERLYING_ASSET_ADDRESS() view returns(address)']);
 const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,o)=>{const q=JSON.parse(new TextDecoder().decode(o.body));calls.push(q);let result;
  if(q.method==='eth_chainId')result='0x2105';else if(q.method==='eth_blockNumber')result='0x3212345';else if(q.method==='eth_getBalance')result='0x71afd498d0000';else if(q.method==='eth_call'){
   const t=q.params[0],sel=t.data.slice(0,10);
   if(sel===erc.getFunction('balanceOf').selector)result=erc.encodeFunctionResult('balanceOf',[t.to.toLowerCase()===AAVE.usdc.toLowerCase()?50000000n:0n]);
   else if(sel===erc.getFunction('allowance').selector)result=erc.encodeFunctionResult('allowance',[0n]);
   else if(sel===erc.getFunction('decimals').selector)result=erc.encodeFunctionResult('decimals',[6]);
   else if(sel===at.getFunction('POOL').selector)result=at.encodeFunctionResult('POOL',[AAVE.pool]);
   else if(sel===at.getFunction('UNDERLYING_ASSET_ADDRESS').selector)result=at.encodeFunctionResult('UNDERLYING_ASSET_ADDRESS',[AAVE.usdc]);
  }
  if(result===undefined)throw Error('unexpected RPC');return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result}),{headers:{'content-type':'application/json'}});
 };
 try{const r=await aaveStatus({env:{X402_RECEIVE_ADDRESS:address},score:async()=>100},{});assert.equal(r.ok,true);assert.equal(r.usdc_raw,'50000000');assert.equal(r.block_number,52503365);for(const c of calls.filter(x=>['eth_call','eth_getBalance'].includes(x.method)))assert.equal(c.params[1],'0x3212345');}finally{globalThis.fetch=original;}
});

test('deployment runner waits for the expected Worker revision rather than accepting a stale successful response',async()=>{
 const fs=await import('node:fs'),path=await import('node:path'),{spawnSync}=await import('node:child_process');fs.mkdirSync('work',{recursive:true});const dir=fs.mkdtempSync(path.resolve('work/aave-revision-test-')),script=path.resolve('scripts/run-treasury-aave.mjs');
 try{const mock=`let calls=0;globalThis.setTimeout=fn=>{fn();return 0};globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,status:'diagnostic_only',storage:{ok:false},signed:false,aave_runtime_revision:++calls<3?'old':'aave-guard-v4'}));await import(${JSON.stringify('file://'+script)});`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',mock],{cwd:dir,env:{...process.env,AAVE_ACTION:'diagnose',AAVE_EXPECTED_REVISION:'aave-guard-v4',GITHUB_RUN_ID:'test'},encoding:'utf8'});assert.equal(r.status,0,r.stderr);const report=JSON.parse(r.stdout.trim());assert.equal(report.result.aave_runtime_revision,'aave-guard-v4');assert.equal(report.service_verified,true);assert.equal(report.status,undefined);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('read-only runner retains HTTP metadata when an edge HTML page cannot be parsed as JSON',async()=>{
 const fs=await import('node:fs'),path=await import('node:path'),{spawnSync}=await import('node:child_process');fs.mkdirSync('work',{recursive:true});const dir=fs.mkdtempSync(path.resolve('work/aave-html-test-')),script=path.resolve('scripts/run-treasury-aave.mjs');
 try{const mock=`globalThis.fetch=async()=>new Response('<!DOCTYPE html>private fixture',{status:503,headers:{'content-type':'text/html'}});await import(${JSON.stringify('file://'+script)});`;
 const run=spawnSync(process.execPath,['--input-type=module','-e',mock],{cwd:dir,env:{...process.env,AAVE_ACTION:'diagnose',AAVE_EXPECTED_REVISION:'',GITHUB_RUN_ID:'fixture'},encoding:'utf8'});
 assert.equal(run.status,1,run.stderr);const report=JSON.parse(run.stdout.trim());assert.equal(report.http,503);assert.equal(report.status,'non_json_service_response');assert.equal(report.content_type,'text/html');assert.equal(report.on_chain_executed,false);assert.equal(run.stdout.includes('private fixture'),false);
 assert.ok(fs.existsSync(path.join(dir,'knowledge/results/wep3/aave-diagnose-fixture.json')));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('a read-only rerun writes an attempt-specific receipt without overwriting its failed first attempt',async()=>{
 const fs=await import('node:fs'),path=await import('node:path'),{spawnSync}=await import('node:child_process');fs.mkdirSync('work',{recursive:true});const dir=fs.mkdtempSync(path.resolve('work/aave-attempt-test-')),script=path.resolve('scripts/run-treasury-aave.mjs');
 try{const receipts=path.join(dir,'knowledge/results/wep3');fs.mkdirSync(receipts,{recursive:true});const prior=path.join(receipts,'aave-diagnose-fixture.json');fs.writeFileSync(prior,'first failed observation');
 const mock=`globalThis.fetch=async()=>Response.json({ok:true,status:'diagnostic_only',storage:{ok:true}});await import(${JSON.stringify('file://'+script)});`;
 const run=spawnSync(process.execPath,['--input-type=module','-e',mock],{cwd:dir,env:{...process.env,AAVE_ACTION:'diagnose',AAVE_EXPECTED_REVISION:'',GITHUB_RUN_ID:'fixture',GITHUB_RUN_ATTEMPT:'2'},encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);assert.equal(fs.readFileSync(prior,'utf8'),'first failed observation');const receipt=JSON.parse(fs.readFileSync(path.join(receipts,'aave-diagnose-fixture-attempt-2.json'),'utf8'));assert.equal(receipt.service_verified,true);assert.equal(receipt.run_attempt,'2');assert.equal(receipt.on_chain_executed,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('closed RPC transport preserves unknown raw bytes without rebroadcast or replacement signing',async()=>{
 const wallet=Wallet.createRandom(),plan=buildAavePlan(input,{...ctx,address:wallet.address}),raw=await wallet.signTransaction({chainId:8453,to:plan.steps[0].to,data:plan.steps[0].data,nonce:0,gasLimit:60000,maxFeePerGas:1000000n,maxPriorityFeePerGas:1n,value:0n,type:2}),hash=keccak256(raw),keys=budgetKeys(Date.now());
 const i={...pending(),treasury:wallet.address,status:'prepared',keys,steps:plan.steps};Object.assign(i.steps[0],{raw,tx_hash:hash,status:'signed_not_confirmed'});
 const b={aave:{active_intent:i.id,intents:{[i.id]:i},principal_raw:'0',periods:Object.fromEntries(['day','week','month'].map(k=>[k,{[keys[k]]:'1000000'}]))}},broadcasts=[];let saved=0;
 const original=globalThis.fetch,sign=Wallet.prototype.signTransaction;Wallet.prototype.signTransaction=async()=>{throw Error('must not sign a replacement')};
 globalThis.fetch=async(url,o)=>{const q=JSON.parse(new TextDecoder().decode(o.body));let result,error;
  if(q.method==='eth_chainId')result='0x2105';else if(q.method==='eth_blockNumber')result='0x3212345';else if(q.method==='eth_getTransactionReceipt')result=null;
  else if(q.method==='eth_sendRawTransaction'){broadcasts.push(q.params[0]);if(url===AAVE_RPC_URLS[0])error={code:-32005,message:'rate limited'};else result=hash;}else throw Error('unexpected RPC '+q.method);
  return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,...(error?{error}:{result})}),{headers:{'content-type':'application/json'}});
 };
 try{const m={env:{TREASURY_EXECUTOR_KEY:wallet.privateKey},save:async()=>{saved++;}};
  for(let n=0;n<2;n++){const r=await autoAave(m,b);assert.equal(r.ok,true);assert.equal(r.status,'pending');assert.equal(r.steps[0].status,'broadcast_unknown');assert.equal(r.steps[0].tx_hash,hash);assert.equal(r.steps[0].broadcast_attempts.length,AAVE_RPC_URLS.length);}
  assert.equal(broadcasts.length,0);assert.equal(i.steps[0].raw,raw);assert.equal(b.aave.active_intent,i.id);assert.equal(saved,2);assert.equal(Object.keys(b.aave.intents).length,1);
 }finally{globalThis.fetch=original;Wallet.prototype.signTransaction=sign;}
});
test('malformed persisted execution target blocks before signer, storage or RPC access',async()=>{
 const plan=buildAavePlan(input,ctx),i={...pending(),status:'prepared',steps:plan.steps,keys:budgetKeys(Date.now())};i.steps[0].to=address;const b={aave:{active_intent:i.id,intents:{[i.id]:i}}};const r=await autoAave(noEffects,b);assert.equal(r.error,'stored_execution_plan_mismatch');assert.equal(r.signed,false);
});

test('blocked receipt RPC and closed broadcast never submit persisted bytes or claim confirmation',async()=>{
 const wallet=Wallet.createRandom(),plan=buildAavePlan(input,{...ctx,address:wallet.address}),raw=await wallet.signTransaction({chainId:8453,to:plan.steps[0].to,data:plan.steps[0].data,nonce:0,gasLimit:60000,maxFeePerGas:1000000n,maxPriorityFeePerGas:1n,value:0n,type:2}),hash=keccak256(raw),keys=budgetKeys(Date.now());
 const i={...pending(),treasury:wallet.address,status:'prepared',keys,steps:plan.steps};Object.assign(i.steps[0],{raw,tx_hash:hash,status:'signed_not_confirmed'});const book={aave:{active_intent:i.id,intents:{[i.id]:i},periods:Object.fromEntries(['day','week','month'].map(k=>[k,{[keys[k]]:'1000000'}]))}},sent=[];
 const original=globalThis.fetch,sign=Wallet.prototype.signTransaction;Wallet.prototype.signTransaction=async()=>{throw Error('no replacement signature')};
 globalThis.fetch=async(url,o)=>{const q=JSON.parse(new TextDecoder().decode(o.body));if(q.method==='eth_getTransactionReceipt')return new Response('Forbidden',{status:403});if(q.method==='eth_sendRawTransaction')sent.push(q.params[0]);return Response.json({jsonrpc:'2.0',id:q.id,result:q.method==='eth_chainId'?'0x2105':q.method==='eth_blockNumber'?'0x3212345':hash});};
 try{const r=await executeAave({env:{TREASURY_EXECUTOR_KEY:wallet.privateKey},save:async()=>{}},book,{...input,amount_usdc:'1'});assert.equal(r.ok,true);assert.equal(r.status,'pending');assert.equal(r.confirmed,false);assert.equal(r.steps[0].tx_hash,hash);assert.deepEqual(sent,[]);assert.equal(i.steps[0].raw,raw);assert.equal(book.aave.active_intent,i.id);assert.equal(Object.keys(book.aave.intents).length,1);}finally{globalThis.fetch=original;Wallet.prototype.signTransaction=sign;}
});
