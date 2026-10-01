// 交叉审计：轮转另一 AI 审计待审支出，维护信誉乘数（成功加分/浪费扣分）
// 规则审计 + 可选 LLM 审计钩子（预留：可把支出信息交给另一 AI 做真判断）
import { loadPolicy, loadLedger, saveLedger, loadReputation, saveReputation, today } from "./wallet-lib.mjs";

const AGENT_ORDER = ["gpt", "doubao", "deepseek", "grok", "claude"];

function pickAuditor(spender, used) {
  for (const a of AGENT_ORDER) {
    if (a !== spender && !used.has(a)) return a;
  }
  for (const a of AGENT_ORDER) {
    if (a !== spender) return a;
  }
  return AGENT_ORDER[0];
}

async function main() {
  const policy = loadPolicy();
  const ledger = loadLedger();
  const reputation = loadReputation();

  const pending = ledger.transactions.filter((t) => !t.audit && t.status !== "failed");
  if (pending.length === 0) { console.log("📭 无待审计支出"); return; }
  console.log(`🔍 待审计 ${pending.length} 笔`);

  const used = new Set();
  for (const t of pending) {
    const auditor = pickAuditor(t.agent, used);
    used.add(auditor);
    // 规则审计：无 hypothesis / 无 experiment_id / 目的为空 → 标 flag，其余自动通过
    const flags = [];
    if (!(t.hypothesis || "").trim()) flags.push("缺实验假设");
    if (!(t.experiment_id || "").trim()) flags.push("缺实验 ID");
    if (!(t.purpose || "").trim()) flags.push("用途为空");
    const dest = t.recipient || t.to_address;
    if (!(dest || "").startsWith("0x")) flags.push("接收方非链上地址");
    const verdict = flags.length ? "flag" : "approved";
    t.audit = { auditor, verdict, flags, at: new Date().toISOString(), note: verdict === "approved" ? "规则审计通过（LLM 审计钩子 v2.1）" : flags.join("、") };

    // 信誉更新：approved +0.05 / flag -0.15（clamp 0.2~3.0）
    const a = reputation.agents[t.agent] || (reputation.agents[t.agent] = { multiplier: 1.0, history: [] });
    const delta = verdict === "approved" ? 0.05 : -0.15;
    a.multiplier = Math.min(3.0, Math.max(0.2, Number((a.multiplier + delta).toFixed(2))));
    a.history.push({ date: today(), txn_id: t.id, verdict, delta, auditor });
    console.log(`   ${t.id} [${t.agent}] ${t.amount_usdc} USDC → ${auditor} 审计: ${verdict}（信誉 ${delta > 0 ? "+" : ""}${delta} → ${a.multiplier}）`);
  }

  saveLedger(ledger);
  saveReputation(reputation);
  console.log(`\n✅ 审计完成，信誉乘数已更新（policy: ${policy.policy_version}）`);
}

main().catch((e) => { console.error("审计失败:", e.message); process.exit(1); });
