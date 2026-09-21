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

const day = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
const files = CORE.map((path) => {
  const exists = existsSync(path);
  const text = exists ? readFileSync(path, 'utf8') : '';
  return { path, exists, readable: exists, bytes: text.length, text };
});
const blob = files.map((f) => `## ${f.path}\n\n${f.text}`).join('\n\n---\n\n');
const memory_id = 'STATE-' + day + '-' + createHash('sha256').update(blob).digest('hex').slice(0, 12);

mkdirSync('memory/state', { recursive: true });
const md = [
  `# ${memory_id}`,
  '',
  `- generated_at: ${new Date().toISOString()}`,
  `- r2: pending bind (repo snapshot always written)`,
  `- AIs: GPT / 豆包 / Claude / Grok / DeepSeek / Microsoft`,
  '',
  '## probe',
  '',
  '| path | exists | readable | bytes |',
  '|------|--------|----------|-------|',
  ...files.map((f) => `| ${f.path} | ${f.exists} | ${f.readable} | ${f.bytes} |`),
  '',
  '## context',
  '',
  'Each AI must cite this memory_id in outputs.',
  '',
  blob.slice(0, 120000),
  '',
].join('\n');

writeFileSync(`memory/state/STATE-${day}.md`, md);
writeFileSync(
  'memory/state/CURRENT.json',
  JSON.stringify({ memory_id, state: `STATE-${day}`, generated_at: new Date().toISOString(), files: files.map(({ text, ...r }) => r) }, null, 2),
);
console.log(memory_id);
