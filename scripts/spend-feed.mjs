// 公开花账：生成 agent-wallet/spend-feed.json（dashboard 渲染"AI 花钱实况"，链上+审计全公开）
import fs from "node:fs";
import { loadLedger, loadReputation, nowIso, WALLET_DIR } from "./wallet-lib.mjs";

async function main() {
  const ledger = loadLedger();
  const reputation = loadReputation();
  const entries = ledger.transactions
    .filter((t) => t.status !== "failed")
    .map((t) => ({
      id: t.id, timestamp: t.timestamp, agent: t.agent, amount_usdc: t.amount_usdc,
      recipient: t.recipient, purpose: t.purpose, hypothesis: t.hypothesis,
      success_criteria: t.success_criteria, experiment_id: t.experiment_id,
      status: t.status, tx_hash: t.tx_hash, audit: t.audit, outcome: t.outcome,
      direction: t.direction || "spend",
    }))
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  const summary = {
    total_spent_usdc: ledger.transactions.filter((t) => t.status !== "failed" && !t.direction).reduce((s, t) => s + t.amount_usdc, 0),
    total_refills_usdc: ledger.transactions.filter((t) => t.direction === "refill").reduce((s, t) => s + t.amount_usdc, 0),
    pending_probes: ledger.transactions.filter((t) => t.status === "pending_probe").length,
    halted: !!ledger.circuit?.halted,
    reputation,
  };

  const feed = { generated_at: nowIso(), policy_version: "2.0.0", summary, entries };
  fs.mkdirSync(WALLET_DIR, { recursive: true });
  fs.writeFileSync(WALLET_DIR + "/spend-feed.json", JSON.stringify(feed, null, 2) + "\n", "utf8");
  console.log(`📊 公开花账已生成: agent-wallet/spend-feed.json`);
  console.log(`   支出合计 ${summary.total_spent_usdc.toFixed(2)} USDC | 拨款 ${summary.total_refills_usdc.toFixed(2)} | 待核销 ${summary.pending_probes} | 熔断 ${summary.halted}`);
}

main().catch((e) => { console.error("生成失败:", e.message); process.exit(1); });
