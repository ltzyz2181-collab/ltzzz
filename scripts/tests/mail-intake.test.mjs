import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildIntake} from '../run-mail-intake.mjs';

// 合并邮件摄入产物是每日流水线的输入，CI 只校验落盘结果的结构与脱敏约束，
// 不重跑采集（CI 无收信凭据，也不允许把正文带进仓库）。
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARTIFACT = path.join(ROOT, 'knowledge/results/deep-superagent/mail-intake/latest.json');
const raw = fs.existsSync(ARTIFACT) ? fs.readFileSync(ARTIFACT, 'utf8') : '';
const doc = raw ? JSON.parse(raw) : null;

test('mail intake artifact exists and is parseable', () => {
  assert.ok(doc, 'mail-intake/latest.json 缺失：流水线第一步产物必须落盘');
  assert.equal(doc.schema, 'ltzzz.mail-intake.v1');
});

test('mail intake never claims success when a channel failed', () => {
  assert.ok(['ok', 'partial', 'failed'].includes(doc.status));
  const gmailOk = doc.gmail_fullbox?.status === 'ok';
  const agentOk = doc.agent_mail?.run_code === 0;
  // Phase 2 起裁决跟踪也计入总状态；旧产物没有该块时按不参与推导处理。
  const tracker = doc.ruling_tracker;
  const trackerOk = tracker ? tracker.status === 'ok' : null;
  const okCount = [gmailOk, agentOk, trackerOk].filter((value) => value === true).length;
  const known = [gmailOk, agentOk, trackerOk].filter((value) => value !== null);
  const expected = okCount === known.length ? 'ok' : (okCount > 0 ? 'partial' : 'failed');
  assert.equal(doc.status, expected, 'status 必须由各通道的真实结果推导，不得写死 ok');
});

test('mail intake persists no bodies and no credentials', () => {
  assert.equal(doc.bodies_persisted, false);
  assert.equal(doc.read_only, true);
  if ('contains_mail_body' in doc) assert.equal(doc.contains_mail_body, false);
  const text = raw.toLowerCase();
  for (const forbidden of ['app_password', 'password', 'client_secret', 'refresh_token', 'authorization', 'body_text']) {
    assert.ok(!text.includes(forbidden), `产物不得包含凭据或正文字段：${forbidden}`);
  }
});

test('open items carry only desensitized fields', () => {
  const allowed = new Set([
    'channel', 'ref', 'status', 'age_days', 'subject_short', 'has_dispatch_wording',
    // Phase 2 新增：三层去重与裁决继承的审计字段，全部是可公开的标识而非正文。
    'thread_id', 'task_ids', 'ruling_status', 'decision_id', 'rulings',
    'merged_count', 'layers', 'history', 'ruling_unread',
  ]);
  const rulingFields = new Set(['message_id', 'at', 'decision_id', 'verdict']);
  for (const item of doc.open_items || []) {
    for (const key of Object.keys(item)) assert.ok(allowed.has(key), `多余字段 ${key}：待办项只允许脱敏字段`);
    assert.ok(['agent_mail', 'gmail_fullbox'].includes(item.channel));
    assert.ok(String(item.subject_short || '').length <= 72, '短标题不得超过 72 字');
    for (const ruling of item.rulings || []) {
      for (const key of Object.keys(ruling)) assert.ok(rulingFields.has(key), `裁决项多余字段 ${key}`);
      assert.ok(!String(ruling.verdict || '').includes('\n'), '裁决词不得含换行正文');
      assert.ok(String(ruling.verdict || '').length <= 320, '裁决词必须是短结论，不是正文');
    }
    for (const taskId of item.task_ids || []) assert.match(taskId, /^[A-Z0-9-]+$/);
    for (const ref of item.history || []) assert.equal(typeof ref, 'string');
  }
  assert.ok((doc.open_items || []).length <= 200, '待办清单必须有上限');
});

test('Gmail 裁决回信只按主题元数据统计，不读正文', () => {
  const payload = buildIntake({
    backlog: {status: 'ok', items: [], count: 0, open_count: 0},
    fullbox: {
      status: 'ok', count: 1, open_count: 1,
      messages: [{
        ref: 'gmail-ref-1',
        date: 'Thu, 19 Nov 2026 08:00:00 +0800',
        from_domain: 'gmail.com',
        subject_short: 'RE: [GPT裁决] Phase1 范围确认 GPT-TEST-20261119-01',
        status: 'unknown',
        unread: false,
      }],
    },
    tracker: null,
    backlogRun: {code: 0},
    gmailRun: {code: 0},
    trackerRun: {code: 2},
    now: new Date('2026-11-19T02:00:00.000Z'),
  });
  assert.equal(payload.gmail_rulings.status, 'ok');
  assert.equal(payload.gmail_rulings.source, 'gmail_metadata_only');
  assert.equal(payload.gmail_rulings.today_count, 1);
  assert.equal(payload.gmail_rulings.bodies_read, false);
  assert.deepEqual(payload.gmail_rulings.decision_ids, ['GPT-TEST-20261119-01']);
});

test('dedupe block declares layers and preserved history', () => {
  if (!doc.dedupe) return; // 旧产物无该块
  assert.deepEqual(doc.dedupe.layers, ['message_id', 'thread_id', 'task_id']);
  assert.equal(doc.dedupe.history_preserved, true);
  assert.equal(typeof doc.dedupe.duplicates, 'number');
  assert.ok(Array.isArray(doc.dedupe.conflicts));
  for (const conflict of doc.dedupe.conflicts) {
    assert.equal(conflict.requires_review, true, '裁决冲突必须要求人工复核');
  }
});
