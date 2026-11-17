// 裁决回执跟踪测试：问答配对、同线程多封回复保留、未读提醒、读取失败 fail-closed。
// 对应工单 §一.3「把 track-gpt-rulings 接入每日流程」与 §一.5「历史裁决不丢失」。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXTERNAL_DECIDER,
  SELF,
  TRACKER_SCHEMA,
  buildTracker,
  collectMessages,
  extractDecisionIds,
  listMessages,
  redactSubject,
} from '../track-gpt-rulings.mjs';

const NOW = new Date('2026-11-17T12:00:00Z');

function inboxMessage(overrides = {}) {
  return {
    dir: 'inbox',
    id: overrides.id || 'reply-1',
    at: overrides.at || '2026-11-16T19:51:49Z',
    from: overrides.from || EXTERNAL_DECIDER,
    subject: overrides.subject || 'Re: Phase1 六项安全要求落地核对',
    subject_short: overrides.subject_short || 'Re: Phase1 六项安全要求落地核对',
    read: overrides.read ?? false,
    inReplyTo: overrides.inReplyTo ?? null,
    task_ids: overrides.task_ids || [],
    decision_ids: overrides.decision_ids || ['GPT-HIRE-PHASE1-SECURITY-20261116-01'],
  };
}

function sentMessage(overrides = {}) {
  return {
    dir: 'sent',
    id: overrides.id || 'ask-1',
    at: overrides.at || '2026-11-16T10:00:00Z',
    from: SELF,
    subject: overrides.subject || 'Phase1 六项安全要求落地核对｜请裁决',
    subject_short: overrides.subject_short || 'Phase1 六项安全要求落地核对｜请裁决',
    read: true,
    inReplyTo: null,
    task_ids: overrides.task_ids || [],
    decision_ids: overrides.decision_ids || [],
  };
}

test('decision_id 提取与主题脱敏', () => {
  assert.deepEqual(
    extractDecisionIds('见 GPT-HIRE-PHASE1-20261116-01 与 gpt-wallet-v1-20261116-01'),
    ['GPT-HIRE-PHASE1-20261116-01', 'GPT-WALLET-V1-20261116-01'],
  );
  const redacted = redactSubject('付款 128.50 USDT / ¥9.90 token sk-ant-abcdefghijklmnopqrstuvwxyz0123');
  assert.ok(!redacted.includes('128.50'));
  assert.ok(!redacted.includes('9.90'));
  assert.ok(!redacted.includes('sk-ant-abcdefghijklmnopqrstuvwxyz0123'));
});

test('按 in_reply_to 精确配对：回信挂到正确的问题线程', () => {
  const inbox = [inboxMessage({id: 'reply-1', inReplyTo: 'ask-1'})];
  const sent = [sentMessage({id: 'ask-1'}), sentMessage({id: 'ask-2', at: '2026-11-15T09:00:00Z', subject: '另一个问题｜请裁决', subject_short: '另一个问题｜请裁决'})];
  const doc = buildTracker({inbox, sent, now: NOW, windowDays: 21});
  assert.equal(doc.schema, TRACKER_SCHEMA);
  const answered = doc.items.find((item) => item.last_ask_id === 'ask-1');
  assert.ok(answered, 'ask-1 必须出现在跟踪账本里');
  assert.equal(answered.status, 'answered');
  assert.equal(answered.reply_count, 1);
  const pending = doc.items.find((item) => item.last_ask_id === 'ask-2');
  assert.equal(pending.status, 'pending_no_reply');
  assert.equal(doc.counts.pending_over_24h, 1);
});

test('同一线程多封回复全部保留，不被最后一封覆盖', () => {
  const inbox = [
    inboxMessage({id: 'reply-1', at: '2026-11-16T19:51:49Z', inReplyTo: 'ask-1', decision_ids: ['GPT-HIRE-PHASE1-SECURITY-20261116-01']}),
    inboxMessage({id: 'reply-2', at: '2026-11-16T19:54:37Z', inReplyTo: 'ask-1', decision_ids: ['GPT-HIRE-PHASE1-SECURITY-20261116-01', 'GPT-HIRE-PHASE1-SECURITY-20261116-01-ADDENDUM-01']}),
  ];
  const sent = [sentMessage({id: 'ask-1'})];
  const doc = buildTracker({inbox, sent, now: NOW, windowDays: 21});
  const item = doc.items[0];
  assert.equal(item.reply_count, 2);
  assert.deepEqual(item.replies.map((reply) => reply.id), ['reply-1', 'reply-2']);
  assert.deepEqual(item.rulings.map((ruling) => ruling.message_id), ['reply-1', 'reply-2']);
  assert.deepEqual(item.decision_ids, [
    'GPT-HIRE-PHASE1-SECURITY-20261116-01',
    'GPT-HIRE-PHASE1-SECURITY-20261116-01-ADDENDUM-01',
  ]);
  assert.equal(item.decision_id, null, '多个裁决不得擅自挑一个当唯一结论');
  assert.equal(item.status, 'answered');
});

test('未读回信进入 consume_gate，提醒当天必须读正文', () => {
  const inbox = [inboxMessage({id: 'reply-1', read: false, at: '2026-11-17T11:00:00Z', inReplyTo: 'ask-1'})];
  const sent = [sentMessage({id: 'ask-1'})];
  const doc = buildTracker({inbox, sent, now: NOW, windowDays: 21});
  assert.equal(doc.items[0].await_evidence, 'reply_unread');
  assert.equal(doc.counts.answered_but_unread, 1);
  assert.equal(doc.consume_gate.length, 1);
  assert.equal(doc.consume_gate[0].reply_id, 'reply-1');
  assert.ok(doc.alerts.some((alert) => alert.kind === 'reply_unread'));
});

test('非裁决席来信不计入裁决', () => {
  const inbox = [inboxMessage({id: 'other-1', from: 'someone@example.com', inReplyTo: 'ask-1'})];
  const sent = [sentMessage({id: 'ask-1'})];
  const doc = buildTracker({inbox, sent, now: NOW, windowDays: 21});
  assert.equal(doc.items[0].status, 'pending_no_reply');
  assert.equal(doc.counts.answered, 0);
});

test('回信早于最后一次追问时标 answered_before_last_ask', () => {
  const inbox = [inboxMessage({id: 'reply-1', at: '2026-11-16T10:30:00Z', inReplyTo: 'ask-old'})];
  // 同一线程（同主题）第二次追问：早先的回信不能算作对最后一次追问的答复。
  const sent = [
    sentMessage({id: 'ask-old', at: '2026-11-16T10:00:00Z'}),
    sentMessage({id: 'ask-new', at: '2026-11-17T10:00:00Z'}),
  ];
  const doc = buildTracker({inbox, sent, now: NOW, windowDays: 21});
  const item = doc.items.find((entry) => entry.last_ask_id === 'ask-new');
  assert.equal(item.status, 'answered_before_last_ask');
});

test('collectMessages 只保留可公开字段，不把正文带进来', () => {
  const mapped = collectMessages([
    {message_id: 'm1', created_at: '2026-11-17T00:00:00Z', from: {email: EXTERNAL_DECIDER}, subject: 'Re: 裁决', body: 'SECRET BODY', is_read: false},
  ], 'inbox');
  assert.equal(mapped.length, 1);
  assert.equal('body' in mapped[0], false);
  assert.equal(mapped[0].task_ids.length, 0);
  assert.equal(mapped[0].decision_ids.length, 0);
});

test('收件箱读取失败时抛错，由调用方写 unknown 而不是 0', () => {
  assert.throws(() => listMessages('inbox', 10, {cli: '/nonexistent/agently-cli', root: '/tmp'}));
});
