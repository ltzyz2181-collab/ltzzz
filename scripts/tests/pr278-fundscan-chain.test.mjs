import test from 'node:test';
import assert from 'node:assert/strict';
import {indirectFinancialReferences} from './repro-fundscan-miss-20261028.mjs';

test('single declaration alias baseline is detected',()=>{
 assert(indirectFinancialReferences('const send = w.sendTransaction; send(tx);').length>0);
});
test('transitive declaration alias reaches the financial call',()=>{
 const hits=indirectFinancialReferences('const a=w.sendTransaction; const b=a; const c=b; c(tx);');
 assert(hits.some(v=>v.alias==='c'&&v.member==='sendTransaction'));
});
test('unrelated and cyclic aliases never create a financial origin',()=>{
 assert.deepEqual(indirectFinancialReferences('const a=b; const b=a; a(tx);'),[]);
 assert.deepEqual(indirectFinancialReferences('const a=w.readBalance; const b=a; b();'),[]);
});

test('nonfinancial transitive chains and literal spaces do not become financial methods',()=>{assert.deepEqual(indirectFinancialReferences('const a=w.readBalance; const b=a; const c=b; c();'),[]);assert.deepEqual(indirectFinancialReferences("w['trans'+' '+'fer'](to,n);"),[]);assert.deepEqual(indirectFinancialReferences("w['transfer'+'From'+'Safe']();"),[]);});
test('CRLF and CR line counts are stable',()=>{for(const sep of ['\n','\r\n','\r'])assert(indirectFinancialReferences('const send=w.transfer;'+sep+'send(to,n);').some(v=>v.alias==='send'&&v.line===2));});
test('dollar identifiers are literal aliases, never regex anchors',()=>{assert(indirectFinancialReferences('const $a=w.transfer; const $b=$a; $b(to,n);').some(v=>v.alias==='$b'));});
