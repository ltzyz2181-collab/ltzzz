import test from 'node:test';import assert from 'node:assert/strict';import {Interface} from 'ethers';import {amountRaw,buildAavePlan,budgetKeys,AAVE,executeAave,investmentLimits,autoAave,aaveStorageStatus,publicAaveIntent,withAaveReadProvider,AAVE_RPC_URLS} from '../../wep3-aave.js';
const address='0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d',input={intent_id:'AAVE_TEST_INTENT_123',action:'supply',amount_usdc:'1'};
const ctx={address,usdc_raw:'20000000',ausdc_raw:'0',allowance_raw:'0',cash_floor_raw:'5000000',day_raw:'0',week_raw:'0',month_raw:'0',first_supply_confirmed:false,exit_test_confirmed:false};
test('decimal integers and transaction injection fail closed',()=>{assert.equal(amountRaw('1.000001'),1000001n);for(const s of ['1e2','0','-1','1.0000001',1])assert.throws(()=>amountRaw(s));assert.throws(()=>buildAavePlan({...input,to:address},ctx));});
test('first1USDC approval exact, pool/asset/receiver fixed',()=>{const p=buildAavePlan(input,ctx);assert.equal(p.steps[0].to,AAVE.usdc);const a=new Interface(['function approve(address,uint256)']);assert.equal(a.decodeFunctionData('approve',p.steps[0].data)[1],1000000n);const pool=new Interface(['function supply(address,uint256,address,uint16)']);const args=pool.decodeFunctionData('supply',p.steps[1].data);assert.equal(args[0],AAVE.usdc);assert.equal(args[2],address);assert.equal(args[3],0n);});
test('first exit, cash reserve, exposure and each period cap enforced',()=>{assert.throws(()=>buildAavePlan({...input,amount_usdc:'20'},ctx),/first_supply/);assert.throws(()=>buildAavePlan({...input,amount_usdc:'2'},{...ctx,first_supply_confirmed:true}),/exit_test/);assert.throws(()=>buildAavePlan(input,{...ctx,usdc_raw:'5999999'}),/cash_reserve/);assert.throws(()=>buildAavePlan(input,{...ctx,ausdc_raw:'100000000'}),/exposure/);for(const [k,v] of [['day_raw','60000000'],['week_raw','300000000'],['month_raw','500000000']])assert.throws(()=>buildAavePlan(input,{...ctx,[k]:v}),/period_cap/);});
test('withdraw only own treasury and cannot borrow/withdraw other wallets',()=>{const i={...input,action:'withdraw'},p=buildAavePlan(i,{...ctx,ausdc_raw:'2000000'});const a=new Interface(['function withdraw(address,uint256,address)']);assert.equal(a.decodeFunctionData('withdraw',p.steps[0].data)[2],address);assert.throws(()=>buildAavePlan({...input,action:'borrow'},ctx));assert.throws(()=>buildAavePlan(i,ctx),/insufficient/);});
test('UTC budget keys use Monday week and calendar month',()=>{assert.deepEqual(budgetKeys(Date.parse('2026-10-12T09:00:00Z')),{day:'2026-10-12',week:'2026-10-12',month:'2026-10'});});

test('existing pending intent preview cannot sign, broadcast or access RPC',async()=>{const i={id:'AAVE_TEST_INTENT_123',action:'supply',amount_raw:'1000000',treasury:address,status:'pending',steps:[{kind:'approve',to:AAVE.usdc,raw:'private-signed-bytes',tx_hash:'0xabc',status:'submitted'}]};const book={aave:{intents:{[i.id]:i}}};const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('must not call network')};try{const r=await executeAave({env:{},save:()=>{throw Error('must not save')}},book,input,{preview:true});assert.equal(r.status,'preview_only');assert.equal(r.signed,false);assert.equal(r.already_signed_steps,true);assert.equal(JSON.stringify(r).includes('private-signed-bytes'),false);assert.equal(book.aave.failures,0);}finally{globalThis.fetch=original;}});

test('Worker RPC transport uses native fetch and preserves JSON body',async()=>{const {nativeRpcFetch}=await import('../../wep3-aave.js');const original=globalThis.fetch;try{globalThis.fetch=async(url,options)=>{assert.equal(url,'https://base-rpc.publicnode.com');assert.equal(options.method,'POST');assert.equal(new TextDecoder().decode(options.body),'{}');return new Response('{"result":"0x2105"}',{status:200,headers:{'content-type':'application/json'}});};const r=await nativeRpcFetch({url:'https://base-rpc.publicnode.com',method:'POST',headers:{},body:new TextEncoder().encode('{}')});assert.equal(r.statusCode,200);assert.equal(JSON.parse(new TextDecoder().decode(r.body)).result,'0x2105');}finally{globalThis.fetch=original;}});

test('post-exit limits follow actual equity and trusted reputation, not fixed20/100',()=>{const base={exit_test_confirmed:true,usdc_raw:'1000000000',ausdc_raw:'0',cash_floor_raw:'5000000',capital_reputation:160};const l=investmentLimits(base);assert.equal(l.exposure,845750000n);assert.equal(l.single,211437500n);assert.equal(investmentLimits({...base,capital_reputation:79}).single,0n);assert.ok(investmentLimits({...base,capital_reputation:100}).single<l.single);assert.equal(investmentLimits({...base,exit_test_confirmed:false}).single,20000000n);assert.equal(investmentLimits({...base,capital_reputation:NaN}).single,0n);assert.equal(amountRaw('200'),200000000n);});
test('failed exit cannot unlock larger pilot and spoofed score field cannot enter API',()=>{assert.throws(()=>buildAavePlan({...input,capital_reputation:200},ctx),/arbitrary/);const good={...ctx,first_supply_confirmed:true,exit_test_confirmed:true,capital_reputation:160,usdc_raw:'1000000000'};assert.doesNotThrow(()=>buildAavePlan({...input,amount_usdc:'200'},good));assert.throws(()=>buildAavePlan({...input,amount_usdc:'200'},{...good,exit_test_confirmed:false}),/exit_test/);});

const pending=()=>({id:input.intent_id,action:'supply',amount_raw:'1000000',treasury:address,status:'pending',steps:[{kind:'approve',raw:'signed-private-bytes',tx_hash:'0xabc',status:'submitted'}]});
const noEffects={env:{},save(){throw Error('must not save')}};
test('orphaned, malformed and terminal active pointers block auto and direct execution before effects',async()=>{
 const cases=[{active_intent:input.intent_id},{active_intent:input.intent_id,intents:{}},{active_intent:input.intent_id,intents:{[input.intent_id]:null}},{active_intent:input.intent_id,intents:{[input.intent_id]:{...pending(),steps:null}}},{active_intent:input.intent_id,intents:{[input.intent_id]:{...pending(),status:'confirmed'}}},{active_intent:{unexpected:true},intents:{}}];
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('must not access RPC')};
 try{for(const aave of cases){const b={aave},before=JSON.stringify(b);for(const run of [()=>autoAave(noEffects,b),()=>autoAave(noEffects,b,{preview:true}),()=>executeAave(noEffects,b,input)]){const r=await run();assert.equal(r.ok,false);assert.equal(r.status,'blocked_reconciliation');assert.equal(r.signed,false);assert.equal(JSON.stringify(b),before);}}}finally{globalThis.fetch=original;}
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
 await assert.rejects(withAaveReadProvider(async()=>{reads++;},url=>({async send(){return '0x1'},destroy(){destroyed.push(url)}})),e=>{assert.equal(e.message,'base_rpc_unavailable');assert.equal(e.rpc_attempts.length,3);return true;});
 assert.equal(reads,0);assert.deepEqual(destroyed,AAVE_RPC_URLS);
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
  const r=spawnSync(process.execPath,['--input-type=module','-e',mock],{cwd:dir,env:{...process.env,AAVE_ACTION:action,GITHUB_RUN_ID:'test',WEP3_RUNNER_TOKEN:'fixture'},encoding:'utf8'});
  assert.equal(r.status,exit,r.stderr);const report=JSON.parse(r.stdout.trim());assert.equal(report.on_chain_executed,false);assert.equal(report.tx_hash,null);assert.equal(report.service_verified,exit===0);if(exit===0)assert.equal(report.execution_blocked,true);
 }}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
