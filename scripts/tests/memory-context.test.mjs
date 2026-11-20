import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MEMORY_FILES,
  MEMORY_DIR,
  loadMemoryContext,
  assertMemoryComplete,
  buildMemoryBriefing,
  buildMemoryReadReceipt,
  renderMemoryRules
} from '../lib/memory-context.mjs';

function workspace(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-mem-'));
  const dir = path.join(root, MEMORY_DIR);
  fs.mkdirSync(dir);
  for (const name of MEMORY_FILES) {
    const body = overrides[name] ?? `# ${name.replace('.md', '')}\n\n> 校注：测试用 ${name}\n\n${name} 正文内容。\n`;
    fs.writeFileSync(path.join(dir, name), body);
  }
  return root;
}

test('loads all six memory files with sha256 and stable digest', () => {
  const root = workspace();
  const context = loadMemoryContext({root, commit: 'abc123', now: new Date('2026-11-20T00:00:00Z')});
  assert.equal(context.complete, true);
  assert.equal(context.missing.length, 0);
  assert.equal(context.files.length, 6);
  assert.equal(context.commit, 'abc123');
  for (const file of context.files) {
    assert.match(file.sha256, /^[0-9a-f]{64}$/);
    assert.ok(file.bytes > 0);
    assert.ok(file.title.length > 0);
    assert.match(file.annotation, /校注/);
  }
  assert.match(context.digest, /^[0-9a-f]{64}$/);

  const again = loadMemoryContext({root, commit: 'abc123', now: new Date('2026-11-20T00:00:00Z')});
  assert.equal(again.digest, context.digest);
});

test('digest changes when a memory file changes', () => {
  const root = workspace();
  const first = loadMemoryContext({root});
  fs.writeFileSync(path.join(root, MEMORY_DIR, '重要事件.md'), '# 重要事件\n\n新增一行。\n');
  const second = loadMemoryContext({root});
  assert.notEqual(first.digest, second.digest);
  assert.notEqual(first.files[5].sha256, second.files[5].sha256);
});

test('missing file is recorded, not silently ignored', () => {
  const root = workspace();
  fs.unlinkSync(path.join(root, MEMORY_DIR, '识神.md'));
  const context = loadMemoryContext({root});
  assert.equal(context.complete, false);
  assert.deepEqual(context.missing, ['识神.md']);
  assert.equal(context.files.find(file => file.name === '识神.md').missing, true);
  assert.throws(() => assertMemoryComplete(context), /missing_memory_files:识神\.md/);
});

test('briefing states that excerpts are not a full read', () => {
  const root = workspace();
  const context = loadMemoryContext({root, commit: 'deadbeef'});
  const briefing = buildMemoryBriefing(context, {maxCharsPerFile: 30});
  assert.match(briefing, /不是全文/);
  assert.match(briefing, /不得据此声称已完整阅读/);
  assert.match(briefing, /deadbeef/);
  assert.match(briefing, /## 魄\.md/);
  assert.match(briefing, /## 重要事件\.md/);
  assert.match(briefing, /摘录已截断/);
  assert.match(briefing, /ltzzz\.memory-read-receipt\.v1/);
});

test('briefing includes the eight mandatory reading rules', () => {
  const rules = renderMemoryRules();
  assert.match(rules, /owner 原话与 AI 解释分层/);
  assert.match(rules, /观察 ≠ 证明/);
  assert.match(rules, /历史快照 ≠ 今日状态/);
  assert.match(rules, /证据分四级/);
  const root = workspace();
  const briefing = buildMemoryBriefing(loadMemoryContext({root}));
  assert.match(briefing, /## 阅读纪律（强制）/);
});

test('read receipt marks every file complete and carries digest', () => {
  const root = workspace();
  const context = loadMemoryContext({root, commit: 'c0ffee'});
  const receipt = buildMemoryReadReceipt(context, {reader: 'desktop-gpt', readAt: new Date('2026-11-20T01:00:00Z')});
  assert.equal(receipt.reader, 'desktop-gpt');
  assert.equal(receipt.commit, 'c0ffee');
  assert.equal(receipt.complete, true);
  assert.equal(receipt.files.length, 6);
  assert.ok(receipt.files.every(file => file.complete_read === true));
  assert.throws(() => buildMemoryReadReceipt(context, {}), /reader_required/);
});

test('a missing file cannot be marked complete in the receipt', () => {
  const root = workspace();
  fs.unlinkSync(path.join(root, MEMORY_DIR, '梦境数据库.md'));
  const context = loadMemoryContext({root});
  const receipt = buildMemoryReadReceipt(context, {reader: 'desktop-gpt'});
  const missing = receipt.files.find(file => file.name === '梦境数据库.md');
  assert.equal(missing.complete_read, false);
  assert.equal(receipt.complete, false);
});
