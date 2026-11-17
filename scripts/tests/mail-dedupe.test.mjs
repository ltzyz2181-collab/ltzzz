// 三层去重（message_id / thread_id / Task ID）与历史裁决继承的单元测试。
// 对应工单 §一.3/§一.4：重复邮件、同一线程多封回复、历史裁决继承必须都有自动化覆盖。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEDUPE_VERSION,
  dedupeMessages,
  extractTaskIds,
  normalizeMessageId,
  normalizeThreadKey,
  normalizeThreadId,
} from '../mail/dedupe.mjs';

const T1 = 'LTZZZ-GMAIL-INTAKE-HYGIENE-20261117-02';
const T2 = 'GPT-HIRE-PHASE1-REPAIR-20261117-02';

function msg(overrides = {}) {
  return {
    channel: 'gmail_fullbox',
    ref: overrides.ref || 'ref-default',
    message_id: overrides.message_id ?? overrides.ref ?? 'ref-default',
    thread_id: null,
    task_ids: [],
    status: 'open',
    unread: false,
    at: '2026-11-17T00:00:00Z',
    subject_short: '项目邮件',
    ...overrides,
  };
}

test('Task ID 提取：只认日期锚定的完整标识', () => {
  const ids = extractTaskIds(
    `请处理 ${T1} 与 ${T2}`,
    '以及日期不足 8 位的 LTZZZ-2026111 和无关的 ABC-1234',
  );
  assert.deepEqual(ids, [T2, T1].sort());
  assert.ok(!ids.includes('ABC-1234'), '不得把非日期锚定串当成 Task ID');
  assert.ok(!ids.includes('LTZZZ-2026111'), '日期不足 8 位不得当成 Task ID');
});

test('message_id / thread_id 归一：去尖括号、去空白、大小写不敏感', () => {
  assert.equal(normalizeMessageId('  <ABC@Example.COM> '), 'abc@example.com');
  assert.equal(normalizeMessageId(''), null);
  assert.equal(normalizeThreadId(' THREAD-1 '), 'thread-1');
  assert.equal(normalizeThreadKey('Re: [LTZZZ] 回复: 项目周报'), '项目周报');
});

test('第一层：同一 message_id 跨通道重复只保留一条，重复项进 history', () => {
  const result = dedupeMessages([
    msg({ref: 'agent-1', channel: 'agent_mail', message_id: 'same@id'}),
    msg({ref: 'gmail-1', channel: 'gmail_fullbox', message_id: 'same@id'}),
  ]);
  assert.equal(result.version, DEDUPE_VERSION);
  assert.equal(result.clusters, 1);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].matched_layer, 'message_id');
  assert.equal(result.duplicates[0].duplicate_of, 'agent-1');
  assert.deepEqual(result.items[0].history.map((h) => h.ref), ['agent-1', 'gmail-1']);
  assert.equal(result.history_preserved, true);
});

test('第二层：不同 message_id 但同 thread_id 合并', () => {
  const result = dedupeMessages([
    msg({ref: 'a', message_id: 'a@x', thread_id: 'thread-9', at: '2026-11-17T01:00:00Z'}),
    msg({ref: 'b', message_id: 'b@x', thread_id: 'thread-9', at: '2026-11-17T02:00:00Z'}),
  ]);
  assert.equal(result.clusters, 1);
  assert.equal(result.duplicates[0].matched_layer, 'thread_id');
  assert.deepEqual(result.items[0].history.map((h) => h.ref), ['a', 'b']);
});

test('第三层：不同 message_id/thread_id 但同 Task ID 合并', () => {
  const result = dedupeMessages([
    msg({ref: 'a', message_id: 'a@x', thread_id: 'thread-a', task_ids: [T1]}),
    msg({ref: 'b', message_id: 'b@x', thread_id: 'thread-b', task_ids: [T1]}),
  ]);
  assert.equal(result.clusters, 1);
  assert.equal(result.duplicates[0].matched_layer, 'task_id');
  assert.deepEqual(result.items[0].task_ids, [T1]);
});

test('三层可传递合并：A-B 同线程、B-C 同 Task ID 时三封归一簇', () => {
  const result = dedupeMessages([
    msg({ref: 'a', message_id: 'a@x', thread_id: 'th-1', task_ids: []}),
    msg({ref: 'b', message_id: 'b@x', thread_id: 'th-1', task_ids: [T2]}),
    msg({ref: 'c', message_id: 'c@x', thread_id: 'th-2', task_ids: [T2]}),
  ]);
  assert.equal(result.clusters, 1);
  assert.deepEqual(result.items[0].history.map((h) => h.ref), ['a', 'b', 'c']);
  assert.deepEqual(result.items[0].task_ids, [T2]);
  assert.ok(result.items[0].layers.includes('thread_id'));
  assert.ok(result.items[0].layers.includes('task_id'));
});

test('不同 Task ID 且无共同线程时不得误合', () => {
  const result = dedupeMessages([
    msg({ref: 'a', message_id: 'a@x', thread_id: 'th-1', task_ids: [T1]}),
    msg({ref: 'b', message_id: 'b@x', thread_id: 'th-2', task_ids: [T2]}),
  ]);
  assert.equal(result.clusters, 2);
  assert.equal(result.duplicates.length, 0);
});

test('完全没有标识的邮件各自独立成簇', () => {
  const result = dedupeMessages([
    {channel: 'gmail_fullbox', ref: 'anon-a', message_id: null, thread_id: null, task_ids: []},
    {channel: 'gmail_fullbox', ref: 'anon-b', message_id: null, thread_id: null, task_ids: []},
  ]);
  assert.equal(result.clusters, 2);
  assert.equal(result.duplicates.length, 0);
});

test('历史裁决继承：同一线程多封回复全部保留，不丢早期裁决', () => {
  const result = dedupeMessages([
    msg({
      ref: 'reply-1', message_id: 'r1@x', thread_id: 'th-9',
      rulings: [{message_id: 'r1@x', decision_id: 'GPT-A-20261116-01', at: '2026-11-16T10:00:00Z', verdict: 'approve_in_scope'}],
    }),
    msg({
      ref: 'reply-2', message_id: 'r2@x', thread_id: 'th-9',
      rulings: [{message_id: 'r2@x', decision_id: 'GPT-A-20261116-01', at: '2026-11-16T11:00:00Z', verdict: 'approve_in_scope'}],
    }),
  ]);
  const cluster = result.items[0];
  assert.equal(cluster.rulings.length, 2, '两封回复都要保留');
  assert.equal(cluster.ruling_status, 'decided');
  assert.equal(cluster.decision_id, 'GPT-A-20261116-01');
  assert.equal(cluster.latest_ruling.message_id, 'r2@x');
  assert.equal(result.conflicts.length, 0);
});

test('历史裁决继承：同线程出现两个不同 decision_id 判 conflict 且要求复核', () => {
  const result = dedupeMessages([
    msg({
      ref: 'reply-1', message_id: 'r1@x', thread_id: 'th-9',
      rulings: [{message_id: 'r1@x', decision_id: 'GPT-A-20261116-01', at: '2026-11-16T10:00:00Z'}],
    }),
    msg({
      ref: 'reply-2', message_id: 'r2@x', thread_id: 'th-9',
      rulings: [{message_id: 'r2@x', decision_id: 'GPT-B-20261116-02', at: '2026-11-16T11:00:00Z'}],
    }),
  ]);
  const cluster = result.items[0];
  assert.equal(cluster.ruling_status, 'conflict');
  assert.equal(cluster.decision_id, null, '冲突时不得擅自挑一个裁决当结论');
  assert.deepEqual(cluster.decision_ids, ['GPT-A-20261116-01', 'GPT-B-20261116-02']);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].requires_review, true);
});

test('重复项状态 fail-closed：任一封 open 就不得因另一封 closed 判闭环', () => {
  const result = dedupeMessages([
    msg({ref: 'a', message_id: 'same@id', status: 'closed'}),
    msg({ref: 'b', message_id: 'same@id', status: 'open'}),
  ]);
  assert.equal(result.items[0].status, 'open');
  assert.equal(result.duplicates[0].original_status, 'open', '原始状态必须保留在重复项记录里');
});

test('输入顺序不影响聚合结果（稳定输出）', () => {
  const input = [
    msg({ref: 'a', message_id: 'a@x', thread_id: 'th-1', task_ids: [T1]}),
    msg({ref: 'b', message_id: 'b@x', thread_id: 'th-1', task_ids: []}),
    msg({ref: 'c', message_id: 'c@x', thread_id: 'th-3', task_ids: [T1]}),
    msg({ref: 'd', message_id: 'd@x', thread_id: null, task_ids: [T2]}),
  ];
  const signature = (res) => res.items
    .map((item) => `${item.ref}:${item.history.map((h) => h.ref).sort().join(',')}`)
    .sort()
    .join('|');
  const forward = signature(dedupeMessages(input));
  const backward = signature(dedupeMessages(input.slice().reverse()));
  assert.equal(forward, backward);
});

test('去重不修改输入对象', () => {
  const input = [msg({ref: 'a', message_id: 'a@x', task_ids: [T1], rulings: []})];
  const snapshot = JSON.stringify(input);
  dedupeMessages(input);
  assert.equal(JSON.stringify(input), snapshot);
});

test('空输入返回空结果而不是抛错', () => {
  const result = dedupeMessages([]);
  assert.equal(result.clusters, 0);
  assert.equal(result.items.length, 0);
  assert.equal(result.duplicates.length, 0);
});
