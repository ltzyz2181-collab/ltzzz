import test from 'node:test';import assert from 'node:assert/strict';
import {observeServiceContinuity} from '../probe-service-continuity.mjs';
const book='a'.repeat(64),token='fixture-private-token';
const response=body=>Response.json({ok:true,book_sha256:book,private_key:token,...body});
test('seven fixed GETs; identity only goes to WEP book reads and never to Treasury',async()=>{
 const calls=[];const r=await observeServiceContinuity({runnerToken:token,fetcher:async(url,opts)=>{calls.push({url,opts});return response({controlled:false,chain_id:8453});}});
 assert.equal(r.verified,true);assert.equal(calls.length,7);assert.equal(r.transactions,0);assert.equal(r.model_api_calls,0);
 for(const {url,opts} of calls){assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');assert.equal(opts.body,undefined);assert.equal(Object.keys(opts.headers).length,url.endsWith('/market/runtime-state')?1:0);assert.equal(/preview|sign|reserve|release|execute/.test(url),false);}
 assert.equal(JSON.stringify(r).includes(token),false);assert.equal(JSON.stringify(r).includes('private_key'),false);assert.equal(r.full_unattended_goal_verified,false);
});
test('transport loss stays unknown and does not claim service death or retry',async()=>{
 let n=0;const r=await observeServiceContinuity({runnerToken:token,fetcher:async()=>{n++;throw Error('secret '+token);}});
 assert.equal(n,7);assert.equal(r.verified,false);assert.equal(r.observations.every(x=>x.http===null),true);assert.equal(JSON.stringify(r).includes(token),false);
});
test('HTTP200 null/arrays and unauthorized book reads cannot pass',async()=>{
 for(const body of [null,[],{ok:false}])assert.equal((await observeServiceContinuity({runnerToken:token,fetcher:async()=>Response.json(body)})).verified,false);
 const r=await observeServiceContinuity({runnerToken:token,fetcher:async url=>url.endsWith('/market/runtime-state')?Response.json({ok:false},{status:401}):response({})});assert.equal(r.verified,false);
});
test('concurrent financial book change requires reconciliation and causes no retry',async()=>{
 let books=0,calls=0;const r=await observeServiceContinuity({runnerToken:token,fetcher:async url=>{calls++;return response({book_sha256:url.endsWith('/market/runtime-state')&&++books===2?'b'.repeat(64):book});}});
 assert.equal(calls,7);assert.equal(r.financial_book_unchanged,false);assert.equal(r.status,'book_change_requires_reconciliation');
});
test('identity absence is explicit before any network request',async()=>{
 let called=false;await assert.rejects(()=>observeServiceContinuity({fetcher:()=>{called=true;}}),/managed_readonly_identity_required/);assert.equal(called,false);
});
