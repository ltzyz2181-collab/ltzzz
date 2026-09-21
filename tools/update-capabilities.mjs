#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
const log = JSON.parse(readFileSync('ai/verified-log.json', 'utf8'));
const rows = log.entries.map((e) => {
  const did = e.did || e.best_at || '—';
  const fail = e.failed || e.note || (e.verified_live_call === false ? '无今日真调用' : '—');
  const exec = e.can_execute === false ? '否' : e.verified ? '部分验证' : '未验证';
  return `| ${e.ai} | ${did} | ${fail} | ${exec} |`;
});
const md = `# AI Center · 已验证能力\n\n更新：${log.updated_at}\n\n| AI | 已验证 | 失败/限制 | 能否执行 |\n|----|--------|-------------|----------|\n${rows.join('\n')}\n\n规则：有代码 ≠ 已验证。源：ai/verified-log.json\n`;
writeFileSync('ai/ai-capabilities.md', md);
console.log('updated ai/ai-capabilities.md');
