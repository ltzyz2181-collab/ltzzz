import test from 'node:test';import assert from 'node:assert/strict';
import {PROVIDER,inspectQuote,procurementPreflight} from '../lib/external-procurement-preflight.mjs';
const quote=()=>({x402Version:2,accepts:[{scheme:'exact',network:PROVIDER.network,asset:PROVIDER.asset,payTo:PROVIDER.payTo,amount:'3000'}]});
test('Base native USDC exact quote is distinct from purchasing, paying or accepting external AI',()=>{assert.equal(inspectQuote(402,quote()).status,'quote_verified_not_purchased');assert.equal(inspectQuote(200,quote()).status,'blocked_expected_402');});
test('reject wrong asset, network, recipient, scheme, version, transfer method and unsafe integer prices',()=>{
 for(const [key,value] of [['network','eip155:1'],['asset','0x'+'0'.repeat(40)],['payTo','0x'+'1'.repeat(40)],['scheme','upto'],['amount','0'],['amount','-1'],['amount','NaN'],['amount','0.003'],['amount','50001'],['amount',1e9],['extra',{assetTransferMethod:'permit2'}]]){const q=quote();q.accepts[0][key]=value;assert.ok(inspectQuote(402,q).status.startsWith('blocked_'),key);}
 const q=quote();q.x402Version=1;assert.equal(inspectQuote(402,q).status,'blocked_invalid_x402_v2');
});
test('preflight makes exactly one fixed unpaid GET without wallet credentials or redirect following',async()=>{
 const calls=[];const r=await procurementPreflight({fetcher:async(url,options)=>{calls.push({url,options});return new Response(null,{status:402,headers:{'PAYMENT-REQUIRED':Buffer.from(JSON.stringify(quote())).toString('base64')}});}});
 assert.equal(calls.length,1);assert.equal(calls[0].url,PROVIDER.url);assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.redirect,'error');assert.deepEqual(calls[0].options.headers,{Accept:'application/json'});assert.equal(r.model_calls,0);assert.equal(r.paid,false);assert.equal(r.payments_submitted,0);assert.equal(r.purchase_status,'not_attempted');assert.equal(r.production_cash_payout_enabled,false);assert.equal(r.tx_hash,null);assert.ok(r.blockers.length);
});
test('unavailable or malformed quote leaves explicit blocker and never retries payment',async()=>{for(const fetcher of [async()=>{throw Error('timeout')},async()=>new Response('bad',{status:402})]){const r=await procurementPreflight({fetcher});assert.equal(r.status,'blocked_quote_network_or_schema');assert.equal(r.paid,false);assert.equal(r.tx_hash,null);}});
