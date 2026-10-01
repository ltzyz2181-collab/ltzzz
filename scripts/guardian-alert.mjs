// 守护告警（Guardian）：AI 半夜乱花钱也不能第二天才知道
// 触发条件：熔断 / 余额低于阈值 / 单笔超 10U / 连续 2 次失败
// 通道：GitHub Actions 日志 + 可选 webhook（Telegram/企业微信，配置 GUARDIAN_WEBHOOK 后启用）
import { loadPolicy, loadLedger, loadWallet, loadProposals, today } from "./wallet-lib.mjs";

async function main() {
  const policy = loadPolicy();
  const ledger = loadLedger();
  const w = loadWallet();
  const alerts = [];

  const c = ledger.circuit || {};
  if (c.halted) alerts.push(`🚨 熔断器已触发（${c.halted_at}：${c.halt_reason}），AI 支出已冻结`);
  if (c.consecutive_failures >= 2) alerts.push(`⚠️ 连续 ${c.consecutive_failures} 次支付失败，接近熔断线`);

  const bal = Number(w.simulated_balance_usdc ?? 0);
  if (policy.guardian && bal > 0 && bal < (policy.refill_threshold_usdc ?? 10)) {
    alerts.push(`💸 余额偏低: ${bal} USDC（dry-run 模拟值；真实模式请用 check-balance.mjs 核链上）`);
  }

  const bigTxns = ledger.transactions.filter((t) => t.amount_usdc > 10 && !t.direction && t.timestamp.slice(0, 10) === today());
  if (bigTxns.length) alerts.push(`💰 今日出现大额支出: ${bigTxns.map((t) => `${t.agent} ${t.amount_usdc}U`).join("、")}`);

  const pendingCount = ["gpt", "doubao", "deepseek", "grok", "claude", "microsoft"].reduce((s, a) => s + loadProposals(a).filter((p) => p.status === "pending").length, 0);
  if (pendingCount > 10) alerts.push(`📥 待执行花钱提案积压 ${pendingCount} 条`);

  if (alerts.length === 0) { console.log("✅ 守护检查通过：无告警"); return; }
  console.log(alerts.join("\n"));

  const webhook = process.env.GUARDIAN_WEBHOOK;
  if (webhook) {
    try {
      const r = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `[LTZZZ Guardian] ${new Date().toISOString()}\n` + alerts.join("\n") }),
      });
      console.log(`📨 webhook 已推送（${r.status}）`);
    } catch (e) {
      console.log(`📨 webhook 推送失败: ${e.message}`);
    }
  } else {
    console.log("ℹ️ 未配置 GUARDIAN_WEBHOOK，仅输出到日志（部署时可接 Telegram/企业微信）");
  }
}

main().catch((e) => { console.error("守护检查失败:", e.message); process.exit(1); });
