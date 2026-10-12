import test from 'node:test';import assert from 'node:assert/strict';import {assessDelivery} from '../delivery-integrity.mjs';
test('token limit is rejected even with end marker',()=>assert.equal(assessDelivery({output:'draft【交付结束】',finish_reason:'length'}).status,'incomplete'));
test('missing finish metadata cannot prove completeness',()=>assert.equal(assessDelivery({output:'text【交付结束】'}).status,'unverified'));
test('normal stop with partial table is rejected',()=>assert.equal(assessDelivery({output:'| 0–6s | 手机消息',finish_reason:'stop'}).status,'incomplete'));
test('complete response still requires independent review',()=>{const r=assessDelivery({output:'草稿。\n【交付结束】',finish_reason:'stop'});assert.equal(r.status,'structurally_complete');assert.equal(r.accepted,false);});
