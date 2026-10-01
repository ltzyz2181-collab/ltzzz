// 收集各 AI 今日产出里的 SPEND_PROPOSAL 块 → 写入 agent-wallet/proposals/<agent>.json（status: pending）
// 协议：AI 在产出中输出一行 JSON：SPEND_PROPOSAL: {"amount_usdc":1,"recipient":"0x...","purpose":"...","hypothesis":"...","success_criteria":"...","experiment_id":"exp_x"}
// 或输出包含以上字段的 ```json 代码块。collect 脚本校验必填字段后入队，由 ltzzz-wallet-ops.yml 每 6h 执行。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_DIR, WALLET_DIR, readJSON, writeJSON, today } from "./wallet-lib.mjs";

const REQUIRED = ["amount_usdc", "recipient", "purpose", "hypothesis", "success_criteria"];

function extractProposals(output) {
  const out = String(output || "");
  const found = [];
  // 1) SPEND_PROPOSAL: {...} 单行/多行
  const re1 = /SPEND_PROPOSAL\s*[:：]?\s*(\{[^\n]*\})/g;
  let m;
  while ((m = re1.exec(out))) {
    try { found.push(JSON.parse(m[1])); } catch { /* skip */ }
  }
  // 2) ```json 代码块中包含 amount_usdc + experiment_id
  const re2 = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g;
  while ((m = re2.exec(out))) {
    try {
      const o = JSON.parse(m[1]);
      if (o && "amount_usdc" in o && "experiment_id" in o) found.push(o);
    } catch { /* skip */ }
  }
  return found;
}

export function collectSpendProposals() {
  const d = today();
  const agents = ["gpt", "doubao", "deepseek", "grok", "claude", "microsoft"];
  let total = 0;
  for (const agent of agents) {
    const mem = readJSON(path.join(REPO_DIR, "data", "memory", `${agent}.json`), { entries: [] });
    const todayEntries = (mem.entries || []).filter((e) => e.date === d);
    const props = extractProposals(todayEntries.map((e) => e.output).join("\n"));
    if (props.length === 0) continue;
    const queue = readJSON(path.join(WALLET_DIR, "proposals", `${agent}.json`), []);
    const existing = new Set(queue.map((q) => q.id));
    for (const p of props) {
      const missing = REQUIRED.filter((k) => !(p[k] !== undefined && String(p[k]).trim() !== ""));
      if (missing.length) {
        console.log(`[collect] ${agent}: 提案缺字段 ${missing.join(",")}，丢弃`);
        continue;
      }
      const id = `prop_${agent}_${p.experiment_id || Date.now().toString(36)}`;
      if (existing.has(id)) continue;
      queue.push({ id, agent, amount_usdc: Number(p.amount_usdc), recipient: p.recipient, purpose: p.purpose, hypothesis: p.hypothesis, success_criteria: p.success_criteria, experiment_id: p.experiment_id || null, status: "pending" });
      existing.add(id);
      total += 1;
    }
    if (queue.length) writeJSON(path.join(WALLET_DIR, "proposals", `${agent}.json`), queue);
  }
  return total;
}

// 命令行直接运行
if (process.argv[1] && import.meta.url === "file:///" + encodeURI(path.resolve(process.argv[1]).replace(/\\/g, "/"))) {
  const n = collectSpendProposals();
  console.log(`[collect] 收集到 ${n} 条新花钱提案 → agent-wallet/proposals/`);
}
