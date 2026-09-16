#!/usr/bin/env node
/**
 * LTZZZ Provider Adapter — 境外支付通道抽象层
 *
 * 当前状态：DRY-RUN（官方 API 确认前，一律模拟，不产生真实资金/真实调用）
 *
 * 架构（用户确认）：
 *   LTZZZ → GPT 总控 → 任务队列 → Doubao 执行 → 判断需要海外支付？
 *   → BiyaPay Provider Adapter → 检查余额 → 检查支付条件 → 模拟支付 → 记录结果
 *   → 财务账本 / GitHub 知识库
 *
 * 重要：不虚构任何 BiyaPay 接口/Endpoint/参数。
 * 官方 API 确认后，只需替换本文件中的 getBalance() / executePayment() 实现为官方调用，
 * 接口契约与校验/记账逻辑保持不变。
 *
 * 运行：node finance/biyapay/adapter/provider-adapter.mjs
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEDGER_FILE = join(__dirname, '..', 'ledger', 'biyapay-ledger.json');

/** 契约：所有支付通道（BiyaPay / 未来其他）必须实现这些方法 */
class ProviderAdapter {
  constructor(config = {}) {
    this.config = config;
    this.mode = 'DRY-RUN';
  }
  async getBalance() { throw new Error('getBalance() 未实现'); }
  async checkConditions(payment) { throw new Error('checkConditions() 未实现'); }
  async executePayment(payment) { throw new Error('executePayment() 未实现'); }
  async recordResult(result) { throw new Error('recordResult() 未实现'); }
}

/**
 * BiyaPay Dry-Run Adapter
 * 校验与记账为真实逻辑；余额与支付为模拟（官方 API 确认前不连接真实系统）。
 */
export class BiyaPayDryRunAdapter extends ProviderAdapter {
  constructor(config = {}) {
    super({ initialBalance: 10.0, maxAmount: 5.0, failLimit: 3, ...config });
    this.balance = this.config.initialBalance;
    this.failCount = 0;
    this.paused = false;
    this.allowed = [
      'Claude', 'OpenAI', 'GitHub', 'GitHub Copilot', 'Cloudflare', 'AI API',
      'AI视频生成', 'AI图片生成', 'AI音频', '翻译', '数据服务',
      '海外软件', 'SaaS', 'VPS', '域名', '网站服务', '开发工具',
      '自动化工具', '内容生产工具', '其他合法数字服务'
    ];
    this.ledger = [];
  }

  /** 余额读取（当前：本地模拟账本；官方 API 确认后改为官方接口） */
  async getBalance() {
    return { balance: this.balance, mode: this.mode, source: 'local-simulated' };
  }

  /** 支付条件校验（真实逻辑） */
  async checkConditions(p) {
    if (this.paused) return { ok: false, code: 'PAUSED', msg: '熔断暂停，已停止所有支付' };
    if (!this.allowed.includes(p.object)) return { ok: false, code: 'NOT_ALLOWED', msg: `支付对象「${p.object}」不在 LTZZZ 允许清单` };
    if (!(p.amount > 0)) return { ok: false, code: 'BAD_AMOUNT', msg: '金额必须 > 0' };
    if (p.amount > this.config.maxAmount) return { ok: false, code: 'OVER_MAX', msg: `金额 ${p.amount} 超过单笔上限 ${this.config.maxAmount}` };
    if (p.amount > this.balance) return { ok: false, code: 'INSUFFICIENT', msg: `余额不足：需 ${p.amount}，余 ${this.balance.toFixed(2)}` };
    return { ok: true };
  }

  /** 支付执行（当前：模拟；官方 API 确认后替换为官方调用，禁止伪造支付结果） */
  async executePayment(p) {
    // 模拟商户结果：真实模式下此处调用官方 API；失败时如实记录，不伪造成功
    const success = p.simulateFail !== true;
    if (success) {
      this.balance = Number((this.balance - p.amount).toFixed(2));
      this.failCount = 0;
      return { success: true, tx: `BDP-${Date.now().toString(36).toUpperCase()}`, balanceAfter: this.balance };
    }
    this.failCount += 1;
    if (this.failCount >= this.config.failLimit) this.paused = true;
    return { success: false, error: '模拟商户拒绝（真实模式下为官方 API 返回）', failCount: this.failCount, paused: this.paused };
  }

  /** 结果记录（真实逻辑） */
  async recordResult(p, outcome) {
    const entry = {
      time: new Date().toISOString(), ai: p.ai || '豆包', mode: this.mode,
      object: p.object, service: p.service, amount: p.amount,
      reason: p.reason, expect: p.expect,
      result: outcome.success ? 'SUCCESS' : (outcome.code ? 'BLOCKED' : 'FAILED'),
      code: outcome.code || null, tx: outcome.tx || null,
      balanceAfter: outcome.balanceAfter ?? null,
      review: outcome.success ? '继续（达到预期则续费，未达到则停止）' : (outcome.code ? '停止/人工检查' : '失败：记录原因，不无限重试；连续 3 次自动暂停')
    };
    this.ledger.push(entry);
    return entry;
  }

  /** 熔断恢复（人工检查后调用） */
  resume() { this.paused = false; this.failCount = 0; }

  save() {
    mkdirSync(dirname(LEDGER_FILE), { recursive: true });
    const snapshot = {
      meta: { mode: this.mode, finalBalance: this.balance, paused: this.paused, runAt: new Date().toISOString(), note: '纯模拟，不涉及真实资金；等待官方 API 确认后转真实模式' },
      ledger: this.ledger
    };
    writeFileSync(LEDGER_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
    return LEDGER_FILE;
  }
}

/** 演示：dry-run 跑一遍完整闭环 */
async function main() {
  const adapter = new BiyaPayDryRunAdapter();
  console.log('[DRY-RUN] LTZZZ Provider Adapter (BiyaPay) 启动');
  console.log(`初始余额（模拟）: ${adapter.config.initialBalance} USDT | 单笔上限: ${adapter.config.maxAmount} | 熔断: 连续 ${adapter.config.failLimit} 次失败`);

  const tasks = [
    { object: 'Claude', service: 'AI API 订阅', amount: 1.0, reason: '内容生产实验', expect: '生成实验内容', simulateFail: false },
    { object: 'GitHub Copilot', service: '开发工具', amount: 10.0, reason: '代码辅助评估', expect: '效率提升', simulateFail: false },
    { object: 'OpenAI', service: 'AI API', amount: 1.0, reason: '小额 API 实验', expect: '测试样本', simulateFail: true },
    { object: 'OpenAI', service: 'AI API', amount: 1.0, reason: '重试判断', expect: '测试样本', simulateFail: true },
    { object: 'OpenAI', service: 'AI API', amount: 1.0, reason: '重试判断', expect: '测试样本', simulateFail: true },
    { object: 'Cloudflare', service: '域名/网站服务', amount: 1.0, reason: '熔断验证', expect: '应被拦截', simulateFail: false },
  ];

  for (const t of tasks) {
    const bal = await adapter.getBalance();
    const v = await adapter.checkConditions(t);
    let out;
    if (!v.ok) {
      out = { success: false, code: v.code };
    } else {
      out = await adapter.executePayment(t);
    }
    const entry = await adapter.recordResult(t, out);
    console.log(`${entry.result.padEnd(8)} | ${t.object.padEnd(8)} ${t.service.padEnd(12)} ${t.amount.toFixed(2)} USDT | ${entry.code || entry.tx || 'FAILED'} | 余额 ${bal.balance.toFixed(2)}`);
    if (t.object === 'OpenAI' && v.ok && adapter.paused) {
      console.log('[RESUME] 模拟人工检查后恢复');
      adapter.resume();
    }
  }

  const file = adapter.save();
  console.log(`\n账本已写入: ${file}`);
  console.log(`结束余额（模拟）: ${adapter.balance.toFixed(2)} USDT`);
  console.log('说明：官方 API 确认前不连接 BiyaPay 真实系统，不产生真实资金。');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
