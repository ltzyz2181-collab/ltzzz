// 执行一笔 AI 实验支出：策略检查 → 熔断检查 → 预算检查 → 转账 → 记账
// 用法: node execute-agent-payment.mjs --agent gpt --amount 1 --recipient 0x... --purpose "..." --hypothesis "..." --success-criteria "..." --experiment-id exp_x
import {
  loadPolicy, loadLedger, saveLedger, loadReputation, loadWallet, providerMode,
  checkPolicy, checkCircuit, updateCircuit, multiplier, availableBudget,
  executeTransfer, recordTxn, nowIso,
} from "./wallet-lib.mjs";
import { reasoningHash } from "./anchor-reasoning.mjs";

function argv(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

async function main() {
  const agent = argv("--agent"), recipient = argv("--recipient");
  const amount = Number(argv("--amount") || 0);
  if (!agent || !recipient || !(amount > 0)) {
    console.error("用法: node execute-agent-payment.mjs --agent <id> --amount <usdc> --recipient <0x地址或x402端点> --purpose <用途> --hypothesis <假设> --success-criteria <验收> --experiment-id <id>");
    process.exit(2);
  }

  const prov = providerMode();
  const policy = loadPolicy();
  const ledger = loadLedger();
  const reputation = loadReputation();
  const spend = {
    agent, amount_usdc: amount, recipient, purpose: argv("--purpose") || "",
    hypothesis: argv("--hypothesis") || "", success_criteria: argv("--success-criteria") || "",
    experiment_id: argv("--experiment-id") || null,
  };
  spend.reasoning_hash = reasoningHash(spend);
  spend.reasoning_summary = `假设: ${spend.hypothesis.slice(0, 80)}`;

  console.log(`🤖 ${agent} 发起支付: ${amount} USDC → ${recipient}`);
  console.log(`   用途: ${spend.purpose} | 假设: ${spend.hypothesis.slice(0, 60)}…`);

  // 1) 策略检查
  const p = checkPolicy(policy, spend);
  if (!p.ok) { console.log(`❌ 策略拒绝: ${p.errors.join("; ")}`); process.exit(1); }
  console.log("✅ 策略检查通过");

  // 2) 熔断器
  const c = checkCircuit(ledger, policy);
  if (!c.ok) { console.log(`❌ ${c.reason}`); process.exit(1); }
  console.log("✅ 熔断器正常");

  // 3) 预算（含信誉乘数）
  const budget = availableBudget(policy, reputation, agent, ledger);
  if (amount > budget) { console.log(`❌ 预算不足: ${agent} 可用 ${budget} USDC（日预算×${multiplier(reputation, agent)} - 已花）`); process.exit(1); }
  console.log(`✅ 预算充足: 可用 ${budget} USDC`);

  // 4) 转账
  try {
    const res = await executeTransfer({ recipient, amountUsdc: amount, purpose: spend.purpose });
    console.log(`✅ 转账已${res.status}: ${res.hash}`);
    spend.tx_hash = res.hash; spend.status = res.status; spend.mode = res.mode;
  } catch (e) {
    updateCircuit(ledger, { ok: false, amount, agent });
    saveLedger(ledger);
    console.error(`❌ 转账失败: ${e.message}`);
    process.exit(1);
  }

  // 5) 记账（pending_probe：等结果回填后才核销）
  spend.status = spend.status || "pending_probe";
  const full = recordTxn(ledger, { ...spend, audit: null, outcome: null });
  saveLedger(ledger);
  updateCircuit(ledger, { ok: true, amount, agent });
  saveLedger(ledger);
  console.log(`✅ 已记账 ${full.id}（pending_probe）`);
  console.log(`   下一步: 实验出结果后回填 outcome，audit-spending.mjs 交叉审计`);
}

main().catch((e) => { console.error("执行失败:", e.message); process.exit(1); });
