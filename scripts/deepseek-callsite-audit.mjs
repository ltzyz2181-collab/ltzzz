#!/usr/bin/env node
// Read-only audit: which call sites reach call-deepseek.mjs and whether they
// state `thinking` explicitly. The default in call-deepseek.mjs is
// thinking='enabled'; a long card under that default can return
// finish_reason=length with zero output (measured 2026-11-17), so every caller
// should say what it wants instead of inheriting it.
//
// Heuristic by design: it reads the balanced argument list of each call and
// looks for a `thinking` key. It never executes the scanned code.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const SKIP_DIRS = new Set(['node_modules', '.git', 'tests', '__tests__', 'fixtures']);

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (source.charCodeAt(i) === 10) line += 1;
  return line;
}

function matchParen(source, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === String.fromCharCode(96)) { quote = ch; continue; }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function scanSource(source, file = '<inline>') {
  const aliases = new Set();
  for (const m of source.matchAll(/import\s*{([^}]+)}\s*from\s*['"][^'"]*call-deepseek\.mjs['"]/g)) {
    for (const part of m[1].split(',')) {
      const seg = part.trim();
      if (!seg) continue;
      const as = /\bas\s+([A-Za-z_$][\w$]*)$/.exec(seg);
      aliases.add(as ? as[1] : seg);
    }
  }
  if (aliases.size === 0 && /(call-deepseek\.mjs|p\.module)/.test(source) && /\bcallAgent\s*\(/.test(source)) aliases.add('callAgent');
  const rows = [];
  for (const alias of aliases) {
    const re = new RegExp('\\b' + alias.replace(/[$]/g, '\\$') + '\\s*\\(', 'g');
    for (const m of source.matchAll(re)) {
      const open = source.indexOf('(', m.index);
      const end = matchParen(source, open);
      if (end < 0) continue;
      const args = source.slice(open + 1, end);
      rows.push({
        file,
        line: lineOf(source, m.index),
        alias,
        explicit_thinking: /(^|[{,\s])thinking\s*(?=[:,}])/.test(args),
      });
    }
  }
  return rows.sort((a, b) => a.line - b.line);
}

export function walk(root, out = []) {
  for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.name.endsWith('.mjs') && entry.name !== 'deepseek-callsite-audit.mjs') {
      out.push(full);
    }
  }
  return out;
}

export function audit(root = 'scripts') {
  const rows = [];
  for (const file of walk(root)) {
    const source = fs.readFileSync(file, 'utf8');
    if (!/(call-deepseek\.mjs|p\.module)/.test(source)) continue;
    rows.push(...scanSource(source, file.split(path.sep).join('/')));
  }
  return rows;
}

export function main(argv = process.argv.slice(2)) {
  const strict = argv.includes('--strict');
  const rows = audit(argv.find(a => !a.startsWith('--')) || 'scripts');
  console.log('| file | line | alias | thinking |');
  console.log('|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.file} | ${r.line} | ${r.alias} | ${r.explicit_thinking ? 'explicit' : 'IMPLICIT (inherits default)'} |`);
  const implicit = rows.filter(r => !r.explicit_thinking);
  console.log(`\ncall sites: ${rows.length}; implicit: ${implicit.length}`);
  if (strict && implicit.length) {
    console.error('implicit_thinking_call_sites=' + implicit.length);
    return 1;
  }
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath && invokedPath === import.meta.url) process.exitCode = main();