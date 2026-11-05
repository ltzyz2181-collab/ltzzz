import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runOnce, validateCard, pending} from '../run-qwen-dispatch.mjs';

const mk = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-')); return {queueDir: path.join(d, 'q'), receiptDir: path.join(d, 'r')}; };
const card = (dir, over = {}) => { fs.mkdirSync(dir, {recursive: true}); const c = {id: 'QWEN-TEST-0001', agent: 'qianwen', prompt: '请用一句话说明什么是任务认领回执，不要执行任何命令。', max_tokens: 128, ...over}; fs.writeFileSync(path.join(dir, c.id + '.json'), JSON.stringify(c)); return c; };

test('no cards -> no call', async () => {
  const p = mk(); let calls = 0;
  const r = await runOnce({...p, call: async () => { calls++; }});
  assert.equal(r.executed, false); assert.equal(calls, 0);
});
test('a lost durable reservation blocks before the provider; a recorded intent is not repurchased',async()=>{
 const p=mk();card(p.queueDir);let calls=0;
 await assert.rejects(()=>runOnce({...p,reserve:async()=>{throw Error('write_unknown');},call:async()=>{calls++;}}),/write_unknown/);
 const r=await runOnce({...p,call:async()=>{calls++;}});assert.equal(r.model_calls,0);assert.equal(calls,0);
});
test('the provider receives the same required sections and end marker the delivery gate enforces',async()=>{
 const p=mk(),c=card(p.queueDir,{required_sections:['【派单监督】','【lessons核对】']});let calls=0;
 await runOnce({...p,call:async input=>{calls++;assert.ok(input.prompt.lastIndexOf('【派单监督】')>input.prompt.lastIndexOf(c.prompt));assert.ok(input.prompt.lastIndexOf('【lessons核对】')>input.prompt.lastIndexOf(c.prompt));assert.ok(input.prompt.lastIndexOf('【交付结束】')>input.prompt.lastIndexOf(c.prompt));return {ok:true,output:'【派单监督】未核查。\n【lessons核对】仅引用提供证据。\n【交付结束】',finish_reason:'stop'};}});
 assert.equal(calls,1);
});
test('required supervision cannot be delivered by normal stop and end marker alone',async()=>{
 const p=mk();card(p.queueDir,{required_sections:['【派单监督】']});
 const r=await runOnce({...p,call:async()=>({ok:true,status:'success',output:'普通产出\n【交付结束】',finish_reason:'stop',model:'qwen-plus'})});
 assert.equal(r.status,'missing_required_section');
 const rec=JSON.parse(fs.readFileSync(path.join(p.receiptDir,'QWEN-TEST-0001.json')));
 assert.match(rec.output,/普通产出/);assert.equal(rec.accepted,false);assert.deepEqual(rec.delivery_integrity.missing_sections,['【派单监督】']);
 assert.deepEqual(pending(p),[]); // rejected delivery never causes a second paid request
});
test('malformed required_sections is rejected before provider access',async()=>{
 for(const required_sections of [null,'【派单监督】',[''],['【派单监督】','【派单监督】'],['bad\nheader']]){
  const p=mk();card(p.queueDir,{required_sections});let calls=0;
  const r=await runOnce({...p,call:async()=>{calls++;}});assert.equal(r.reason,'invalid_card');assert.equal(calls,0);
 }
});
test('populated required supervision is a draft awaiting independent review',async()=>{
 const p=mk();card(p.queueDir,{required_sections:['【派单监督】']});
 const r=await runOnce({...p,call:async()=>({ok:true,status:'success',output:'【派单监督】\n责任席：千问；未核查不代表不存在。\n【交付结束】',finish_reason:'stop',model:'qwen-plus'})});
 assert.equal(r.status,'draft_delivered_pending_independent_review');
});
test('valid card -> one call, draft only, never accepted/paid', async () => {
  const p = mk(); card(p.queueDir); let calls = 0;
  const r = await runOnce({...p, call: async () => { calls++; return {ok: true, status: 'success', output: '回执', native_qwen_call: true, model: 'qwen-plus', finish_reason: 'stop', tokens_used: 9}; }});
  assert.equal(calls, 1); assert.equal(r.status, 'draft_delivered_pending_independent_review');
  const rec = JSON.parse(fs.readFileSync(path.join(p.receiptDir, 'QWEN-TEST-0001.json')));
  assert.equal(rec.accepted, false); assert.equal(rec.paid, false); assert.equal(rec.tx_hash, null); assert.equal(rec.output_sha256.length, 64);
  assert.deepEqual(pending(p), []);
});
test('second run does not re-call a processed card', async () => {
  const p = mk(); card(p.queueDir); let calls = 0; const call = async () => { calls++; return {ok: true, status: 'success', output: 'x'}; };
  await runOnce({...p, call}); await runOnce({...p, call}); assert.equal(calls, 1);
});
test('provider failure is recorded as failure, not success, and not retried', async () => {
  const p = mk(); card(p.queueDir); let calls = 0;
  const r = await runOnce({...p, call: async () => { calls++; return {ok: false, status: 'billing_or_quota_error', error: 'HTTP 400'}; }});
  assert.equal(r.status, 'billing_or_quota_error'); assert.equal(calls, 1); assert.deepEqual(pending(p), []);
});
test('truncated text and real usage evidence survive a rejection without triggering another generation',async()=>{
 const p=mk();card(p.queueDir,{required_sections:['【派单监督】']});let calls=0;
 const call=async()=>{calls++;return {ok:false,status:'incomplete_output',output:'partial evidence',finish_reason:'length',provider:'aliyun_dashscope',model:'qwen-plus',model_source:'provider_response',http:200,completion_id:'native-id',prompt_tokens:50,completion_tokens:100,reasoning_tokens:0};};
 await runOnce({...p,call});await runOnce({...p,call});const r=JSON.parse(fs.readFileSync(path.join(p.receiptDir,'QWEN-TEST-0001.json')));
 assert.equal(calls,1);assert.equal(r.output,'partial evidence');assert.equal(r.accepted,false);assert.equal(r.status,'incomplete_output');assert.equal(r.reasoning_tokens,0);assert.equal(r.completion_id,'native-id');assert.equal(r.actual_provider,'aliyun_dashscope');
});
test('invalid cards rejected without model call (real_money, wrong agent, id mismatch)', async () => {
  for (const over of [{real_money: true}, {agent: 'deepseek'}, {max_tokens: 99999}]) {
    const p = mk(); card(p.queueDir, over); let calls = 0;
    const r = await runOnce({...p, call: async () => { calls++; }});
    assert.equal(r.reason, 'invalid_card'); assert.equal(calls, 0);
  }
  assert.ok(validateCard({id: 'QWEN-TEST-0001', agent: 'qianwen', prompt: 'x'.repeat(30)}, 'OTHER.json').includes('filename_must_equal_id'));
});

test('per-model token tiers: qwen capped 2048, kimi owns 3000-16384 separately', () => {
  // qwen ceiling restored: 2048 passes, 2049 rejected
  assert.deepEqual(validateCard({id: 'QWEN-T-0001', agent: 'qianwen', prompt: 'x'.repeat(30), model: 'qwen-plus', max_tokens: 2048}, 'QWEN-T-0001.json').filter(e=>e.startsWith('max_tokens_')||e.startsWith('kimi_')), []);
  assert.ok(validateCard({id: 'QWEN-T-0002', agent: 'qianwen', prompt: 'x'.repeat(30), model: 'qwen-plus', max_tokens: 2049}, 'QWEN-T-0002.json').includes('max_tokens_qwen_ceiling_2048'));
  // kimi: below floor rejected, above its own ceiling rejected, in range passes
  assert.ok(validateCard({id: 'QWEN-K-0001', agent: 'qianwen', prompt: 'x'.repeat(30), model: 'kimi-k3', max_tokens: 1024}, 'QWEN-K-0001.json').some(e => e.startsWith('kimi_max_tokens_')));
  assert.ok(validateCard({id: 'QWEN-K-0002', agent: 'qianwen', prompt: 'x'.repeat(30), model: 'kimi-k3', max_tokens: 99999}, 'QWEN-K-0002.json').some(e => e.startsWith('kimi_max_tokens_')));
  assert.deepEqual(validateCard({id: 'QWEN-K-0003', agent: 'qianwen', prompt: 'x'.repeat(30), model: 'kimi-k3', max_tokens: 4000}, 'QWEN-K-0003.json').filter(e=>e.startsWith('max_tokens_')||e.startsWith('kimi_')), []);
  // unknown model defaults to the qwen ceiling
  assert.ok(validateCard({id: 'QWEN-T-0003', agent: 'qianwen', prompt: 'x'.repeat(30), max_tokens: 99999}, 'QWEN-T-0003.json').includes('max_tokens_qwen_ceiling_2048'));
});

test('receipt separates queue dispatcher from actual generating model', async () => {
  const p = mk(); card(p.queueDir, {model: 'kimi-k3', max_tokens: 4000});
  await runOnce({...p, call: async () => ({ok: true, status: 'success', output: '回执', model: 'kimi-k3', finish_reason: 'stop', tokens_used: 9})});
  const rec = JSON.parse(fs.readFileSync(path.join(p.receiptDir, 'QWEN-TEST-0001.json')));
  assert.equal(rec.queue_dispatcher, 'qianwen');
  assert.equal(rec.generated_by_model, 'kimi-k3');
  assert.ok(rec.attribution_note && /kimi/i.test(rec.attribution_note) && /qianwen/i.test(rec.attribution_note), rec.attribution_note);
});
