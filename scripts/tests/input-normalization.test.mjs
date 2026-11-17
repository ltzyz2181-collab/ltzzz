import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizationRecord,NORMALIZATION_RULE,runQueueCard} from '../run-deep-superagent-queue.mjs';
import {normalizeJob} from '../../workers/deep-superagent/index.js';

const BASE={task_id:'DEEP-NORMALIZATION-PROBE',package_id:'normalization-probe',data_classification:'public_distributable',platform:'internal'};

test('原始与归一化字节/哈希分开记录：外层空白被裁剪时两侧哈希不同',async()=>{
  const raw={...BASE,prompt:'  public  '};
  const card=normalizeJob(raw);
  const record=await normalizationRecord(raw,card);
  assert.equal(record.rule_version,NORMALIZATION_RULE);
  assert.equal(record.applied,true);
  assert.equal(record.reason,'outer_whitespace_trimmed');
  assert.equal(record.raw_prompt_bytes,10);
  assert.equal(record.normalized_prompt_bytes,6);
  assert.notEqual(record.raw_prompt_sha256,record.normalized_prompt_sha256);
  assert.notEqual(record.raw_body_sha256,record.normalized_body_sha256);
  assert.match(record.recorded_at_utc,/^\d{4}-\d\d-\d\dT/);
});

test('未发生归一化时两侧哈希相同且原因标 none',async()=>{
  const raw={...BASE,prompt:'public'};
  const record=await normalizationRecord(raw,normalizeJob(raw));
  assert.equal(record.applied,false);
  assert.equal(record.reason,'none');
  assert.equal(record.raw_prompt_sha256,record.normalized_prompt_sha256);
  // 卡片键序与原始 JSON 可能不同，body 级哈希不强求相等；这里只要求两侧都被记录。
  assert.match(record.raw_body_sha256,/^[0-9a-f]{64}$/);
  assert.match(record.normalized_body_sha256,/^[0-9a-f]{64}$/);
});

test('源输入不被覆盖：空白差异不改变原始哈希，只改变归一化侧',async()=>{
  const a={...BASE,prompt:'public'};
  const b={...BASE,prompt:'public \n'};
  const ra=await normalizationRecord(a,normalizeJob(a));
  const rb=await normalizationRecord(b,normalizeJob(b));
  assert.notEqual(ra.raw_body_sha256,rb.raw_body_sha256,'原始侧必须保留差异');
  assert.equal(rb.normalized_prompt_sha256,ra.normalized_prompt_sha256,'归一化侧允许收敛');
});

test('队列卡片产物携带归一化记录，失败路径也不丢',async()=>{
  const outcome=await runQueueCard({
    kind:'task',
    body:{...BASE,prompt:'  public  '},
    source_commit:'8237e99b4b0fd105b3fed9f053e6548baff9591f',
    token:'probe-token',
    store:{},
    fetcher:async()=>{throw new Error('network_probe');}
  });
  assert.equal(outcome.status,'blocked');
  assert.ok(outcome.normalization,'归一化记录必须出现在队列产物里');
  assert.equal(outcome.normalization.applied,true);
  assert.match(outcome.raw_input_sha256,/^[0-9a-f]{64}$/);
  assert.match(outcome.input_sha256,/^[0-9a-f]{64}$/);
});
