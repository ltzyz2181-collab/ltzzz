#!/usr/bin/env node
/**
 * 记忆防膨胀：把指定目录下近期 md 收成一页 digest（只保留标题+首段+路径）
 * 用法: node scripts/weekly-memory-digest.mjs [dir=knowledge/results] [days=7]
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const dir = resolve(process.cwd(), process.argv[2] || 'knowledge/results');
const days = Number(process.argv[3] || 7);
const cutoff = Date.now() - days * 864e5;

const files = await readdir(dir);
const rows = [];
for (const name of files) {
  if (!name.endsWith('.md')) continue;
  const p = join(dir, name);
  const st = await stat(p);
  if (st.mtimeMs < cutoff) continue;
  const text = await readFile(p, 'utf8');
  const title = (text.match(/^#\s+(.+)$/m) || [, name])[1].trim();
  const body = text.replace(/^#.*$/m, '').trim().slice(0, 180).replace(/\s+/g, ' ');
  rows.push(`- **${title}** · \`${name}\`  \n  ${body}…`);
}
rows.sort();
const out = `# Weekly memory digest\n\n> auto · last ${days}d · ${new Date().toISOString().slice(0, 10)} · count=${rows.length}\n\n${rows.join('\n\n') || '_empty_'}\n`;
const outPath = join(dir, `weekly-digest-${new Date().toISOString().slice(0, 10)}.md`);
await writeFile(outPath, out);
console.log('wrote', outPath, 'items', rows.length);
