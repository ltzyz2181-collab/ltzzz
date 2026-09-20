#!/usr/bin/env node
/**
 * 生成 ltzzz-memory/manifest.json
 * 扫描：ltzzz-memory/**、lab 关键记忆文件、memory/daily/**
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();

const READ_ORDER = [
  'ltzzz-memory/README.md',
  'lab/MEMORY.md',
  'lab/DECISIONS.md',
  'lab/tasks.md',
  'lab/CAPABILITY_MAP.md',
  'ltzzz-memory/重要事件.md',
  'ltzzz-memory/项目历史.md',
  'ltzzz-memory/装备论.md',
  'ltzzz-memory/魄.md',
  'ltzzz-memory/识神.md',
  'ltzzz-memory/memory-engine.md',
  'ltzzz-memory/LTZZZ-OS.md',
];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'manifest.json' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(md|json|txt)$/i.test(name)) acc.push(p);
  }
  return acc;
}

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

const files = [];
for (const p of walk(path.join(ROOT, 'ltzzz-memory'))) files.push(p);
for (const p of walk(path.join(ROOT, 'memory', 'daily'))) files.push(p);

const labExtras = [
  'lab/MEMORY.md',
  'lab/DECISIONS.md',
  'lab/tasks.md',
  'lab/CAPABILITY_MAP.md',
  'lab/README.md',
];
for (const r of labExtras) {
  const abs = path.join(ROOT, r);
  if (fs.existsSync(abs)) files.push(abs);
}

const entries = [];
const seen = new Set();
for (const abs of files) {
  const r = rel(abs);
  if (seen.has(r)) continue;
  seen.add(r);
  const buf = fs.readFileSync(abs);
  entries.push({
    path: r,
    bytes: buf.length,
    sha256_16: sha256(buf),
  });
}
entries.sort((a, b) => a.path.localeCompare(b.path));

const manifest = {
  version: 1,
  generated_at: new Date().toISOString(),
  repo: 'ltzyz2181-collab/ltzzz',
  branch: 'main',
  read_order: READ_ORDER.filter((p) => seen.has(p) || fs.existsSync(path.join(ROOT, p))),
  files: entries.map((e) => e.path),
  file_meta: entries,
  gateway: {
    health: '/health',
    manifest: '/manifest',
    file: '/file?path=',
    bundle: '/bundle?paths=',
  },
  rules: [
    'AI long tasks must read read_order first when available.',
    'proposed memory != applied memory; human confirms high-impact writes.',
    'No secrets, private keys, or payment credentials in memory files.',
  ],
};

const out = path.join(ROOT, 'ltzzz-memory', 'manifest.json');
fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${out} (${entries.length} files)`);
