import test from 'node:test';import assert from 'node:assert/strict';import {assessDelivery} from '../delivery-integrity.mjs';
test('token limit is rejected even with end marker',()=>assert.equal(assessDelivery({output:'draft【交付结束】',finish_reason:'length'}).status,'incomplete'));
test('missing finish metadata cannot prove completeness',()=>assert.equal(assessDelivery({output:'text【交付结束】'}).status,'unverified'));
test('normal stop with partial table is rejected',()=>assert.equal(assessDelivery({output:'| 0–6s | 手机消息',finish_reason:'stop'}).status,'incomplete'));
test('complete response still requires independent review',()=>{const r=assessDelivery({output:'草稿。\n【交付结束】',finish_reason:'stop'});assert.equal(r.status,'structurally_complete');assert.equal(r.accepted,false);});
test('normal completion without required supervision section must stay unfinished',()=>{
 const r=assessDelivery({output:'【观】只交了一般读后感。\n【交付结束】',finish_reason:'stop',required_sections:['【派单监督】']});
 assert.equal(r.status,'missing_required_section');
});
test('supervision must be a populated real section, not a quoted or fenced example',()=>{
 for(const body of ['文中提及【派单监督】','>【派单监督】\n> example','```md\n【派单监督】\nexample\n```','【派单监督】']){
  assert.equal(assessDelivery({output:body+'\n【交付结束】',finish_reason:'stop',required_sections:['【派单监督】']}).status,'missing_required_section');
 }
 const r=assessDelivery({output:'## 【派单监督】\n责任席：千问；原Task ID：DAILY-2026-10-31-qianwen；未核查。\n【交付结束】',finish_reason:'stop',required_sections:['【派单监督】']});
 assert.equal(r.status,'structurally_complete');assert.equal(r.accepted,false);
});
test('long fences and later headings cannot impersonate the required section',()=>{
 const bodies=['````md\n```\n【派单监督】\nnot real\n````','【派单监督】\n## 其他节\nother body',
  '<!--\n【派单监督】\ncomment only\n-->','    【派单监督】\n    indented code'];
 for(const output of bodies)assert.equal(assessDelivery({output:output+'\n【交付结束】',finish_reason:'stop',required_sections:['【派单监督】']}).status,'missing_required_section');
});
