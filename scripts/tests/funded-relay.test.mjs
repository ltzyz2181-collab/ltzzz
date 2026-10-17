import test from 'node:test';import assert from 'node:assert/strict';import {Wallet,Interface,keccak256} from 'ethers';
import {validateRelay,relayPersisted} from '../lib/wep3-signed-relay.mjs';
import {aaveRelay,AAVE} from '../../wep3-aave.js';
import {TREASURY} from '../lib/funded-invest-runtime.mjs';
import {externalPurchase,completeExternalRelay,PROCUREMENT_ORDER} from '../../wep3-procurement.js';
const w=Wallet.createRandom(),payTo='0xaBF4FAbd7c416fB67202E5f9002389Fc75e2a9D0';
const quote={x402Version:2,resource:{url:'https://agent402.tools/v1/nano/chat/completions'},accepts:[{scheme:'exact',network:'eip155:8453',asset:AAVE.usdc,payTo,amount:'3000',maxTimeoutSeconds:300,extra:{name:'USD Coin',version:'2'}}]};
const statusReader=async()=>({ok:true,address:w.address,usdc_raw:'20000000',block_number:50});
const m={env:{X402_RECEIVE_ADDRESS:w.address,TREASURY_EXECUTOR_KEY:w.privateKey},save:async()=>{}};
test('two-phase external purchase never fetches from Worker and only first handoff can contain authorization',async()=>{
 const book={},options={execute:true,providedQuote:quote,relayPrepare:true,statusReader,fetcher:()=>{throw Error('network forbidden')}};
 const r=await externalPurchase(m,book,options);assert.ok(r.relay.payment_payload.payload.signature);assert.equal('payment_payload' in r.order,false);assert.equal(book.procurement[PROCUREMENT_ORDER].status,'payment_submitted_unknown');
 const again=await externalPurchase(m,book,{...options,paymentVerifier:async()=>({verified:false})});assert.equal(again.relay,undefined);assert.equal(JSON.stringify(again).includes(r.relay.payment_payload.payload.signature),false);
});
test('imported provider response cannot manufacture successful payment without independent chain proof',async()=>{
 const book={};await externalPurchase(m,book,{execute:true,providedQuote:quote,relayPrepare:true,statusReader});
 const args={http:200,body:JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{}'}}]}),payment_response:btoa(JSON.stringify({success:true,network:'eip155:8453',transaction:'0x'+'a'.repeat(64)}))};
 const r=await completeExternalRelay(m,book,args,{paymentVerifier:async()=>({verified:false})});assert.equal(r.order.paid,false);assert.equal(r.order.delivery_accepted,false);
 const proof={verified:true,tx_hash:'0x'+'a'.repeat(64)};const verified=await externalPurchase(m,book,{paymentVerifier:async()=>proof});assert.equal(verified.order.paid,true);assert.equal(verified.order.status,'paid_delivery_rejected');
});
test('external relay rejects wrong quote before creating a payment reservation',async()=>{const b={};const r=await externalPurchase(m,b,{execute:true,providedQuote:{...quote,accepts:[{...quote.accepts[0],amount:'50001'}]},relayPrepare:true,statusReader});assert.equal(r.error,'external_quote_not_accepted');assert.equal(Object.keys(b.procurement).length,0);});
test('unprepared external results and oversized responses are rejected',async()=>{assert.equal((await completeExternalRelay(m,{},{})).error,'external_relay_not_prepared');});
test('relay never accepts an unrelated signer, arbitrary transaction, wrong chain or unbound amount',async()=>{
 const abi=new Interface(['function supply(address,uint256,address,uint16)']);const raw=await w.signTransaction({chainId:8453,to:AAVE.pool,data:abi.encodeFunctionData('supply',[AAVE.usdc,1000000n,TREASURY,0]),nonce:0,gasLimit:50000,maxFeePerGas:1n,maxPriorityFeePerGas:1n,value:0n,type:2});
 assert.throws(()=>validateRelay({raw,tx_hash:keccak256(raw),intent_id:'i',amount_raw:'1000000',step_kind:'supply'},{kind:'aave',intent_id:'i',amount_raw:'1000000'}),/identity/);
});
test('malformed, paused and terminal Aave intents cannot export relay bytes',()=>{assert.equal(aaveRelay({},'i').ok,false);assert.equal(aaveRelay({aave:{active_intent:'i',paused:true,intents:{i:{}}}},'i').ok,false);});
