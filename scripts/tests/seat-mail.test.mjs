import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMailIssue, evaluateRelayPermission, issueClosure} from '../seat-mail.mjs';

test('sent and duplicate mail cards close; blocked cards stay open', () => {
  assert.deepEqual(issueClosure('sent'), {state: 'closed', state_reason: 'completed'});
  assert.deepEqual(issueClosure('duplicate'), {state: 'closed', state_reason: 'not_planned'});
  assert.equal(issueClosure('blocked'), null);
  assert.equal(issueClosure('failed_smtp'), null);
});

test('parses seat, recipient, subject and body from a relay card', () => {
  const m = parseMailIssue({
    title: 'mail: 给豆包的派单',
    body: ['seat: claude', 'to: doubao@example.com', 'subject: 取件通知', '', '---', '', '请处理 #439。'].join('\n'),
  });
  assert.equal(m.seat, 'claude');
  assert.equal(m.to, 'doubao@example.com');
  assert.equal(m.subject, '取件通知');
  assert.match(m.body, /请处理 #439/);
});

test('falls back to the title and never invents a recipient', () => {
  const m = parseMailIssue({title: 'mail: 早会纪要', body: '正文'});
  assert.equal(m.to, '');
  assert.equal(m.subject, '早会纪要');
});

test('解析 P4 线程字段：in_reply_to / references / dedupe_key', () => {
  const m = parseMailIssue({
    title: 'mail: 回信',
    body: [
      'seat: desktop-gpt',
      'to: ltzyz2181@gmail.com',
      'subject: Re: 裁决',
      'in_reply_to: <abc@qq.com>',
      'references: <root@x> <abc@qq.com>',
      'dedupe_key: PAYOUT-REQ-01',
      '',
      '---',
      '',
      '正文',
    ].join('\n'),
  });
  assert.equal(m.inReplyTo, '<abc@qq.com>');
  assert.deepEqual(m.references, ['<root@x>', '<abc@qq.com>']);
  assert.equal(m.dedupeKey, 'PAYOUT-REQ-01');
});

test('没有线程字段时给空值，不编造父消息', () => {
  const m = parseMailIssue({title: 'mail: 普通通知', body: 'to: a@b.com\nsubject: S\n\n---\n\n正文'});
  assert.equal(m.inReplyTo, '');
  assert.deepEqual(m.references, []);
  assert.equal(m.dedupeKey, '');
});

const metaRegistry = {
  seats: [
    {id: 'owner', address: 'ltzyz2181@gmail.com'},
    {id: 'doubao', address: 'qingqizhu6502@agent.qq.com'},
    {id: 'desktop_gpt', address: '306122054@qq.com'},
    {id: 'meta', address: '306122054@qq.com'},
    {id: 'qianwen', address: null},
  ],
  relay_permissions: {
    default: {enabled: true},
    seats: {
      meta: {
        enabled: true,
        recipients: ['owner', 'doubao', 'desktop_gpt'],
        daily_cap: 2,
        max_body_bytes: 32,
      },
    },
  },
};

test('owner 2026-11-23: Meta may queue mail to an allowed registered recipient', () => {
  const result = evaluateRelayPermission({
    registry: metaRegistry,
    seat: 'did:ltzzz:meta',
    to: 'ltzyz2181@gmail.com',
    bodyBytes: 10,
    ledger: {entries: []},
    now: '2026-11-23T03:00:00.000Z',
  });
  assert.equal(result.allowed, true);
  assert.equal(result.policy_id, 'meta');
});

test('Meta cannot mail an address outside the granted list', () => {
  const result = evaluateRelayPermission({
    registry: metaRegistry,
    seat: 'meta',
    to: 'stranger@example.com',
    bodyBytes: 10,
    ledger: {entries: []},
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'recipient_not_allowed');
});

test('Meta daily cap counts only today and its own sends', () => {
  const ledger = {entries: [
    {seat: 'meta', ts: '2026-11-23T01:00:00.000Z'},
    {seat: 'meta', ts: '2026-11-23T02:00:00.000Z'},
    {seat: 'desktop-gpt', ts: '2026-11-23T02:30:00.000Z'},
    {seat: 'meta', ts: '2026-11-22T23:00:00.000Z'},
  ]};
  const result = evaluateRelayPermission({
    registry: metaRegistry,
    seat: 'meta',
    to: 'ltzyz2181@gmail.com',
    bodyBytes: 10,
    ledger,
    now: '2026-11-23T03:00:00.000Z',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'daily_cap_reached');
});

test('Meta body over the granted byte cap is blocked', () => {
  const result = evaluateRelayPermission({
    registry: metaRegistry,
    seat: 'meta',
    to: 'ltzyz2181@gmail.com',
    bodyBytes: 33,
    ledger: {entries: []},
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'body_too_large');
});

test('a seat without an explicit entry keeps its historical access', () => {
  const result = evaluateRelayPermission({
    registry: metaRegistry,
    seat: 'desktop-gpt',
    to: 'ltzyz2181@gmail.com',
    bodyBytes: 99999,
    ledger: {entries: []},
  });
  assert.equal(result.allowed, true);
});
