// 裁决回执跟踪测试：问答配对、同线程多封回复保留、未读提醒、读取失败 fail-closed。
// 对应工单 §一.3「把 track-gpt-rulings 接入每日流程」与 §一.5「历史裁决不丢失」。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXTERNAL_DECIDER,
  SELF,
  TRACKER_SCHEMA,
  buildConsumedLedger,
  buildTracker,
  collectMessages,
  extractDecisionIds,
  isAskMessage,
  listMessages,
  redactSubject,
} from '../track-gpt-rulings.mjs';
import {classifyAgentlyError, resolveAgentlyCli} from '../mail/agently-cli.mjs';

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

test('原始问信「Re: [GPT总控派单]」没有裁决关键词也计入提问', () => {
  assert.equal(isAskMessage({subject: 'Re: [GPT总控派单] LTZZZ-MAIL-INTAKE-RECONCILIATION-20261123-01'}), true);
  assert.equal(isAskMessage({subject: 'Re: [LTZZZ][GPT总控派单] 口径修正'}), true);
  assert.equal(isAskMessage({subject: '日常同步'}), false);
});

test('thread_id 优先于主题：改主题的回复仍挂回同一线程', () => {
  const sent = [sentMessage({
    id: 'ask-1',
    subject: 'Re: [GPT总控派单] 邮件摄入对账',
    subject_short: 'Re: [GPT总控派单] 邮件摄入对账',
  })];
  // 主题完全不同，但 thread_id 相同。
  const inbox = [{
    dir: 'inbox',
    id: 'reply-1',
    at: '2026-11-16T19:51:49Z',
    from: EXTERNAL_DECIDER,
    subject: 'Re: 另一个标题',
    subject_short: 'Re: 另一个标题',
    read: true,
    inReplyTo: null,
    thread_id: 'thread-abc',
    task_ids: [],
    decision_ids: ['GPT-MAIL-20261123-01'],
  }];
  sent[0].thread_id = 'thread-abc';
  const doc = buildTracker({inbox, sent, now: NOW, windowDays: 21});
  assert.equal(doc.items.length, 1);
  assert.equal(doc.items[0].thread, 'thread:thread-abc');
  assert.equal(doc.items[0].reply_count, 1);
  assert.equal(doc.items[0].status, 'answered');
});

test('已消费账本按 message_id 精确命中：不再进 consume_gate，也不误伤同线程新回复', () => {
  const ledger = buildConsumedLedger([{
    ledger_file: 'rulings-consumed-2026-11-22.json',
    items: [{
      message_id: '<REPLY-1@X>',
      thread_key: 'thread:thread-abc',
      task_ids: ['LTZZZ-MAIL-INTAKE-RECONCILIATION-20261123-01'],
      consumed_at: '2026-11-22T12:00:00Z',
    }],
  }]);
  const sent = [sentMessage({id: 'ask-1', thread_id: 'thread-abc'})];
  const consumedReply = {
    dir: 'inbox', id: '<reply-1@x>', at: '2026-11-22T10:00:00Z', from: EXTERNAL_DECIDER,
    subject: 'Re: 裁决', subject_short: 'Re: 裁决', read: false, inReplyTo: 'ask-1',
    thread_id: 'thread-abc', task_ids: [], decision_ids: ['GPT-MAIL-20261123-01'],
  };
  const doc = buildTracker({inbox: [consumedReply], sent, now: NOW, windowDays: 21, consumedLedger: ledger});
  const item = doc.items[0];
  assert.equal(item.await_evidence, 'reply_consumed');
  assert.equal(item.last_reply_consumed, true);
  assert.equal(item.replies[0].consumed, true);
  assert.equal(item.replies[0].consumed_match, 'message_id');
  assert.equal(doc.counts.answered_consumed, 1);
  assert.equal(doc.consume_gate.length, 0);

  // 同 thread_id/thread_key 的新回复：只给审计提示，不得自动标已消费。
  const newReply = {...consumedReply, id: '<reply-2@x>', at: '2026-11-23T10:00:00Z'};
  const fresh = buildTracker({inbox: [consumedReply, newReply], sent, now: NOW, windowDays: 21, consumedLedger: ledger});
  const freshItem = fresh.items[0];
  assert.equal(freshItem.last_reply_consumed, false);
  assert.equal(freshItem.replies.find((r) => r.id === '<reply-2@x>').consumed, false);
  assert.equal(freshItem.await_evidence, 'reply_unread');
  assert.equal(fresh.consume_gate.length, 1);
});

test('messages 形状的已消费账本（2026-11-19..22）也被识别，thread 字段不当作 thread_key', () => {
  const ledger = buildConsumedLedger([{
    ledger_file: 'rulings-consumed-2026-11-22.json',
    count: 1,
    messages: [{
      message_id: 'msg_S1XN1G1rI35-AHYRK9vKRalPZasrctIgzOsjMuNOsoSrag',
      thread: 'Re: [LTZZZ][回执] 2026-11-18 豆包504修复已部署',
      at: '2026-11-20T20:51:14Z',
      decision_id: 'OWNER-DIRECT-20261119-DEEP-EXECUTOR-DELEGATION',
      status: 'consumed',
    }],
  }]);
  assert.equal(ledger.count, 1);
  const id = 'msg_s1xn1g1ri35-ahyrk9vkralpzasrctigzosjmunososrag';
  const hit = ledger.byMessageId.get(id);
  assert.ok(hit, 'messages 数组里的 message_id 必须进入索引');
  assert.equal(hit.ledger_file, 'rulings-consumed-2026-11-22.json');
  assert.equal(hit.consumed_at, '2026-11-20T20:51:14Z');
  assert.equal(hit.thread_key, null, 'thread 是主题，不是 thread_id，不能当审计键');
  assert.equal(ledger.files[0].consumed_count, 1);
  assert.equal(ledger.byThreadKey.size, 0);
});

test('items 与 messages 两种账本混合时都生效，同一条不重复计数', () => {
  const ledger = buildConsumedLedger([
    {ledger_file: 'rulings-consumed-2026-11-23.json', items: [
      {message_id: '<A@x>', task_ids: ['TASK-A'], consumed_at: '2026-11-23T01:00:00Z'},
      {message_id: '<B@x>', task_ids: ['TASK-B'], consumed_at: '2026-11-23T02:00:00Z'},
    ]},
    {ledger_file: 'rulings-consumed-2026-11-22.json', count: 3, messages: [
      {message_id: '<A@x>', at: '2026-11-22T01:00:00Z'},
      {message_id: '<C@x>', at: '2026-11-22T02:00:00Z'},
      {message_id: '<D@x>', at: '2026-11-22T03:00:00Z'},
    ]},
  ]);
  assert.deepEqual([...ledger.byMessageId.keys()].sort(), ['a@x', 'b@x', 'c@x', 'd@x']);
  assert.equal(ledger.files.length, 2);
  assert.equal(ledger.files[1].consumed_count, 3);
});

test('agently-cli 缺失分类为 BLOCKED_EVIDENCE，不伪装成成功或普通失败', () => {
  const error = Object.assign(new Error('spawnSync agently-cli ENOENT'), {code: 'ENOENT'});
  const blocked = classifyAgentlyError(error, {bin: 'agently-cli'});
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.block_code, 'BLOCKED_EVIDENCE');
  assert.equal(blocked.error_class, 'ENOENT');
  const timeout = classifyAgentlyError(Object.assign(new Error('timed out'), {killed: true}), {bin: 'agently-cli'});
  assert.equal(timeout.status, 'failed');
  assert.equal(timeout.error_class, 'timeout');
});

test('resolveAgentlyCli 优先 AGENTLY_CLI，其次 npm 全局目录，最后 PATH', () => {
  const envHit = resolveAgentlyCli({env: {AGENTLY_CLI: '/opt/bin/agently-cli'}, exists: () => false});
  assert.deepEqual(envHit, {bin: '/opt/bin/agently-cli', source: 'env', found: true});
  const npmHit = resolveAgentlyCli({
    env: {}, home: '/home/user', platform: 'linux',
    exists: (candidate) => candidate === '/home/user/.npm-global/bin/agently-cli',
  });
  assert.equal(npmHit.source, 'npm-global');
  assert.equal(npmHit.found, true);
  const missing = resolveAgentlyCli({env: {}, home: '/home/user', platform: 'linux', exists: () => false});
  assert.equal(missing.found, false);
  assert.equal(missing.source, 'unresolved');
});
