import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  LEDGER_SCHEMA,
  appendEntry,
  attachImapMessageId,
  bodySha256,
  buildThreadHeaders,
  emptyLedger,
  isDuplicate,
  mergeReferences,
  normalizeMessageId,
  parseLedger,
  serializeLedger,
} from '../lib/mail-thread.mjs';

test('message_id 规范化', () => {
  assert.equal(normalizeMessageId('  <a@b> '), '<a@b>');
  assert.equal(normalizeMessageId('a@b'), '<a@b>');
  assert.equal(normalizeMessageId('<a b>'), null);
  assert.equal(normalizeMessageId(''), null);
  assert.equal(normalizeMessageId(null), null);
});

test('References 去重且保持顺序', () => {
  assert.deepEqual(mergeReferences(['<a@x>', 'b@x', '<a@x>', '', null]), ['<a@x>', '<b@x>']);
});

test('父消息必须落在 References 末尾', () => {
  const t = buildThreadHeaders({inReplyTo: 'p@x', references: ['<a@x>', '<p@x>']});
  assert.equal(t.inReplyTo, '<p@x>');
  assert.deepEqual(t.references, ['<a@x>', '<p@x>']);
  assert.equal(t.referencesHeader, '<a@x> <p@x>');
});

test('没有父消息时不产生线程头', () => {
  const t = buildThreadHeaders({});
  assert.equal(t.inReplyTo, null);
  assert.deepEqual(t.references, []);
  assert.equal(t.referencesHeader, '');
});

test('同 dedupe_key 在 24h 内判为重复', () => {
  const now = Date.parse('2026-11-21T12:00:00Z');
  const ledger = {schema: LEDGER_SCHEMA, entries: [{ts: '2026-11-21T10:00:00Z', dedupe_key: 'K1', smtp_message_id: '<m@x>'}]};
  const d = isDuplicate(ledger, {dedupeKey: 'K1', now});
  assert.equal(d.duplicate, true);
  assert.equal(d.reason, 'dedupe_key');
});

test('超出窗口后允许重发', () => {
  const now = Date.parse('2026-11-21T12:00:00Z');
  const ledger = {schema: LEDGER_SCHEMA, entries: [{ts: '2026-11-19T10:00:00Z', dedupe_key: 'K1', smtp_message_id: '<m@x>'}]};
  const d = isDuplicate(ledger, {dedupeKey: 'K1', now});
  assert.equal(d.duplicate, false);
});

test('标签移除失败时按正文哈希兜住重发', () => {
  const now = Date.parse('2026-11-21T12:00:00Z');
  const sha = bodySha256('同一封正文');
  const ledger = {schema: LEDGER_SCHEMA, entries: [{ts: '2026-11-21T11:00:00Z', to: 'a@b.com', subject: 'S', body_sha256: sha, smtp_message_id: '<m@x>'}]};
  const d = isDuplicate(ledger, {to: 'A@B.com ', subject: 'S', bodySha: sha, now});
  assert.equal(d.duplicate, true);
  assert.equal(d.reason, 'same_body');
});

test('未成功发送的条目不算重复', () => {
  const now = Date.parse('2026-11-21T12:00:00Z');
  const ledger = {schema: LEDGER_SCHEMA, entries: [{ts: '2026-11-21T11:00:00Z', dedupe_key: 'K1', smtp_message_id: null}]};
  assert.equal(isDuplicate(ledger, {dedupeKey: 'K1', now}).duplicate, false);
});

test('台账写入有上限且保留最新', () => {
  let ledger = emptyLedger();
  for (let i = 0; i < 5; i += 1) ledger = appendEntry(ledger, {ts: 't' + i, smtp_message_id: '<' + i + '@x>'}, {maxEntries: 3});
  assert.equal(ledger.entries.length, 3);
  assert.equal(ledger.entries.at(-1).ts, 't4');
});

test('损坏的台账不抛错，回落为空', () => {
  assert.deepEqual(parseLedger('not json'), emptyLedger());
  assert.deepEqual(parseLedger('{"schema":"other","entries":[]}'), emptyLedger());
});

test('序列化可往返', () => {
  const ledger = appendEntry(emptyLedger(), {ts: '2026-11-21T00:00:00Z', dedupe_key: 'K', smtp_message_id: '<a@x>'});
  const round = parseLedger(serializeLedger(ledger));
  assert.deepEqual(round, ledger);
});

test('imap_message_id 单独记，不覆盖 smtp_message_id', () => {
  const ledger = appendEntry(emptyLedger(), {dedupe_key: 'K', smtp_message_id: '<smtp@x>', imap_message_id: null});
  const next = attachImapMessageId(ledger, {dedupeKey: 'K', imapMessageId: 'reply@x'});
  assert.equal(next.entries[0].smtp_message_id, '<smtp@x>');
  assert.equal(next.entries[0].imap_message_id, '<reply@x>');
});

test('正文哈希稳定', () => {
  assert.equal(bodySha256('abc'), bodySha256('abc'));
  assert.notEqual(bodySha256('abc'), bodySha256('abd'));
});
