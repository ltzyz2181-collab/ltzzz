#!/usr/bin/env node
/**
 * dispatch-sentinel.mjs — 派单哨兵（WorkBuddy 职责的自动化落地）
 *
 * 职责（对应 owner 2026-10-08/09 指令）：
 *   - 派单跟踪：今日应交付的项，实际交付了没
 *   - 超时汇总：超期未交付的派单
 *   - 阻塞汇总：标记为 阻塞 的项
 *   - 未配置明说：检查项若无法判定，明确输出 UNKNOWN，不假装通过
 *
 * 纪律：所有状态以 GitHub 仓库中的交付与运行证据为准（本脚本读的就是仓库文件）。
 *
 * 用法: node scripts/dispatch-sentinel.mjs [--date YYYY-MM-DD]
 * 输出: memory/sentinel/<date>-<hh>.md  +  stdout 摘要
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const args = process.argv.slice(2);
let dateArg = null;
for (let i = 0; i < args.length; i++) if (args[i] === '--date') dateArg = args[i + 1];

const pad = (n) => String(n).padStart(2, '0');
// 用 Intl 取北京时区日期/小时（避免手工加偏移导致的双重时区错误）
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hour12: false,
});
const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
const DATE = dateArg || `${parts.year}-${parts.month}-${parts.day}`;
const HH = pad(parseInt(parts.hour, 10) % 24);

const exists = (p) => fs.existsSync(path.join(REPO, p));
const readJson = (p) => {
  try { return JSON.parse(fs.readFileSync(path.join(REPO, p), 'utf8')); } catch { return null; }
};

const rows = [];
const push = (item, state, evidence, note = '') => rows.push({ item, state, evidence, note });

/* ---------- 1. 日课产出 ---------- */
{
  const f = `data/results/${DATE}.json`;
  if (exists(f)) {
    const j = readJson(f);
    const cm = j?.core_memory || {};
    const seats = (j?.tasks || []).map((t) => `${t.agent}=${t.status}`).join(', ');
    push('日课产出', 'OK', f, `记忆 ${cm.loaded_files}/${cm.total_files}；${seats || '无席位记录'}`);
  } else {
    push('日课产出', 'MISSING', f, '今日结果文件不存在 —— 日课未产出（超时/失败）');
  }
}

/* ---------- 2. 雇佣回执（T1） ---------- */
{
  const dir = 'knowledge/results/hire';
  if (!exists(dir)) {
    push('AI雇AI回执(T1)', 'UNKNOWN', dir, '交付目录不存在 —— 未配置交付位');
  } else {
    const today = fs.readdirSync(path.join(REPO, dir)).filter((n) => n.includes(DATE) && n.endsWith('.md'));
    push('AI雇AI回执(T1)', today.length ? 'OK' : 'NONE', `${dir}/*${DATE}*`,
      today.length ? `今日 ${today.length} 份：${today.join(', ')}` : '今日无新回执（未交付）');
  }
}

/* ---------- 3. 投资回执（T2） ---------- */
{
  const dir = 'knowledge/results/invest';
  if (!exists(dir)) {
    push('自主投资回执(T2)', 'UNKNOWN', dir, '交付目录不存在 —— 未配置交付位');
  } else {
    const today = fs.readdirSync(path.join(REPO, dir)).filter((n) => n.includes(DATE) && n.endsWith('.md'));
    push('自主投资回执(T2)', today.length ? 'OK' : 'NONE', `${dir}/*${DATE}*`,
      today.length ? `今日 ${today.length} 份：${today.join(', ')}` : '今日无新回执（未交付）');
  }
}

/* ---------- 4. 派单台账：超时 / 阻塞 ---------- */
{
  const ledger = 'ops/派单台账.md';
  if (!exists(ledger)) {
    push('派单台账', 'UNKNOWN', ledger, '台账文件不存在 —— 未配置');
  } else {
    const txt = fs.readFileSync(path.join(REPO, ledger), 'utf8');
    const lines = txt.split('\n').filter((l) => l.trim().startsWith('|') && l.includes('|'));
    const open = [];
    const blocked = [];
    for (const l of lines) {
      const cells = l.split('|').map((c) => c.trim());
      if (cells.length < 7) continue;
      const no = cells[1], obj = cells[3], task = cells[4], status = cells[6];
      if (!no || no === '单号' || /^-+$/.test(no)) continue;
      if (status.includes('阻塞')) blocked.push(`${no}（${obj}）${String(task).slice(0, 24)}`);
      else if (status.includes('执行中') || status.includes('未完成') || status.includes('返工'))
        open.push(`${no} → ${status}`);
    }
    push('派单台账·执行中', open.length ? 'OPEN' : 'OK', ledger,
      open.length ? `${open.length} 项：${open.slice(0, 6).join('；')}${open.length > 6 ? ' …' : ''}` : '无');
    push('派单台账·阻塞', blocked.length ? 'BLOCKED' : 'OK', ledger,
      blocked.length ? `${blocked.length} 项：${blocked.join('；')}` : '无');
  }
}

/* ---------- 5. 每小时扫描自身是否已配置 ---------- */
{
  const self = '.github/workflows/dispatch-sentinel.yml';
  push('每小时扫描配置', exists(self) ? 'CONFIGURED' : 'UNCONFIGURED', self,
    exists(self) ? '哨兵工作流已在库' : '哨兵工作流尚未入库 —— 未配置（明说）');
}

/* ---------- 6. 派单跟踪：今日应交付的席位 ---------- */
{
  const d = `memory/daily/qianwen-dispatch-${DATE}.md`;
  if (!exists(d)) {
    push('今日派单原件', 'UNKNOWN', d, '今日派单原件不存在 —— 无可跟踪对象');
  } else {
    push('今日派单原件', 'OK', d, '已存在，哨兵据此跟踪交付');
  }
}

/* ---------- 输出 ---------- */
const icon = { OK: '✅', NONE: '⬜', MISSING: '❌', BLOCKED: '🔴', OPEN: '🟡', UNKNOWN: '❓', CONFIGURED: '✅', UNCONFIGURED: '❌' };
const alert = rows.filter((r) => ['MISSING', 'BLOCKED', 'UNKNOWN', 'UNCONFIGURED', 'NONE'].includes(r.state));

let md = `# 派单哨兵回执 · ${DATE} ${HH}:00 (CST)\n\n`;
md += `> 自动生成 · 无 AI key 依赖 · 状态一律以仓库交付/运行证据为准\n\n`;
md += `## 扫描结果\n\n| 检查项 | 状态 | 证据 | 说明 |\n|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.item} | ${icon[r.state] || ''} ${r.state} | \`${r.evidence}\` | ${r.note} |\n`;

md += `\n## 需要处理的（超时 / 阻塞 / 未配置）\n\n`;
if (!alert.length) md += `无 —— 本轮全部正常。\n`;
else for (const r of alert) md += `- ${icon[r.state] || ''} **${r.item}**：${r.note}\n`;

md += `\n## 明说事项\n\n`;
md += `- 本哨兵**只读仓库文件**，读不到 GitHub Actions 的运行日志——若工作流失败但与文件无关，哨兵看不见。\n`;
md += `- 若某检查项证据文件不存在，状态记 \`UNKNOWN\`，**不假装通过**。\n`;

const outDir = path.join(REPO, 'memory/sentinel');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${DATE}-${HH}.md`);
fs.writeFileSync(outFile, md, 'utf8');

console.log(md);
console.log(`\n[written] memory/sentinel/${DATE}-${HH}.md`);
console.log(`[summary] ${rows.length} checks, ${alert.length} need attention`);
if (alert.length) {
  console.log('[alert-items] ' + alert.map((r) => `${r.item}=${r.state}`).join(' | '));
}
