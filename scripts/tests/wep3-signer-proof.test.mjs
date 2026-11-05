import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet,verifyMessage} from 'ethers';
import worker from '../../wep3-worker.js';
import {signerProofRoute,OPERATING_TREASURY,identityProofMessage} from '../../wep3-signer-proof.js';
const nonce='a'.repeat(64);
const url='https://ltzzz-wep3.ltzyz2181.workers.dev/treasury/signer-proof?nonce='+nonce;
const request=(target=url,init={})=>new Request(target,{headers:{'X-Lab-Pin':'test-runner'},...init});
const base={WEP3_RUNNER_TOKEN:'test-runner',X402_RECEIVE_ADDRESS:OPERATING_TREASURY};
test('unauthenticated and wrong callers cannot read the private binding',async()=>{
 let reads=0;const env={...base};Object.defineProperty(env,'TREASURY_EXECUTOR_KEY',{get(){reads++;throw Error();}});
 for(const headers of [{},{'X-Lab-Pin':'wrong'}])assert.equal((await signerProofRoute(request(url,{headers}),env)).status,401);
 assert.equal(reads,0);
});
test('method, nonce shape, duplicate nonce and arbitrary message are refused before signing',async()=>{
 let reads=0;const env={...base};Object.defineProperty(env,'TREASURY_EXECUTOR_KEY',{get(){reads++;throw Error();}});
 for(const bad of [url+'&message=pay',url+'&nonce='+nonce,url.replace(nonce,'short'),url.replace('?nonce='+nonce,'')])assert.equal((await signerProofRoute(request(bad),env)).status,422);
 assert.equal((await signerProofRoute(request(url,{method:'POST'}),env)).status,405);assert.equal(reads,0);
});
test('missing Worker key is reported separately from filtered legacy credentials',async()=>{
 const r=await worker.fetch(request(),base);const b=await r.json();assert.equal(r.status,503);assert.equal(b.error,'worker_treasury_binding_missing');assert.equal(b.on_chain_executed,false);assert.equal(b.transaction_adapter_ready,false);
});
test('another EOA and the excluded five-signature wallet cannot be signed as treasury',async()=>{
 const w=Wallet.createRandom();
 for(const address of [w.address,'0x76379a52a9e82c259E5Db417104C65C26f9C58a3']){
  const r=await signerProofRoute(request(),{...base,X402_RECEIVE_ADDRESS:address,TREASURY_EXECUTOR_KEY:w.privateKey});assert.equal(r.status,409);assert.equal((await r.json()).error,'operating_treasury_address_mismatch');
 }
});
test('proof domain and nonce are bound to real EIP191 bytes using a disposable fixture',async()=>{
 const w=Wallet.createRandom(),issued='2026-11-05T00:00:00.000Z',message=identityProofMessage(nonce,issued);
 assert.ok(message.includes('Not login, payment, permit, transaction or five-signature wallet authorization'));
 assert.ok(message.includes('address='+OPERATING_TREASURY));assert.ok(message.includes('chain_id=8453'));
 const signature=await w.signMessage(message);assert.equal(verifyMessage(message,signature),w.address);
 assert.notEqual(verifyMessage(identityProofMessage('b'.repeat(64),issued),signature),w.address);
 // A random fixture key must not impersonate the real production treasury.
 const r=await signerProofRoute(request(),{...base,TREASURY_EXECUTOR_KEY:w.privateKey});assert.equal(r.status,409);
 assert.equal(await signerProofRoute(new Request('https://example.invalid/other'),base),null);
});
