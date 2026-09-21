#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const CORE = [
  'ltzzz-memory/README.md',
  'ltzzz-memory/装备论.md',
  'ltzzz-memory/魄.md',
  'ltzzz-memory/识神.md',
  'ltzzz-memory/梦境数据库.md',
  'ltzzz-memory/文明研究.md',
  'ltzzz-memory/项目历史.md',
  'ltzzz-memory/重要事件.md',
  'lab/MEMORY.md',
  'lab/DECISIONS.md',
  'lab/tasks.md',
];

const timestamp = new Date().toISOString();
const day = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');

const loaded = CORE.map((path) => {
  if (!existsSync(path)) return { path, read: false, text: '', bytes: 0 };
  const text = readFileSync(path, 'utf8');
  return { path, read: Boolean(text), text, bytes: text.length };
});

const files_read = loaded.filter((f) => f.read).map((f) => f.path);
const files_missing = loaded.filter((f) => !f.read).map((f) => f.path);
const blob = loaded.filter((f) => f.read).map((f) => `## ${f.path}\n\n${f.text}`).join('\n\n---\n\n');
const snapshot_hash = createHash('sha256').update(blob).digest('hex');
const memory_id = 'STATE-' + day + '-' + snapshot_hash.slice(0, 12);

mkdirSync('memory/state', { recursive: true });
const current = { memory_id, files_read, files_missing, snapshot_hash, timestamp, bytes: blob.length, mode: 'real-read' };
writeFileSync('memory/state/CURRENT.json', JSON.stringify(current, null, 2));
writeFileSync(
  `memory/state/${memory_id}.md`,
  [
    `# ${memory_id}`,
    '',
    `- snapshot_hash: ${snapshot_hash}`,
    `- timestamp: ${timestamp}`,
    `- files_read: ${files_read.length}`,
    `- files_missing: ${files_missing.length ? files_missing.join(', ') : '(none)'}`,
    '',
    blob.slice(0, 120000),
    '',
  ].join('\n'),
);
console.log(JSON.stringify(current));
