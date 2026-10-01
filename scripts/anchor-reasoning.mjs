// 推理证明（Proof-of-Reasoning）：计算/核验每笔支出的 reasoning_hash，并批量锚定根哈希
// 原理：SHA-256(agent,amount,recipient,purpose,hypothesis,success_criteria,experiment_id)
// 任何人可重算核对 → 审计从"审结果"升级为"审过程"。锚定上链在注册表合约部署后启用。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { WALLET_DIR, readJSON, writeJSON, today } from "./wallet-lib.mjs";

export function reasoningHash(spend) {
  const payload = JSON.stringify({
    agent: spend.agent,
    amount_usdc: Number(spend.amount_usdc),
    recipient: spend.recipient,
    purpose: spend.purpose,
    hypothesis: spend.hypothesis,
    success_criteria: spend.success_criteria,
    experiment_id: spend.experiment_id,
  });
  return "0x" + createHash("sha256").update(payload).digest("hex");
}

export function verifyReasoning(txn) {
  return txn.reasoning_hash === reasoningHash(txn);
}

// 批量锚定：把当日未锚定的 reasoning_hash 合成批次根，写入 reasoning-anchors.json
export function anchorPendingHashes() {
  const ledger = readJSON(path.join(WALLET_DIR, "transactions.json"), { transactions: [] });
  const anchorsFile = path.join(WALLET_DIR, "reasoning-anchors.json");
  const anchors = readJSON(anchorsFile, { batches: [] });
  const pending = ledger.transactions.filter((t) => t.reasoning_hash && !t.anchored);
  if (pending.length === 0) return 0;
  const d = today();
  const joined = pending.map((t) => t.reasoning_hash).sort().join("");
  const root = "0x" + createHash("sha256").update(joined).digest("hex");
  anchors.batches.push({
    date: d,
    tx_count: pending.length,
    root,
    anchored_on_chain: false,
    chain_tx: null,
    members: pending.map((t) => ({ id: t.id, reasoning_hash: t.reasoning_hash })),
  });
  writeJSON(anchorsFile, anchors);
  // 标记已锚定
  for (const t of pending) t.anchored = true;
  writeJSON(path.join(WALLET_DIR, "transactions.json"), ledger);
  return pending.length;
}

if (process.argv[1] && import.meta.url === "file:///" + encodeURI(path.resolve(process.argv[1]).replace(/\\/g, "/"))) {
  const n = anchorPendingHashes();
  console.log(n > 0 ? `✅ 已锚定 ${n} 条推理哈希 → agent-wallet/reasoning-anchors.json` : "📭 无待锚定哈希");
}
