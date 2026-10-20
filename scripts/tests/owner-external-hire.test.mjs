import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {canonicalEight,liveEight} from '../lib/live-wep3-eight.mjs';
import {assertOwnerPayment} from '../lib/owner-external-hire.mjs';
import {TREASURY} from '../lib/funded-invest-runtime.mjs';
import {PROVIDER} from '../lib/external-procurement-preflight.mjs';
const token='fixture-private-pin',base='https://test.invalid';
function fetchFixture(mutate=()=>{}){let n=0;return async(url,options)=>{const row=canonicalEight()[n++];assert.equal(url,base+row.path);assert.equal(options.method,row.method);assert.equal(options.headers['X-Lab-Pin'],row.auth==='valid'?token:row.auth==='wrong'?'wrong-contract-pin':undefined);assert.equal(options.redirect,'error');const v={status:row.expected_http,json:structuredClone(row.expected_json)};mutate(v,row);return Response.json(v.json,{status:v.status});};}
test('eight online read-only requests verify exact registered treasury, positive and negative authentication',async()=>{
 const r=await liveEight({base,token,fetcher:fetchFixture()});assert.equal(r.passed,true);assert.equal(r.checks.length,8);assert.equal(r.checks[1].actual.address,TREASURY);assert.match(TREASURY,/^0x[0-9a-fA-F]{40}$/);assert.equal(r.transactions,0);assert.equal(r.model_calls,0);assert.equal(JSON.stringify(r).includes(token),false);
 for(const t of canonicalEight().filter(t=>t.method==='POST'))assert.equal(t.path,'/market/aave/preview');
});
test('malformed historical T02 treasury and wrong HTTP/auth values fail even if all other checks pass',async()=>{
 for(const mutate of [(v,r)=>{if(r.id==='T02')v.json.address='0x5df5778E0A13df2aE983BDAD69cFCBD3DD7a32d'},(v,r)=>{if(r.id==='T05')v.json.authenticated=false},(v,r)=>{if(r.id==='T06')v.status=200}]){
  const r=await liveEight({base,token,fetcher:fetchFixture(mutate)});assert.equal(r.passed,false);assert.equal(r.checks.length,8);
 }
});
test('network failures and invalid JSON are recorded without disclosing error contents or skipping remaining tests',async()=>{
 let calls=0;const good=fetchFixture();const r=await liveEight({base,token,fetcher:async(...args)=>{calls++;const response=await good(...args);if(calls===1)throw Error(token);if(calls===2)return new Response('not JSON');return response;}});assert.equal(calls,8);assert.equal(r.passed,false);assert.equal(r.checks[0].error,'network_or_invalid_JSON');assert.equal(JSON.stringify(r).includes(token),false);
 await assert.rejects(liveEight({base,token:'',fetcher:()=>{throw Error('must not request')}}),/runner_identity_missing/);
});
test('paid success requires exact payer/payee, <=0.05 amount, transaction and chain proof',()=>{
 const tx='0x'+'a'.repeat(64),o={paid:true,payer:TREASURY,pay_to:PROVIDER.payTo,amount_raw:'3000',tx_hash:tx,payment_proof:{verified:true,tx_hash:tx}};assert.doesNotThrow(()=>assertOwnerPayment(o));assert.doesNotThrow(()=>assertOwnerPayment({...o,amount_raw:'50000'}));
 for(const patch of [{amount_raw:'50001'},{amount_raw:'-1'},{amount_raw:'NaN'},{payer:'0x'+'1'.repeat(40)},{pay_to:'0x'+'2'.repeat(40)},{tx_hash:null},{payment_proof:{verified:false,tx_hash:tx}}])assert.throws(()=>assertOwnerPayment({...o,...patch}));
 assert.doesNotThrow(()=>assertOwnerPayment({paid:false}));
});
test('prepare is immutable and leaves the already assigned internal daily record byte-for-byte unchanged',()=>{
 fs.mkdirSync('work',{recursive:true});const root=fs.mkdtempSync(path.resolve('work/owner-hire-test-'));
 try{
  const internal='knowledge/results/claude-team/real-hire-20261020.json',text=JSON.stringify({mode:'internal',paid:false,status:'internal_data_accepted'});fs.mkdirSync(path.dirname(root+'/'+internal),{recursive:true});fs.writeFileSync(root+'/'+internal,text);
  for(const f of ['wep3-market.js','wep3-aave.js','wep3-procurement-contract.js','scripts/lib/live-wep3-eight.mjs']){fs.mkdirSync(path.dirname(root+'/'+f),{recursive:true});fs.writeFileSync(root+'/'+f,'public input');}
  for(const args of [['init','-q'],['-c','user.name=test','-c','user.email=test@example.invalid','commit','--allow-empty','-qm','fixture']])assert.equal(spawnSync('git',args,{cwd:root}).status,0);
  const script=path.resolve('scripts/run-owner-external-hire.mjs'),file=root+'/knowledge/results/owner-external/OWNER-EXT-AI-20261020-01.json';
  const first=spawnSync(process.execPath,[script,'prepare'],{cwd:root,encoding:'utf8'});assert.equal(first.status,0,first.stderr);const record=fs.readFileSync(file,'utf8');assert.equal(JSON.parse(record).task_id,'OWNER-EXT-AI-20261020-01');
  assert.equal(spawnSync(process.execPath,[script,'prepare'],{cwd:root,encoding:'utf8'}).status,0);assert.equal(fs.readFileSync(file,'utf8'),record);assert.equal(fs.readFileSync(root+'/'+internal,'utf8'),text);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
