import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {addRecord, appendRecord, assertRecord, isPublicUrl, readRecords} from '../lib/deterministic-store.js';

const record = (over = {}) => ({
  source_url: 'https://example.com/report',
  retrieved_at: '2026-11-20T03:00:00.000Z',
  content_sha256: 'a'.repeat(64),
  parser_version: 'html-v1',
  uncertainty: null,
  ...over,
});

test('缺字段、非公开来源、坏哈希、坏时间戳都被拒绝', () => {
  for (const field of ['source_url', 'retrieved_at', 'content_sha256', 'parser_version', 'uncertainty']) {
    const broken = record(); delete broken[field];
    assert.throws(() => assertRecord(broken), new RegExp('missing_field:' + field));
  }
  assert.throws(() => assertRecord(record({source_url: 'http://127.0.0.1/x'})), /private_or_invalid_source/);
  assert.throws(() => assertRecord(record({source_url: 'file:///etc/passwd'})), /private_or_invalid_source/);
  assert.throws(() => assertRecord(record({content_sha256: 'xyz'})), /invalid_content_sha256/);
  assert.throws(() => assertRecord(record({retrieved_at: 'not-a-date'})), /invalid_retrieved_at/);
  assert.throws(() => assertRecord(record({parser_version: ' '})), /invalid_parser_version/);
  assert.equal(assertRecord(record()).source_url, 'https://example.com/report');
});

test('来源允许名单可收紧，公网判断覆盖常见私网地址', () => {
  assert.equal(isPublicUrl('https://example.com/a'), true);
  assert.equal(isPublicUrl('http://192.168.1.2/a'), false);
  assert.equal(isPublicUrl('http://10.0.0.5/a'), false);
  assert.equal(isPublicUrl('https://localhost/a'), false);
  assert.throws(() => assertRecord(record(), {allowedHosts: ['public.example']}), /source_not_allowlisted/);
});

test('重复 URL+同哈希是幂等跳过，不产生第二条', () => {
  const first = appendRecord([], record());
  assert.equal(first.appended, true);
  assert.equal(first.reason, 'appended_new');
  const second = appendRecord(first.records, record());
  assert.equal(second.appended, false);
  assert.equal(second.reason, 'duplicate_content');
  assert.equal(second.records.length, 1);
});

test('同 URL 内容变化只追加更正，不覆盖历史字节', () => {
  const first = appendRecord([], record());
  const changed = appendRecord(first.records, record({content_sha256: 'b'.repeat(64)}));
  assert.equal(changed.appended, true);
  assert.equal(changed.reason, 'appended_correction');
  assert.equal(changed.records.length, 2);
  assert.equal(changed.records[0].content_sha256, 'a'.repeat(64));
  assert.equal(changed.records[1].supersedes, 'a'.repeat(64));
  assert.notEqual(changed.records, first.records);
});

test('addRecord 落盘后可读回，第二次重复不写盘', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-store-'));
  try {
    const file = path.join(dir, 'nested', 'records.json');
    assert.equal(addRecord(file, record()).appended, true);
    assert.equal(readRecords(file).length, 1);
    assert.equal(addRecord(file, record()).appended, false);
    assert.equal(readRecords(file).length, 1);
    const corrupt = path.join(dir, 'bad.json');
    fs.writeFileSync(corrupt, '{"not":"array"}');
    assert.throws(() => readRecords(corrupt), /records_not_array/);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});