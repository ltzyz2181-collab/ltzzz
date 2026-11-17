#!/usr/bin/env node
// ANS 三层绑定：append-only binding index 构建器。
// 裁决依据：GPT 2026-11-11「ANS 允许补 run_id / source_commit，但不得改写既有六个 sidecar 原件；
// 用 companion metadata / append-only binding index 承载绑定关系」。
//
// 本脚本只读原件、只追加索引；原件字节与 mtime 一律不改。
//
// 用法：
//   node scripts/ans-binding-index.mjs build --days 2026-11-07,2026-11-08,2026-11-09 [--dry-run]
//   node scripts/ans-binding-index.mjs verify
//   node scripts/ans-binding-index.mjs stats

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REVISION = 'ans-binding-v1';
export const SCHEMA = 'ltzzz.ans.binding.v1';
export const DEFAULT_INDEX_PATH = 'knowledge/results/ans-cycle/binding-index.jsonl';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

export function sha256OfFile(absPath) {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex');
}

function nowUtc() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function readJsonl(text) {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  return lines.map((l, i) => {
    try {
      return JSON.parse(l);
    } catch (err) {
      throw new Error(`binding-index 第 ${i + 1} 行不是合法 JSON：${err.message}`);
    }
  });
}

export function dedupeKey(rec) {
  return `${rec.artifact_path}|${rec.artifact_sha256_recomputed}|${rec.run_id}`;
}

// 从主回执（YYYY-MM-DD.json）的 artifacts[] 派生绑定记录。
export function buildBindingsForDay({ repoRoot = REPO_ROOT, day }) {
  const receiptRel = `knowledge/results/ans-cycle/${day}.json`;
  const receiptAbs = path.join(repoRoot, receiptRel);
  if (!existsSync(receiptAbs)) throw new Error(`主回执不存在：${receiptRel}`);
  const receipt = JSON.parse(readFileSync(receiptAbs, 'utf8'));
  const runId = receipt.run_id ?? null;
  const sourceCommit = receipt.source_commit ?? null;
  const receiptSha = sha256OfFile(receiptAbs);
  const artifacts = Array.isArray(receipt.artifacts) ? receipt.artifacts : [];
  if (artifacts.length === 0) throw new Error(`${receiptRel} 的 artifacts 为空，无法派生绑定`);
  const boundAt = nowUtc();
  return artifacts.map((a) => {
    const artifactRel = a.path;
    if (!artifactRel) throw new Error(`${receiptRel} 的 artifact 缺 path`);
    const artifactAbs = path.join(repoRoot, artifactRel);
    const recomputed = existsSync(artifactAbs) ? sha256OfFile(artifactAbs) : null;
    const claimed = a.sha256 ?? null;
    const binding = recomputed && claimed && recomputed === claimed ? 'match' : 'mismatch';
    return {
      schema: SCHEMA,
      revision: REVISION,
      bound_at_utc: boundAt,
      day,
      run_id: runId,
      source_commit: sourceCommit,
      main_receipt_path: receiptRel,
      main_receipt_sha256: receiptSha,
      artifact_role: a.role ?? null,
      task_id: a.task_id ?? null,
      executed_by: a.executed_by ?? null,
      artifact_path: artifactRel,
      artifact_sha256_claimed: claimed,
      artifact_sha256_recomputed: recomputed,
      binding,
      original_sidecar_rewritten: false,
      note: 'append-only：原件未改写，绑定关系仅存在于本索引',
    };
  });
}

// 追加：既有内容必须是新内容的字节前缀，否则拒绝（append-only 护栏）。
export function appendOnly(existingText, newLines) {
  if (!existingText) return { text: newLines.map((r) => JSON.stringify(r)).join('\n') + (newLines.length ? '\n' : ''), appended: newLines.length };
  const existing = readJsonl(existingText);
  const keys = new Set(existing.map(dedupeKey));
  const fresh = [];
  for (const rec of newLines) {
    const k = dedupeKey(rec);
    if (keys.has(k)) continue;
    keys.add(k);
    fresh.push(rec);
  }
  if (fresh.length === 0) {
    return { text: existingText, appended: 0 };
  }
  const trailer = existingText.endsWith('\n') ? '' : '\n';
  return { text: existingText + trailer + fresh.map((r) => JSON.stringify(r)).join('\n') + '\n', appended: fresh.length };
}

export function ensureAppendOnlyText(existingText, nextText) {
  if (!nextText.startsWith(existingText)) {
    throw new Error('append-only 护栏触发：新内容不是既有索引的字节前缀，拒绝写入');
  }
  return true;
}

export function parseDays(list) {
  const days = String(list || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const d of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`日期格式非法：${d}`);
  }
  return days;
}

function cmdBuild(args) {
  const dryRun = args.includes('--dry-run');
  const dayArg = (args.find((a) => a.startsWith('--days')) || '').split('=')[1] ||
    (args.indexOf('--days') >= 0 ? args[args.indexOf('--days') + 1] : '');
  const days = parseDays(dayArg);
  if (days.length === 0) throw new Error('必须给 --days，例如 --days 2026-11-07,2026-11-08,2026-11-09');
  const indexAbs = path.join(REPO_ROOT, DEFAULT_INDEX_PATH);
  const before = new Map();
  for (const d of days) {
    const rel = `knowledge/results/ans-cycle/${d}.json`;
    const abs = path.join(REPO_ROOT, rel);
    const st = statSync(abs);
    before.set(abs, { size: st.size, mtimeMs: st.mtimeMs });
  }
  const all = days.flatMap((day) => buildBindingsForDay({ day }));
  const existingText = existsSync(indexAbs) ? readFileSync(indexAbs, 'utf8') : '';
  const { text, appended } = appendOnly(existingText, all);
  if (appended === 0) {
    console.log(JSON.stringify({ appended: 0, total_candidates: all.length, index: DEFAULT_INDEX_PATH }, null, 1));
    return 0;
  }
  ensureAppendOnlyText(existingText, text);
  if (!dryRun) writeFileSync(indexAbs, text);
  // 原件未被改动
  for (const [abs, stBefore] of before) {
    const stAfter = statSync(abs);
    if (stAfter.size !== stBefore.size || stAfter.mtimeMs !== stBefore.mtimeMs) {
      throw new Error(`原件被改动：${abs}`);
    }
  }
  const mismatched = all.filter((r) => r.binding !== 'match').length;
  console.log(JSON.stringify({
    dry_run: dryRun,
    appended,
    total_candidates: all.length,
    mismatch: mismatched,
    index: DEFAULT_INDEX_PATH,
  }, null, 1));
  return 0;
}

function cmdVerify() {
  const indexAbs = path.join(REPO_ROOT, DEFAULT_INDEX_PATH);
  if (!existsSync(indexAbs)) throw new Error('索引不存在，先执行 build');
  const recs = readJsonl(readFileSync(indexAbs, 'utf8'));
  let mismatch = 0;
  let missing = 0;
  const problems = [];
  for (const r of recs) {
    const abs = path.join(REPO_ROOT, r.artifact_path);
    if (!existsSync(abs)) { missing += 1; problems.push(`缺文件：${r.artifact_path}`); continue; }
    const recomputed = sha256OfFile(abs);
    if (recomputed !== r.artifact_sha256_recomputed) {
      mismatch += 1;
      problems.push(`原件被改写：${r.artifact_path}（原 ${r.artifact_sha256_recomputed.slice(0, 12)} 现 ${recomputed.slice(0, 12)}）`);
    } else if (r.binding !== 'match') {
      mismatch += 1;
      problems.push(`历史 mismatch 仍存在：${r.artifact_path}（claimed=${String(r.artifact_sha256_claimed).slice(0, 12)}）`);
    }
  }
  console.log(JSON.stringify({
    total: recs.length,
    unique_artifacts: new Set(recs.map((r) => r.artifact_path)).size,
    mismatch,
    missing,
    problems,
  }, null, 1));
  return recs.length > 0 ? 0 : 1;
}

function cmdStats() {
  const indexAbs = path.join(REPO_ROOT, DEFAULT_INDEX_PATH);
  if (!existsSync(indexAbs)) { console.log(JSON.stringify({ total: 0 }, null, 1)); return 0; }
  const recs = readJsonl(readFileSync(indexAbs, 'utf8'));
  const byDay = {};
  for (const r of recs) byDay[r.day] = (byDay[r.day] || 0) + 1;
  console.log(JSON.stringify({
    total: recs.length,
    by_day: byDay,
    by_role: recs.reduce((m, r) => { m[r.artifact_role] = (m[r.artifact_role] || 0) + 1; return m; }, {}),
    match: recs.filter((r) => r.binding === 'match').length,
    mismatch: recs.filter((r) => r.binding !== 'match').length,
    with_run_id: recs.filter((r) => r.run_id).length,
    with_source_commit: recs.filter((r) => r.source_commit).length,
  }, null, 1));
  return 0;
}

function main(argv) {
  const [cmd, ...args] = argv;
  try {
    if (cmd === 'build') return cmdBuild(args);
    if (cmd === 'verify') return cmdVerify();
    if (cmd === 'stats') return cmdStats();
    console.error('用法：build --days <逗号分隔日期> [--dry-run] | verify | stats');
    return 2;
  } catch (err) {
    console.error(`[ans-binding-index] ${err.message}`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}
