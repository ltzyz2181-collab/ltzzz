import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMailIssue} from '../seat-mail.mjs';

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
