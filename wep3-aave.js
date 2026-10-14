import {Wallet,JsonRpcProvider,FetchRequest,Contract,Interface,keccak256,formatUnits} from 'ethers';
export const AAVE={chain_id:8453,pool:'0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',usdc:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',ausdc:'0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB'};
const ERC=['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)','function decimals() view returns(uint8)'];
const AT=['function balanceOf(address) view returns(uint256)','function POOL() view returns(address)','function UNDERLYING_ASSET_ADDRESS() view returns(address)'];
const POOL=['function supply(address,uint256,address,uint16)','function withdraw(address,uint256,address) returns(uint256)'];
const erc=new Interface(ERC),pool=new Interface(POOL);
export function amountRaw(s){if(typeof s!=='string'||!/^\d{1,12}(?:\.\d{1,6})?$/.test(s))throw Error('decimal_amount_string_required');const [a,b='']=s.split('.');const raw=BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'));if(raw<=0n)throw Error('positive_USDC_amount_required');return raw;}
export function budgetKeys(now){const d=new Date(now),m=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));m.setUTCDate(m.getUTCDate()-((m.getUTCDay()+6)%7));return {day:d.toISOString().slice(0,10),week:m.toISOString().slice(0,10),month:d.toISOString().slice(0,7)};}
export function investmentLimits(ctx){
 if(!ctx.exit_test_confirmed)return {mode:'pilot_until_exit_test',reputation:Number.isFinite(Number(ctx.capital_reputation))?Math.max(0,Math.min(200,Math.floor(Number(ctx.capital_reputation)))):0,share_bps:0,single:20000000n,exposure:100000000n,day:60000000n,week:300000000n,month:500000000n};
 const score=Number.isFinite(Number(ctx.capital_reputation))?Math.max(0,Math.min(200,Math.floor(Number(ctx.capital_reputation)))):0;
 const bps=score<80?0:score<100?2000:score<120?4000:score<140?6000:score<160?7500:8500;
 const equity=BigInt(ctx.usdc_raw)+BigInt(ctx.ausdc_raw),floor=BigInt(ctx.cash_floor_raw||5000000);
 const free=equity>floor?equity-floor:0n,exposure=free*BigInt(bps)/10000n,single=exposure/4n;
 return {mode:'reputation_and_actual_equity',reputation:score,share_bps:bps,single,exposure,day:exposure,week:exposure*3n,month:exposure*5n};
}
export function buildAavePlan(input,ctx){
 if(Object.keys(input).some(k=>!['intent_id','action','amount_usdc'].includes(k)))throw Error('arbitrary_transaction_parameters_forbidden');
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(input.intent_id||'')||!['supply','withdraw'].includes(input.action))throw Error('invalid_intent');
 const amount=amountRaw(input.amount_usdc),address=ctx.address,limits=investmentLimits(ctx);
 if(input.action==='supply'){
  if(ctx.paused)throw Error('supply_paused');
  if(!ctx.first_supply_confirmed&&amount!==1000000n)throw Error('first_supply_must_be_1_USDC');
  if(ctx.first_supply_confirmed&&!ctx.exit_test_confirmed&&amount>1000000n)throw Error('first_exit_test_required');
  if(amount>limits.single)throw Error('single_reputation_limit');
  if(BigInt(ctx.ausdc_raw)+amount>limits.exposure)throw Error('exposure_reputation_limit');
  if(BigInt(ctx.usdc_raw)-amount<BigInt(ctx.cash_floor_raw))throw Error('hire_cash_reserve');
  if(BigInt(ctx.day_raw)+amount>limits.day||BigInt(ctx.week_raw)+amount>limits.week||BigInt(ctx.month_raw)+amount>limits.month)throw Error('period_cap');
  const steps=[];if(BigInt(ctx.allowance_raw)<amount)steps.push({kind:'approve',to:AAVE.usdc,data:erc.encodeFunctionData('approve',[AAVE.pool,amount])});
  steps.push({kind:'supply',to:AAVE.pool,data:pool.encodeFunctionData('supply',[AAVE.usdc,amount,address,0])});return {amount_raw:amount.toString(),steps};
 }
 if(BigInt(ctx.ausdc_raw)<amount)throw Error('insufficient_aUSDC');
 return {amount_raw:amount.toString(),steps:[{kind:'withdraw',to:AAVE.pool,data:pool.encodeFunctionData('withdraw',[AAVE.usdc,amount,address])}]};
}
export async function nativeRpcFetch(req){const response=await fetch(req.url,{method:req.method,headers:req.headers,body:req.body,signal:AbortSignal.timeout(12000)});return {statusCode:response.status,statusMessage:response.statusText,headers:Object.fromEntries(response.headers),body:new Uint8Array(await response.arrayBuffer())};}
// Official RPC first; retry the complete read, not just eth_chainId.
export const AAVE_RPC_URLS=['https://mainnet.base.org','https://base.drpc.org','https://base-rpc.publicnode.com'];
export async function withAaveReadProvider(read,makeProvider){
 const attempts=[];
 for(const url of AAVE_RPC_URLS){
  let p;
  try{
   if(makeProvider)p=makeProvider(url);
   else{const req=new FetchRequest(url);req.timeout=12000;req.getUrlFunc=nativeRpcFetch;p=new JsonRpcProvider(req,8453,{staticNetwork:true,batchMaxCount:1});}
   if(BigInt(await p.send('eth_chainId',[]))!==8453n)throw Error('wrong_chain');
   return {value:await read(p),rpc_url:url,rpc_attempts:[...attempts,{url,ok:true}]};
  }catch{attempts.push({url,ok:false});}
  finally{p?.destroy();}
 }
 const error=Error('base_rpc_unavailable');error.rpc_attempts=attempts;throw error;
}
async function provider(){
 // Execution is pinned to a chain-checked provider. Never retry a signing callback.
 for(const url of AAVE_RPC_URLS){const req=new FetchRequest(url);req.timeout=12000;req.getUrlFunc=nativeRpcFetch;const p=new JsonRpcProvider(req,8453,{staticNetwork:true,batchMaxCount:1});try{if(BigInt(await p.send('eth_chainId',[]))===8453n)return p;}catch{}p.destroy();}
 throw Error('base_rpc_unavailable');
}
const record=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
function intentIssue(i,id){
 if(!record(i)||i.id!==id||!/^[A-Za-z0-9_-]{16,100}$/.test(i.id||''))return 'invalid_intent_record';
 if(!['supply','withdraw'].includes(i.action)||typeof i.amount_raw!=='string'||!/^\d{1,18}$/.test(i.amount_raw)||BigInt(i.amount_raw)<=0n||!/^0x[a-fA-F0-9]{40}$/.test(i.treasury||''))return 'invalid_intent_record';
 if(!['prepared','pending','pending_confirmations','confirmed','failed'].includes(i.status)||!Array.isArray(i.steps)||!i.steps.length||i.steps.some(s=>!record(s)||!['approve','supply','withdraw'].includes(s.kind)))return 'invalid_intent_record';
 return null;
}
export function aaveStorageStatus(book){
 const state=book.aave;
 if(state!==undefined&&!record(state))return {ok:false,error:'invalid_aave_state_requires_reconciliation',status:'blocked_reconciliation',signed:false};
 const id=state?.active_intent;
 if(!id)return {ok:true,status:'no_active_intent',active_intent:null,signed:false};
 const visibleId=typeof id==='string'&&/^[A-Za-z0-9_-]{16,100}$/.test(id)?id:null;
 const blocked=error=>({ok:false,status:'blocked_reconciliation',error,active_intent:visibleId,prior_transaction_state:'unknown',signed:false});
 if(!visibleId)return blocked('invalid_active_intent_requires_reconciliation');
 if(!record(state.intents)||!Object.hasOwn(state.intents,id))return blocked('orphaned_active_intent_requires_reconciliation');
 const i=state.intents[id];
 if(intentIssue(i,id))return blocked('malformed_active_intent_requires_reconciliation');
 if(['confirmed','failed'].includes(i.status))return blocked('terminal_active_intent_requires_reconciliation');
 return {ok:true,status:'active_intent_pending',active_intent:id,intent_status:i.status,already_signed_steps:i.steps.some(s=>!!s.raw),signed:false};
}
export async function aaveStatus(m,book){try{return await readAaveStatus(m,book)}catch(e){return {ok:false,error:'base_rpc_read_failed',reason:'base_rpc_unavailable',rpc_attempts:e.rpc_attempts||[],signed:false};}}
async function readAaveStatus(m,book){
 const address=m.env.X402_RECEIVE_ADDRESS;if(!address)return {ok:false,error:'treasury_missing'};
 const chain=await withAaveReadProvider(async p=>{
  // Pin all balances/configuration to one block on the selected RPC.
  const block=await p.getBlockNumber(),u=new Contract(AAVE.usdc,ERC,p),a=new Contract(AAVE.ausdc,AT,p),opts={blockTag:block};
  const [usdc,ausdc,eth,allowance,ap,underlying,decimals]=await Promise.all([u.balanceOf(address,opts),a.balanceOf(address,opts),p.getBalance(address,block),u.allowance(address,AAVE.pool,opts),a.POOL(opts),a.UNDERLYING_ASSET_ADDRESS(opts),u.decimals(opts)]);
  if(ap.toLowerCase()!==AAVE.pool.toLowerCase()||underlying.toLowerCase()!==AAVE.usdc.toLowerCase()||Number(decimals)!==6)throw Error('reserve_configuration_mismatch');
  return {usdc,ausdc,eth,allowance,block};
 });
 const {usdc,ausdc,eth,allowance,block}=chain.value;
 const state=record(book.aave)?book.aave:{},principal=BigInt(state.principal_raw||0);
 const liabilities=BigInt((book.pool_available_cents||0)+(book.pool_reserved_cents||0)+Object.values(book.agent_credit_cents||{}).reduce((a,b)=>a+b,0))*10000n,floor=liabilities>5000000n?liabilities:5000000n;
 const reputation=typeof m.score==='function'?await m.score('DeepSeek'):0;
 const limits=investmentLimits({usdc_raw:usdc.toString(),ausdc_raw:ausdc.toString(),cash_floor_raw:floor.toString(),exit_test_confirmed:!!state.exit_test_confirmed,capital_reputation:reputation});
 return {ok:true,...AAVE,address,block_number:block,rpc_url:chain.rpc_url,rpc_attempts:chain.rpc_attempts,usdc_raw:usdc.toString(),ausdc_raw:ausdc.toString(),eth_raw:eth.toString(),allowance_raw:allowance.toString(),principal_raw:principal.toString(),interest_raw:(!state.first_supply_confirmed&&ausdc>0n)?null:(ausdc>principal?ausdc-principal:0n).toString(),principal_basis:state.first_supply_confirmed?'tracked_supply_receipts':ausdc>0n?'unverified':'no_position',first_supply_confirmed:!!state.first_supply_confirmed,exit_test_confirmed:!!state.exit_test_confirmed,paused:!!state.paused,active_intent:aaveStorageStatus(book).active_intent||null,storage_status:aaveStorageStatus(book),limit_policy:limits.mode,capital_agent:'DeepSeek',capital_reputation:limits.reputation,allocation_share_bps:limits.share_bps,single_cap_usdc:Number(formatUnits(limits.single,6)),exposure_cap_usdc:Number(formatUnits(limits.exposure,6)),cash_floor_raw:floor.toString(),withdraw_receiver:address,owner_return_enabled:false};
}
export async function diagnoseAave(m,book){
 const storage=aaveStorageStatus(book),balances=await aaveStatus(m,book);
 return {ok:balances.ok,status:'diagnostic_only',storage,balances,existing_intent_shape_valid:storage.ok&&storage.status==='active_intent_pending',signed:false,on_chain_executed:false};
}
export function publicAaveIntent(i){if(intentIssue(i,i?.id))return {ok:false,error:'malformed_intent_requires_reconciliation',status:'blocked_reconciliation',signed:false};return {intent_id:i.id,action:i.action,amount_usdc:formatUnits(i.amount_raw,6),status:i.status,chain_id:8453,treasury:i.treasury,steps:i.steps.map(({raw,data,...s})=>s),before:i.before||null,after:i.after||null,owner_return_executed:false};}
export async function executeAave(m,book,input,{preview=false}={}){
 const storage=aaveStorageStatus(book);if(!storage.ok)return storage;
 if(!record(input))return {ok:false,error:'invalid_intent'};
 if(Object.keys(input).some(k=>!['intent_id','action','amount_usdc'].includes(k)))return {ok:false,error:'arbitrary_transaction_parameters_forbidden'};
 book.aave||={principal_raw:'0',intents:{},periods:{day:{},week:{},month:{}},first_supply_confirmed:false,exit_test_confirmed:false,failures:0};
 const state=book.aave;state.intents||={};state.periods||={};for(const k of ['day','week','month'])state.periods[k]||={};state.failures=Number.isInteger(state.failures)?state.failures:0;state.principal_raw||='0';let i=Object.hasOwn(state.intents,input.intent_id)?state.intents[input.intent_id]:undefined;
 if(i&&intentIssue(i,input.intent_id))return {ok:false,error:'malformed_intent_requires_reconciliation',status:'blocked_reconciliation',signed:false};
 if(i&&state.active_intent&&state.active_intent!==input.intent_id)return {ok:false,error:'another_intent_pending',active_intent:state.active_intent,signed:false};
 if(preview&&i)return {ok:true,...publicAaveIntent(i),status:'preview_only',existing_status:i.status,signed:false,already_signed_steps:i.steps.some(s=>!!s.raw)};
 if(i){
  if(i.action!==input.action||i.amount_raw!==amountRaw(input.amount_usdc).toString())return {ok:false,error:'intent_input_mismatch'};
  if(['confirmed','failed'].includes(i.status))return {ok:i.status==='confirmed',...publicAaveIntent(i)};
 }else{
  if(state.active_intent)return {ok:false,error:'another_intent_pending',active_intent:state.active_intent};
  const status=await aaveStatus(m,book);if(!status.ok)return status;
  if(status.principal_basis==='unverified')return {ok:false,error:'untracked_position_requires_reconciliation'};
  const keys=budgetKeys(Date.now()),liabilities=BigInt((book.pool_available_cents||0)+(book.pool_reserved_cents||0)+Object.values(book.agent_credit_cents||{}).reduce((a,b)=>a+b,0))*10000n;
  const floor=liabilities>5000000n?liabilities:5000000n;
  const ctx={...status,cash_floor_raw:floor.toString(),day_raw:state.periods.day[keys.day]||'0',week_raw:state.periods.week[keys.week]||'0',month_raw:state.periods.month[keys.month]||'0'};
  let plan;try{plan=buildAavePlan(input,ctx)}catch(e){return {ok:false,error:e.message,status:'blocked_policy',balances:status};}
  if(preview)return {ok:true,status:'preview_only',chain_id:8453,treasury:status.address,plan,cash_floor_raw:floor.toString(),balances:status,signed:false};
  if(!m.env.TREASURY_EXECUTOR_KEY)return {ok:false,error:'treasury_signer_missing'};
  if(BigInt(status.eth_raw)===0n)return {ok:false,error:'treasury_eth_gas_missing',status:'blocked_configuration',signed:false};
  if(Object.keys(state.intents).length>=1000)return {ok:false,error:'intent_capacity'};
  i={id:input.intent_id,action:input.action,amount_raw:plan.amount_raw,treasury:status.address,before:status,steps:plan.steps,status:'prepared',created_at:new Date().toISOString(),keys};
  state.intents[i.id]=i;state.active_intent=i.id;
  if(i.action==='supply')for(const k of ['day','week','month'])state.periods[k][keys[k]]=(BigInt(state.periods[k][keys[k]]||0)+BigInt(i.amount_raw)).toString();
  await m.save(book);
 }
 const p=await provider();if(BigInt(await p.send('eth_chainId',[]))!==8453n)return {ok:false,error:'wrong_chain'};
 const w=new Wallet(m.env.TREASURY_EXECUTOR_KEY,p);if(w.address.toLowerCase()!==i.treasury.toLowerCase())return {ok:false,error:'treasury_signer_mismatch'};
 for(const step of i.steps){
  if(step.status==='confirmed')continue;
  if(!step.raw){
   if(i.action==='supply'&&state.paused)return {ok:false,error:'supply_paused',...publicAaveIntent(i)};
   if(step.kind==='supply'){
    const fresh=await aaveStatus(m,book);if(!fresh.ok)return fresh;const liabilities=BigInt((book.pool_available_cents||0)+(book.pool_reserved_cents||0)+Object.values(book.agent_credit_cents||{}).reduce((a,b)=>a+b,0))*10000n;
    const floor=liabilities>5000000n?liabilities:5000000n,amount=BigInt(i.amount_raw);
    const liveLimits=investmentLimits({...fresh,cash_floor_raw:floor.toString()});
    if(amount>liveLimits.single||BigInt(fresh.usdc_raw)-amount<floor||BigInt(fresh.ausdc_raw)+amount>liveLimits.exposure)return {ok:false,error:'latest_cash_or_exposure_limit',...publicAaveIntent(i)};
    const nowKeys=budgetKeys(Date.now()),limits={day:liveLimits.day,week:liveLimits.week,month:liveLimits.month};
    for(const k of ['day','week','month'])if(BigInt(state.periods[k][nowKeys[k]]||0)+(nowKeys[k]===i.keys[k]?0n:amount)>limits[k])return {ok:false,error:'execution_period_cap',...publicAaveIntent(i)};
    for(const k of ['day','week','month'])if(nowKeys[k]!==i.keys[k]){state.periods[k][i.keys[k]]=(BigInt(state.periods[k][i.keys[k]]||0)-amount).toString();state.periods[k][nowKeys[k]]=(BigInt(state.periods[k][nowKeys[k]]||0)+amount).toString();}i.keys=nowKeys;await m.save(book);
   }
   state.tx_times=(state.tx_times||[]).filter(t=>Date.now()-t<3600000);if(state.tx_times.length>=6)return {ok:false,error:'hourly_transaction_cap',...publicAaveIntent(i)};
   const fees=await p.getFeeData(),gas=await p.estimateGas({from:w.address,to:step.to,data:step.data}),fee=fees.maxFeePerGas||fees.gasPrice;
   if(!fee||gas*fee>20000000000000n)return {ok:false,error:'gas_cap',...publicAaveIntent(i)};
   if(await p.getBalance(w.address)<gas*fee)return {ok:false,error:'insufficient_eth_gas',...publicAaveIntent(i)};
   const tx=await w.populateTransaction({to:step.to,data:step.data,value:0n,gasLimit:gas,maxFeePerGas:fee,maxPriorityFeePerGas:fees.maxPriorityFeePerGas||0n});
   step.raw=await w.signTransaction(tx);step.tx_hash=keccak256(step.raw);step.status='signed_not_confirmed';state.tx_times.push(Date.now());await m.save(book);
  }
  const receipt=await p.getTransactionReceipt(step.tx_hash);
  if(!receipt){if(i.action==='supply'&&state.paused)return {ok:false,error:'paused_no_rebroadcast',...publicAaveIntent(i)};try{await p.broadcastTransaction(step.raw);step.status='submitted';}catch{step.status='broadcast_unknown';}i.status='pending';await m.save(book);return {ok:true,confirmed:false,...publicAaveIntent(i)};}
  if(receipt.status!==1){step.status='failed';i.status='failed';state.active_intent=null;state.failures++;if(state.failures>=3)state.paused=true;if(i.action==='supply')for(const k of ['day','week','month'])state.periods[k][i.keys[k]]=(BigInt(state.periods[k][i.keys[k]])-BigInt(i.amount_raw)).toString();await m.save(book);return {ok:false,...publicAaveIntent(i)};}
  if(await p.getBlockNumber()<receipt.blockNumber+2){i.status='pending_confirmations';await m.save(book);return {ok:true,confirmed:false,...publicAaveIntent(i)};}
  step.status='confirmed';step.block_number=receipt.blockNumber;step.receipt_status=1;step.confirmed_at=new Date().toISOString();await m.save(book);
 }
 i.status='confirmed';state.active_intent=null;state.failures=0;
 if(i.action==='supply'){state.principal_raw=(BigInt(state.principal_raw)+BigInt(i.amount_raw)).toString();state.first_supply_confirmed=true;}
 else{state.principal_raw=(BigInt(state.principal_raw)>BigInt(i.amount_raw)?BigInt(state.principal_raw)-BigInt(i.amount_raw):0n).toString();if(state.first_supply_confirmed&&(BigInt(i.amount_raw)>=1000000n||(BigInt(i.before.ausdc_raw)<1000000n&&BigInt(i.amount_raw)===BigInt(i.before.ausdc_raw))))state.exit_test_confirmed=true;}
 i.after=await aaveStatus(m,book);await m.save(book);return {ok:true,confirmed:true,...publicAaveIntent(i)};
}

export async function autoAave(m,book,{preview=false}={}){
 const storage=aaveStorageStatus(book);if(!storage.ok)return storage;
 if(storage.active_intent){const i=book.aave.intents[storage.active_intent];return executeAave(m,book,{intent_id:i.id,action:i.action,amount_usdc:formatUnits(i.amount_raw,6)},{preview});}
 const s=await aaveStatus(m,book);if(!s.ok)return s;
 if(s.paused)return {ok:true,status:'supply_paused',signed:false};
 if(BigInt(s.usdc_raw)<6000000n&&!s.first_supply_confirmed)return {ok:true,status:'waiting_USDC_deposit',balances:s,signed:false};
 if(BigInt(s.eth_raw)===0n)return {ok:true,status:'waiting_Base_ETH_gas',balances:s,signed:false};
 let action='supply',amount=1000000n,stage='first_supply';
 if(s.first_supply_confirmed&&!s.exit_test_confirmed){action='withdraw';stage='first_exit';if(BigInt(s.ausdc_raw)<amount)amount=BigInt(s.ausdc_raw);if(amount<=0n)return {ok:false,error:'exit_test_position_missing'};}
 else if(s.exit_test_confirmed){
  stage='bounded_supply';const liabilities=BigInt((book.pool_available_cents||0)+(book.pool_reserved_cents||0)+Object.values(book.agent_credit_cents||{}).reduce((a,b)=>a+b,0))*10000n;
  const floor=liabilities>5000000n?liabilities:5000000n;amount=BigInt(s.usdc_raw)-floor;const limits=investmentLimits({...s,cash_floor_raw:floor.toString()}),room=limits.exposure-BigInt(s.ausdc_raw);if(amount>room)amount=room;if(amount>limits.single)amount=limits.single;
  if(room<0n){action='withdraw';stage='reputation_rebalance';amount=-room;}else if(amount<1000000n)return {ok:true,status:'reserve_or_exposure_wait',balances:s,signed:false};
 }
 const day=new Date().toISOString().slice(0,10),id='AAVE-AUTO-'+stage+'-'+day;
 if(book.aave?.intents?.[id]?.status==='confirmed')return {ok:true,status:'already_ran_today',intent_id:id,signed:false};
 return executeAave(m,book,{intent_id:id,action,amount_usdc:formatUnits(amount,6)},{preview});
}
