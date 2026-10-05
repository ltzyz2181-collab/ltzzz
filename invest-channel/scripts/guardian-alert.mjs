#!/usr/bin/env node
/**
 * guardian-alert.mjs — LTZZZ 投资风控告警（单笔 > 100 USDC 触发 TG webhook）
 * 任务单：LTZZZ-INVEST-AAVE-001 v1.2 §三.8
 * 用法：
 *   node scripts/guardian-alert.mjs --amount 120 --tx 0xabc... --account ltzzz_ops
 * 环境变量：TG_BOT_TOKEN / TG_CHAT_ID（不落盘，运行时注入）
 */
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;
const THRESHOLD = 100; // USDC

function arg(name) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

(async () => {
  const amount = parseFloat(arg("amount") || "0");
  const tx = arg("tx") || "n/a";
  const account = arg("account") || "unknown";

  if (amount <= THRESHOLD) {
    console.log(`金额 ${amount} USDC ≤ 阈值 ${THRESHOLD}，无需告警。`);
    return;
  }
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
    console.warn(`⚠️ 单笔 ${amount} USDC 超阈值，但缺 TG_BOT_TOKEN/TG_CHAT_ID，告警未发送（如实记录）。`);
    process.exitCode = 2;
    return;
  }

  const msg = `🔔 LTZZZ 大额分配告警\n金额: ${amount} USDC\n账户: ${account}\ntx: ${tx}\n时间: ${new Date().toISOString()}`;
  const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_CHAT_ID, text: msg })
  });
  const j = await resp.json();
  if (j.ok) { console.log("TG 告警已发送 ✅"); } else { console.warn("TG 发送失败:", j.description); process.exitCode = 3; }
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
