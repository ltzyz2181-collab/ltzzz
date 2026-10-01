// LTZZZ 钱包核心库 v2.1：策略检查 / 账本 / 熔断 / 信誉 / 双模式执行
// 模式：
//   dry-run  —— LTZZZ_WALLET_DRY_RUN=true 或未配私钥时安全模拟，不花一分钱
//   local    —— 配置 LTZZZ_WALLET_PRIVATE_KEY 后，ethers 直连 Base RPC 真实签名转账（无 Privy）
// 私钥只在 Actions 运行时存在于环境变量，绝不写入代码/日志/仓库文件。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WALLET_DIR = path.join(REPO_DIR, "agent-wallet");

export const USDC_DECIMALS = 6;
export const USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base USDC
export const DEFAULT_RPC = "https://mainnet.base.org";
export const USDC_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];

export const readJSON = (p, fallback) => {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return fallback; }
};
export const writeJSON = (p, data) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
};

export const loadPolicy = () => readJSON(path.join(WALLET_DIR, "spending-policy.json"), {});
export const loadLedger = () => readJSON(path.join(WALLET_DIR, "transactions.json"), { transactions: [], next_txn_id: 1, daily_summary: {}, monthly_summary: {}, circuit: { consecutive_failures: 0, halted: false, halted_at: null, hourly_window: [] }, refill: {} });
export const saveLedger = (l) => writeJSON(path.join(WALLET_DIR, "transactions.json"), l);
export const loadWallet = () => readJSON(path.join(WALLET_DIR, "ltzzz-wallet.json"), {});
export const saveWallet = (w) => writeJSON(path.join(WALLET_DIR, "ltzzz-wallet.json"), w);
export const loadReputation = () => readJSON(path.join(WALLET_DIR, "reputation.json"), { agents: {} });
export const saveReputation = (r) => writeJSON(path.join(WALLET_DIR, "reputation.json"), r);
export const loadSafe = () => readJSON(path.join(WALLET_DIR, "safe-treasury.json"), {});

export const today = () => new Date().toISOString().slice(0, 10);
export const nowIso = () => new Date().toISOString();
const usdcInt = (n) => Math.round(Number(n) * 10 ** USDC_DECIMALS);
const usdcFloat = (n) => Number(n) / 10 ** USDC_DECIMALS;

// —— 策略检查 ——
export function isAllowlisted(policy, recipient) {
  const r = String(recipient || "").trim().toLowerCase();
  if (!r) return false;
  const addresses = (policy.recipient_allowlist?.addresses || []).map((a) => a.toLowerCase());
  if (addresses.includes(r)) return true;
  const x402 = policy.recipient_allowlist?.x402_endpoints || [];
  return x402.some((u) => r.startsWith(String(u).toLowerCase()));
}

export function checkPolicy(policy, spend) {
  const errors = [];
  const g = policy.global_limits || {};
  const ep = policy.experiment_policy || {};
  const agentCfg = policy.agent_budgets?.[spend.agent];
  const amount = Number(spend.amount_usdc);
  if (!(amount > 0)) errors.push("amount 必须 > 0");
  if (g.max_per_transaction_usdc && amount > g.max_per_transaction_usdc) errors.push(`超过单笔限额 ${g.max_per_transaction_usdc} USDC`);
  if (!agentCfg) errors.push(`无 ${spend.agent} 预算配置`);
  if (ep.require_hypothesis && !(spend.hypothesis || "").trim()) errors.push("实验假设 hypothesis 必填（花钱必须可证伪）");
  if (ep.require_success_criteria && !(spend.success_criteria || "").trim()) errors.push("验收标准 success_criteria 必填");
  if (!isAllowlisted(policy, spend.recipient)) errors.push(`接收方不在白名单: ${spend.recipient}`);
  return { ok: errors.length === 0, errors };
}

// —— 预算 / 信誉 ——
export function multiplier(reputation, agent) {
  return reputation.agents?.[agent]?.multiplier ?? 1.0;
}
export function spentToday(ledger, agent) {
  const d = today();
  return (ledger.daily_summary?.[d]?.[agent]?.total_usdc ?? 0);
}
export function availableBudget(policy, reputation, agent, ledger) {
  const base = policy.agent_budgets?.[agent]?.daily_usdc ?? 0;
  const eff = base * multiplier(reputation, agent);
  return Math.max(0, Number((eff - spentToday(ledger, agent)).toFixed(6)));
}

// —— 熔断器 ——
export function circuitState(ledger) {
  return ledger.circuit || {};
}
export function checkCircuit(ledger, policy) {
  const c = circuitState(ledger);
  if (c.halted) return { ok: false, reason: `熔断器已触发（${c.halted_at}），需人工/Safe 解锁` };
  const cb = policy.circuit_breaker || {};
  const hourAgo = Date.now() - 3600_000;
  const window = (c.hourly_window || []).filter((w) => new Date(w.at).getTime() >= hourAgo);
  if (cb.max_transactions_per_hour && window.length >= cb.max_transactions_per_hour) {
    return { ok: false, reason: `1 小时内交易数达上限 ${cb.max_transactions_per_hour}` };
  }
  return { ok: true, window };
}
export function updateCircuit(ledger, { ok, amount, agent }) {
  const c = ledger.circuit || (ledger.circuit = {});
  c.hourly_window = (c.hourly_window || []).filter((w) => new Date(w.at).getTime() >= Date.now() - 3600_000);
  c.hourly_window.push({ at: nowIso(), ok, amount, agent });
  c.consecutive_failures = ok ? 0 : (c.consecutive_failures || 0) + 1;
  const policy = loadPolicy();
  const cb = policy.circuit_breaker || {};
  if (cb.enabled && !ok && c.consecutive_failures >= cb.consecutive_failures) {
    c.halted = true;
    c.halted_at = nowIso();
    c.halt_reason = `连续 ${c.consecutive_failures} 次失败`;
  }
}

// —— 执行层（自托管，无 Privy） ——
export function providerMode() {
  const dry = process.env.LTZZZ_WALLET_DRY_RUN === "true";
  if (dry) return { mode: "dry-run" };
  const pk = process.env.LTZZZ_WALLET_PRIVATE_KEY;
  if (pk && /^0x[0-9a-fA-F]{64}$/.test(pk.trim())) {
    return { mode: "local", privateKey: pk.trim(), rpc: process.env.LTZZZ_BASE_RPC || DEFAULT_RPC };
  }
  return { mode: "dry-run", reason: "未配置 LTZZZ_WALLET_PRIVATE_KEY，安全降级为 dry-run" };
}

export async function localWallet(prov) {
  const { Wallet, JsonRpcProvider, Contract } = await import("ethers");
  const provider = new JsonRpcProvider(prov.rpc);
  const wallet = new Wallet(prov.privateKey, provider);
  const usdc = new Contract(USDC_CONTRACT, USDC_ABI, wallet);
  return { provider, wallet, usdc };
}

export async function executeTransfer({ recipient, amountUsdc, purpose }) {
  const prov = providerMode();
  if (prov.mode === "dry-run") {
    const w = loadWallet();
    const sim = Number(w.simulated_balance_usdc ?? 0);
    if (sim < Number(amountUsdc)) throw new Error(`dry-run 余额不足（模拟 ${sim} USDC < ${amountUsdc}）`);
    w.simulated_balance_usdc = Number((sim - amountUsdc).toFixed(6));
    saveWallet(w);
    return { mode: "dry-run", hash: `0xDRYRUN-${Date.now().toString(16)}`, status: "dry_run", simulated_balance_after: w.simulated_balance_usdc };
  }
  const { usdc, wallet } = await localWallet(prov);
  const amount = BigInt(usdcInt(amountUsdc));
  const tx = await usdc.transfer(recipient, amount);
  const rcpt = await tx.wait();
  const w = loadWallet();
  w.address = wallet.address;
  w.wallet_id = "LOCAL-SELF-HOSTED";
  w.status = "initialized_local";
  saveWallet(w);
  return { mode: "local", hash: tx.hash, status: rcpt ? "confirmed" : "submitted" };
}

// —— 记账 ——
export function recordTxn(ledger, txn) {
  const id = `txn_${String(ledger.next_txn_id).padStart(4, "0")}`;
  ledger.next_txn_id += 1;
  const full = { id, timestamp: nowIso(), ...txn };
  ledger.transactions.push(full);
  const d = full.timestamp.slice(0, 10);
  const m = full.timestamp.slice(0, 7);
  const a = full.agent;
  ledger.daily_summary[d] = ledger.daily_summary[d] || {};
  ledger.monthly_summary[m] = ledger.monthly_summary[m] || {};
  for (const s of [ledger.daily_summary[d], ledger.monthly_summary[m]]) {
    s[a] = s[a] || { total_usdc: 0, count: 0 };
    s[a].total_usdc = Number((s[a].total_usdc + full.amount_usdc).toFixed(6));
    s[a].count += 1;
  }
  ledger.last_updated = nowIso();
  return full;
}

// —— 提案队列 ——
export function loadProposals(agent) {
  return readJSON(path.join(WALLET_DIR, "proposals", `${agent}.json`), []);
}
export function saveProposals(agent, list) {
  writeJSON(path.join(WALLET_DIR, "proposals", `${agent}.json`), list);
}
