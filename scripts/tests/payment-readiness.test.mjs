import test from 'node:test';import assert from 'node:assert/strict';
import {publicMetadata,readSnapshot,credentialPresence,ROUTES} from '../run-payment-readiness.mjs';
test('snapshot exports status and hashes but omits customer inputs, credentials, model text and payment payloads',()=>{
 const v=publicMetadata({ok:true,controlled:false,secret:'TOKEN',prompt:'customer',deliverable:'restricted',payment_payload:{signature:'secret'},order:{id:'ORIGINAL-01',status:'payment_submitted_unknown',paid:false,tx_hash:null,deliverable:'private'},rails:{x402:{configured:true,status:'ready',network:'eip155:8453',secret:'key'}}});
 assert.deepEqual(v,{ok:true,controlled:false,order:{id:'ORIGINAL-01',status:'payment_submitted_unknown',paid:false,tx_hash:null},rails:{x402:{configured:true,status:'ready',network:'eip155:8453'}}});
 assert.equal(JSON.stringify(v).includes('secret'),false);
});
test('only fixed GET routes run; no arbitrary endpoint, redirect or payment authorization',async()=>{
 let count=0;const fetcher=async(url,o)=>{count++;assert.equal(url,'https://ltzzz-wep3.ltzyz2181.workers.dev/market/runtime-state');assert.equal(o.method,'GET');assert.equal(o.body,undefined);assert.equal(o.redirect,'error');assert.equal(o.headers['X-Lab-Pin'],'test-runner');return Response.json({ok:true,book_sha256:'a'.repeat(64),prompt:'secret'});};
 const r=await readSnapshot('/market/runtime-state',{token:'test-runner',fetcher});assert.equal(r.http_status,200);assert.equal(r.metadata.prompt,undefined);assert.match(r.response_sha256,/^[a-f0-9]{64}$/);
 await assert.rejects(()=>readSnapshot('/market/aave/execute',{token:'x',fetcher}));assert.equal(count,1);
 assert.equal((await readSnapshot(ROUTES[4],{fetcher})).status,'blocked_existing_runner_auth_missing');assert.equal(count,1);
});
test('failed transport is recorded without retry and secret presence is not control proof',async()=>{
 let n=0;const r=await readSnapshot('/health',{fetcher:async()=>{n++;throw Error('token SECRET');}});assert.equal(n,1);assert.equal(JSON.stringify(r).includes('SECRET'),false);
 assert.deepEqual(credentialPresence({CDP_API_KEY_ID:'private'}),{api_key_id:true,api_key_secret:false,wallet_secret:false});
});
