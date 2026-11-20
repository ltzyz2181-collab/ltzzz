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
