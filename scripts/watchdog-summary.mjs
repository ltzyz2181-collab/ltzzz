#!/usr/bin/env node
/**
 * watchdog-summary.mjs — 把某天的日课结果汇总成 markdown（供 liveness-watchdog 写 Summary）
 * 用法: node scripts/watchdog-summary.mjs <results.json 路径>
 * 找不到文件时打印断裂提示，不抛错（由 workflow 决定是否红灯）。
 */
import fs from 'node:fs';

const f = process.argv[2];
if (!f || f === 'none' || !fs.existsSync(f)) {
  console.log('**无任何日课结果文件 —— 日课链路已断，需总控介入。**');
  process.exit(0);
}

const j = JSON.parse(fs.readFileSync(f, 'utf8'));
const cm = j.core_memory || {};
const lines = [];
lines.push(`generated_at   = ${j.generated_at}`);
lines.push(`execution_id   = ${j.execution_id}`);
lines.push(`core_memory    = ${cm.status} (${cm.loaded_files}/${cm.total_files})`);
lines.push('seats:');
for (const t of j.tasks || []) {
  const mark = t.status === 'success' ? 'OK  ' : t.status === 'skipped' ? 'SKIP' : 'FAIL';
  lines.push(`  [${mark}] ${t.agent}: ${t.status}`);
}
const fails = j.failures || [];
if (fails.length) {
  lines.push('failures:');
  for (const x of fails) lines.push(`  - ${x.agent}: ${String(x.error || '').slice(0, 120)}`);
}
console.log('```');
console.log(lines.join('\n'));
console.log('```');
