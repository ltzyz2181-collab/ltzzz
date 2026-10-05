#!/usr/bin/env node
/**
 * AaveAdapter.mjs — LTZZZ Invest · LTZZZ-INVEST-AAVE-001 v1.2（主写：豆包 / 复核：DeepSeek）
 *
 * 职责：Aave V3 Base Sepolia 只读余额 + 构建 supply/withdraw calldata。
 * 设计：buildXxxTx() 返回 calldata，签名与广播分离（signTx / broadcastRaw 独立）。
 * 安全：不存私钥；私钥从环境变量 OWNER_PK 读取（运行时注入，禁止明文/硬编码）。
 *
 * 官方地址来源（aave-address-book · github.com/bgd-labs/aave-address-book · src/AaveV3BaseSepolia.sol）
 *   POOL = 0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27（Base Sepolia，2026-10-03 克隆核对）
 *   USDC = 0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f
 *   aUSDC = 0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC
 * 主网地址不写死（部署前替换，参考 Base 主网 Pool 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5 待核）。
 *
 * 用法：
 *   node adapters/AaveAdapter.mjs --action getBalance --account personal_test
 *   node adapters/AaveAdapter.mjs --action buildSupplyTx --amount 10 --account ltzzz_ops --output tx.json
 *   node adapters/AaveAdapter.mjs --action buildWithdrawTx --amount 10 --account ltzzz_ops --output tx.json
 *   node adapters/AaveAdapter.mjs --action signTx --tx-file tx.json --output signed.json
 *   node adapters/AaveAdapter.mjs --action broadcastRaw --tx-file signed.json
 * 环境变量：OWNER_PK（私钥）、RPC_URL（默认 Base Sepolia 公共 RPC）
 */
import { ethers } from "ethers";
import fs from "node:fs";

// ─── 地址（写死，附官方来源 URL）───
const ADDR = {
  pool: "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27",       // AaveV3BaseSepolia.POOL
  usdc: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",       // AaveV3BaseSepolia.USDC_UNDERLYING
  ausdc: "0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC",      // AaveV3BaseSepolia.USDC_A_TOKEN
  source: "github.com/bgd-labs/aave-address-book src/AaveV3BaseSepolia.sol (2026-10-03 verified)"
};

// ─── 限额占位常量（与 spending-policy 联动；主网部署前按 policy 值替换）───
const LIMITS = {
  SINGLE_CAP: 100e6,        // 单笔上限 100 USDC（> 此值触发 TG alert）
  DAILY_CAP: 200e6,         // 日限 200 USDC（占位，须与 policy/AGI-PAY 一致后更新）
  MAX_ALLOCATION_PCT: 50    // 单笔 ≤ 账户余额 50%
};

// ─── 分账户（personal_test 先测；ltzzz_ops 为运营池）───
const ACCOUNTS = {
  personal_test: { keyEnv: "OWNER_PK", label: "owner personal test pool" },
  ltzzz_ops: { keyEnv: "OWNER_PK", label: "ltzzz operations pool" }
};

const RPC = process.env.RPC_URL || "https://base-sepolia.drpc.org";

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1] : def;
}
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`缺少环境变量 ${name}（运行时注入，不落盘）`);
  return v;
}

const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)"
];
const poolAbi = [
  "function supply(address,uint256,address,uint16)",
  "function withdraw(address,uint256,address)"
];

async function provider() {
  return new ethers.JsonRpcProvider(RPC, 84532, { staticNetwork: true });
}

async function main() {
  const action = arg("action", "getBalance");
  const accountName = arg("account", "personal_test");
  const acct = ACCOUNTS[accountName];
  if (!acct) throw new Error(`未知账户: ${accountName}（可选 personal_test | ltzzz_ops）`);

  const p = await provider();

  if (action === "getBalance") {
    const wallet = new ethers.Wallet(requireEnv(acct.keyEnv), p);
    const usdc = new ethers.Contract(ADDR.usdc, erc20Abi, p);
    const ausdc = new ethers.Contract(ADDR.ausdc, erc20Abi, p);
    const eth = await p.getBalance(wallet.address);
    const u = await usdc.balanceOf(wallet.address);
    const a = await ausdc.balanceOf(wallet.address);
    console.log(JSON.stringify({
      account: accountName, address: wallet.address,
      eth: ethers.formatEther(eth), usdc: ethers.formatUnits(u, 6), ausdc: ethers.formatUnits(a, 6),
      source: ADDR.source
    }, null, 2));
    return;
  }

  if (action === "buildSupplyTx" || action === "buildWithdrawTx") {
    const amount = parseFloat(arg("amount"));
    if (!amount || amount <= 0) throw new Error("--amount 必填（USDC 数）");
    const amountRaw = ethers.parseUnits(amount.toFixed(6), 6);
    if (action === "buildSupplyTx" && amountRaw > LIMITS.SINGLE_CAP) {
      console.warn(`⚠️ 单笔 ${amount} USDC 超过 SINGLE_CAP=${LIMITS.SINGLE_CAP/1e6} → 记得触发 guardian-alert.mjs`);
    }
    const wallet = new ethers.Wallet(requireEnv(acct.keyEnv), p);
    const pool = new ethers.Contract(ADDR.pool, poolAbi, wallet);
    const data = action === "buildSupplyTx"
      ? pool.interface.encodeFunctionData("supply", [ADDR.usdc, amountRaw, wallet.address, 0])
      : pool.interface.encodeFunctionData("withdraw", [ADDR.usdc, amountRaw, wallet.address]);
    const tx = {
      to: ADDR.pool, data, from: wallet.address,
      chainId: 84532,
      action, account: accountName, amountUsdc: amount, amountRaw: amountRaw.toString(),
      note: "signTx 后 broadcastRaw；与广播分离"
    };
    const out = arg("output");
    if (out) fs.writeFileSync(out, JSON.stringify(tx, null, 2));
    console.log(JSON.stringify(tx, null, 2));
    return;
  }

  if (action === "signTx") {
    const txFile = arg("tx-file");
    if (!txFile) throw new Error("--tx-file 必填");
    const txObj = JSON.parse(fs.readFileSync(txFile, "utf8"));
    const wallet = new ethers.Wallet(requireEnv("OWNER_PK"), p);
    const signed = await wallet.signTransaction({
      to: txObj.to, data: txObj.data, chainId: 84532, type: 2,
      maxFeePerGas: ethers.parseUnits("0.05", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("0.01", "gwei")
    });
    const out = arg("output", "signed.json");
    fs.writeFileSync(out, JSON.stringify({ signed, note: "用 broadcastRaw 广播" }, null, 2));
    console.log("签名完成:", out);
    return;
  }

  if (action === "broadcastRaw") {
    const txFile = arg("tx-file");
    if (!txFile) throw new Error("--tx-file 必填");
    const { signed } = JSON.parse(fs.readFileSync(txFile, "utf8"));
    const tx = await p.broadcastTransaction(signed);
    console.log("广播 tx:", tx.hash);
    const r = await tx.wait();
    console.log("status:", r.status, "gasUsed:", r.gasUsed.toString());
    return;
  }

  throw new Error(`未知 action: ${action}`);
}

main().catch(e => { console.error("ERR:", e.message); process.exit(1); });
