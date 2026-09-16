#!/usr/bin/env node
/**
 * LTZZZ × BiyaPay dry-run 模拟支付系统
 * 模式：DRY-RUN（不涉及任何真实资金/真实调用）
 *
 * 模拟闭环：AI 决策 → 白名单/余额/单笔上限校验 → 支付结果 → 账本记录 → 失败熔断 → ROI 复盘
 * 运行：node tools/biyapay_dryrun.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEDGER_DIR = join(__dirname, '..', 'finance', 'biyapay', 'ledger');
const SIM_BALANCE = 10.0;            // 初始余额 10 USDT（模拟）
const MAX_AMOUNT = 5.0;              // 单笔上限（模拟，余额的 50%）
const FAIL_LIMIT = 3;                // 连续失败熔断阈值
const AI = '豆包';                    // 本模拟由执行 Agent 记录

// LTZZZ 允许的境外数字服务清单（来自用户授权清单，按支付对象品牌校验）
const ALLOWED = [
  'Claude', 'OpenAI', 'GitHub', 'GitHub Copilot', 'Cloudflare', 'AI API',
  'AI视频生成', 'AI图片生成', 'AI音频', '翻译', '数据服务',
  '海外软件', 'SaaS', 'VPS', '域名', '网站服务', '开发工具',
  '自动化工具', '内容生产工具', '其他合法数字服务'
];

// 模拟任务队列（dry-run 场景）
const TASKS = [
  { object: 'Claude', service: 'AI API 订阅', amount: 1.0,  reason: 'LTZZZ 内容生产与实验（Claude 能力接入）', expect: '生成实验内容/自动化脚本', fail: false },
  { object: 'GitHub Copilot', service: '开发工具', amount: 10.0, reason: '代码辅助（实验性评估）', expect: '提升开发效率', fail: false },
  { object: 'OpenAI', service: 'AI API', amount: 1.0, reason: '小额 API 实验', expect: '生成测试样本', fail: true  }, // 商户拒绝模拟
  { object: 'OpenAI', service: 'AI API', amount: 1.0, reason: '小额 API 实验（重试判断）', expect: '生成测试样本', fail: true  }, // 商户再次拒绝
  { object: 'OpenAI', service: 'AI API', amount: 1.0, reason: '小额 API 实验（重试判断）', expect: '生成测试样本', fail: true  }, // 连续第 3 次 → 熔断
  { object: 'Cloudflare', service: '域名/网站服务', amount: 1.0, reason: '熔断后不应再支付（应被 PAUSED 拦截）', expect: '验证熔断生效', fail: false },
  { object: 'VPS', service: 'VPS/云服务器', amount: 3.0, reason: '熔断解除后测试', expect: '验证恢复后继续', fail: false }, // 熔断解除后执行
];

// ---------- 状态 ----------
let balance = SIM_BALANCE;
let failCount = 0;
let paused = false;
const ledger = [];
const decisionLog = [];

function check(obj, service, amount) {
  if (paused) return { ok: false, code: 'PAUSED', msg: '系统熔断暂停，已停止所有支付' };
  if (!ALLOWED.includes(obj)) return { ok: false, code: 'NOT_ALLOWED', msg: `支付对象「${obj}」不在 LTZZZ 允许清单` };
  if (!(amount > 0)) return { ok: false, code: 'BAD_AMOUNT', msg: '金额必须 > 0' };
  if (amount > MAX_AMOUNT) return { ok: false, code: 'OVER_MAX', msg: `金额 ${amount} 超过单笔上限 ${MAX_AMOUNT}` };
  if (amount > balance) return { ok: false, code: 'INSUFFICIENT', msg: `余额不足：需 ${amount}，余 ${balance.toFixed(2)}` };
  return { ok: true };
}

function runTask(t) {
  const entry = {
    time: new Date().toISOString(),
    ai: AI,
    mode: 'DRY-RUN',
    object: t.object,
    service: t.service,
    amount: t.amount,
    reason: t.reason,
    expect: t.expect,
    result: 'PENDING',
    tx: null,
    balanceAfter: null,
    review: null,
    blocked: null
  };
  const v = check(t.object, t.service, t.amount);
  if (!v.ok) {
    entry.result = 'BLOCKED';
    entry.blocked = v.code;
    entry.review = '停止/人工检查';
    ledger.push(entry);
    return entry;
  }
  // 模拟支付结果
  const success = !t.fail;
  if (success) {
    balance -= t.amount;
    entry.result = 'SUCCESS';
    entry.tx = `BDP-${Date.now().toString(36).toUpperCase()}`;
    entry.balanceAfter = Number(balance.toFixed(2));
    entry.review = '继续（达到预期则续费，未达到则停止）';
    failCount = 0;
  } else {
    entry.result = 'FAILED';
    entry.review = '失败：记录原因，不无限重试；连续 3 次自动暂停';
    failCount += 1;
    if (failCount >= FAIL_LIMIT) paused = true;
  }
  ledger.push(entry);
  return entry;
}

function replays() {
  // ROI 复盘：按支付对象聚合
  const byObj = {};
  for (const e of ledger) {
    if (e.result !== 'SUCCESS') continue;
    (byObj[e.object] = byObj[e.object] || []).push(e);
  }
  const report = [];
  for (const [obj, items] of Object.entries(byObj)) {
    const spent = items.reduce((s, e) => s + e.amount, 0);
    report.push({ object: obj, count: items.length, spent: Number(spent.toFixed(2)), verdict: '继续（dry-run，待真实使用后评估）' });
  }
  return report;
}

// ---------- 执行 ----------
console.log('[DRY-RUN] LTZZZ × BiyaPay 模拟支付系统启动');
console.log(`初始余额（模拟）：${SIM_BALANCE} USDT | 单笔上限：${MAX_AMOUNT} | 熔断阈值：连续 ${FAIL_LIMIT} 次失败`);
console.log('='.repeat(70));
TASKS.forEach((t, idx) => {
  // 熔断解除模拟：第 7 个任务前（索引 6）若处于熔断则解除（对应真实场景：人工检查/系统恢复）
  if (idx === 6 && paused) {
    paused = false;
    failCount = 0;
    console.log('[RESUME] 熔断解除（模拟人工检查后恢复），继续后续任务');
  }
  const e = runTask(t);
  console.log(
    `${e.result.padEnd(8)} | ${e.object.padEnd(8)} ${e.service.padEnd(12)} ${e.amount.toFixed(2)} USDT | ${e.blocked || e.tx || 'FAILED'} | 余额 ${balance.toFixed(2)}`
  );
  decisionLog.push({ object: t.object, amount: t.amount, decision: e.result, note: e.review });
});
console.log('='.repeat(70));
console.log(`结束余额（模拟）：${balance.toFixed(2)} USDT${paused ? ' | ⚠ 已触发熔断暂停' : ''}`);
console.log('\n[ROI 复盘]');
replays().forEach(r => console.log(`- ${r.object}: ${r.count} 笔 / 共 ${r.spent} USDT / 结论: ${r.verdict}`));

// ---------- 落盘 ----------
mkdirSync(LEDGER_DIR, { recursive: true });
const snapshot = {
  meta: { mode: 'DRY-RUN', initialBalance: SIM_BALANCE, finalBalance: Number(balance.toFixed(2)), maxAmount: MAX_AMOUNT, failLimit: FAIL_LIMIT, paused, runAt: new Date().toISOString(), ai: AI, note: '纯模拟，不涉及真实资金；等待官方 API 确认与用户授权后转为真实模式' },
  allowed: ALLOWED,
  ledger,
  replay: replays(),
  decisionLog
};
writeFileSync(join(LEDGER_DIR, 'biyapay-ledger.json'), JSON.stringify(snapshot, null, 2), 'utf8');

const md = [
  '# LTZZZ × BiyaPay dry-run 报告（模拟）',
  '',
  `> 模式：**DRY-RUN** · 不涉及真实资金 · 运行时间：${snapshot.meta.runAt}`,
  `> 初始余额：${SIM_BALANCE} USDT → 结束余额：${snapshot.meta.finalBalance} USDT ${paused ? '· ⚠ 触发熔断暂停' : ''}`,
  '',
  '## 1. 任务执行明细',
  '',
  '| 结果 | 支付对象 | 服务 | 金额(USDT) | 拦截/交易号 | 支付后余额 | 后续评价 |',
  '|---|---|---|---|---|---|---|',
  ...ledger.map(e => `| ${e.result} | ${e.object} | ${e.service} | ${e.amount.toFixed(2)} | ${e.blocked || e.tx || '-'} | ${e.balanceAfter ?? '-'} | ${e.review} |`),
  '',
  '## 2. 校验规则（模拟生效）',
  '',
  '- 服务必须属于 LTZZZ 允许清单（当前 19 类）',
  '- 金额 ≤ 单笔上限 5 USDT；金额 ≤ 当前余额',
  '- 连续失败 3 次 → 自动熔断暂停（本 dry-run 已验证：OpenAI 连续失败后触发暂停）',
  '- 失败不无限重试（第 3 次失败后系统暂停，后续任务被 BLOCKED=PAUSED）',
  '',
  '## 3. ROI 复盘（模拟结论）',
  '',
  ...replays().map(r => `- **${r.object}**：${r.count} 笔 / 共 ${r.spent} USDT / 结论：${r.verdict}`),
  '',
  '## 4. 待办（真实化前置条件）',
  '',
  '1. BiyaPay 官方 API 确认（邮件申请中）或确认走「订阅绑定」过渡模式',
  '2. 用户确认卡内真实余额（账本以官方为准，不猜测）',
  '3. 用户授权进入真实模式（当前仅 dry-run）',
  '4. 若获得官方 API：密钥只放 Cloudflare Secret / 环境变量，写入本仓库时脱敏',
  ''
].join('\n');
writeFileSync(join(LEDGER_DIR, 'biyapay-dryrun-report.md'), md, 'utf8');

console.log('\n输出：finance/biyapay/ledger/biyapay-ledger.json + biyapay-dryrun-report.md');
