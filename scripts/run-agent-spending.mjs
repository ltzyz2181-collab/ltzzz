// AI 提案自动执行：读 agent-wallet/proposals/<agent>.json 中 status=pending 的提案，逐个过策略并执行
import { parseArgs } from "node:util";
import {
  loadPolicy, loadLedger, saveLedger, loadReputation, loadWallet, providerMode,
  checkPolicy, checkCircuit, updateCircuit, availableBudget, executeTransfer,
  recordTxn, loadProposals, saveProposals, multiplier,
} from "./wallet-lib.mjs";
import { reasoningHash } from "./anchor-reasoning.mjs";

async function main() {
  const { values } = parseArgs({ options: { agent: { type: "string" }, limit: { type: "string" } } });
  const agent = values.agent;
  if (!agent) { console.error("用法: node run-agent-spending.mjs --agent <id> [--limit n]"); process.exit(2); }

  const prov = providerMode();
  const policy = loadPolicy();
  const ledger = loadLedger();
  const reputation = loadReputation();
  const proposals = loadProposals(agent).filter((p) => p.status === "pending");
  const limit = Number(values.limit || 10);

  if (proposals.length === 0) { console.log(`📭 ${agent} 无待执行提案`); return; }
  console.log(`🤖 ${agent} 待执行提案 ${proposals.length} 条，本轮最多 ${limit} 条（模式 ${prov.mode}）`);

  let done = 0, failed = 0;
  for (const prop of proposals.slice(0, limit)) {
    const spend = {
      agent, amount_usdc: Number(prop.amount_usdc), recipient: prop.recipient,
      purpose: prop.purpose || "", hypothesis: prop.hypothesis || "",
      success_criteria: prop.success_criteria || "", experiment_id: prop.experiment_id || null,
    };
    spend.reasoning_hash = reasoningHash(spend);
    spend.reasoning_summary = `假设: ${spend.hypothesis.slice(0, 80)}`;
    const p = checkPolicy(policy, spend);
    if (!p.ok) { prop.status = "rejected"; prop.reason = p.errors.join("; "); failed++; continue; }
    const c = checkCircuit(ledger, policy);
    if (!c.ok) { prop.status = "rejected"; prop.reason = c.reason; failed++; break; } // 熔断则整批停
    const budget = availableBudget(policy, reputation, agent, ledger);
    if (spend.amount_usdc > budget) { prop.status = "rejected"; prop.reason = `预算不足（可用 ${budget} USDC）`; failed++; continue; }
    try {
      const res = await executeTransfer({ recipient: spend.recipient, amountUsdc: spend.amount_usdc, purpose: spend.purpose });
      spend.tx_hash = res.hash; spend.status = res.status; spend.mode = res.mode;
      recordTxn(ledger, { ...spend, audit: null, outcome: null });
      updateCircuit(ledger, { ok: true, amount: spend.amount_usdc, agent });
      prop.status = "executed"; prop.tx_hash = res.hash; prop.executed_at = new Date().toISOString();
      done++;
      console.log(`✅ ${prop.id}: ${spend.amount_usdc} USDC → ${spend.recipient} (${res.status})`);
    } catch (e) {
      updateCircuit(ledger, { ok: false, amount: spend.amount_usdc, agent });
      prop.status = "failed"; prop.reason = e.message; failed++;
      console.log(`❌ ${prop.id}: ${e.message}`);
    }
  }
  saveProposals(agent, proposals);
  saveLedger(ledger);
  console.log(`\n完成 ${done} 条，失败/拒绝 ${failed} 条`);
}

main().catch((e) => { console.error("执行失败:", e.message); process.exit(1); });
