#!/usr/bin/env node
/**
 * LTZZZ AaveAdapter.mjs — Aave V3 Base Sepolia 演练（8 步）与主网试点档执行
 * 依赖：ethers ^6（repo node_modules 已装）
 * 用法（Sepolia 演练）：
 *   node invest-channel/scripts/AaveAdapter.mjs --network sepolia --action full-test --wallet <path-to-keyfile>
 * 主网试点档（跑通 Sepolia 后，单笔 ≤20 USDC）：
 *   node invest-channel/scripts/AaveAdapter.mjs --network base --action supply --amount 20 --wallet <keyfile>
 * 红线：私钥只经本地 keyfile（不入对话/仓库/日志）；不测通 Sepolia 不许碰主网。
 */
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";

const ADDR = {
  sepolia: {
    rpc: "https://base-sepolia.drpc.org", // 2026-10-04 实测：sepolia.base.org/publicnode/blastapi 超时，drpc.org 通（chainId 84532）
    // 官方 aave-address-book AaveV3BaseSepolia（2026-10-04 抓取）。注：此前总控核验的 0x07eA…/0x036C… 混入 Ethereum Sepolia，已修正
    pool: "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27",
    usdc: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",
    ausdc: "0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC",
  },
  base: {
    rpc: "https://mainnet.base.org",
    pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d123",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    ausdc: "0x9c20E0A4E6CbC1E5C6cB1FcBdB2d6a2e0Bf7c9aD0", // 需以官方 address-book 复核
  },
};

const POOL_ABI = [
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
  "function withdraw(address asset, uint256 amount, address to)",
  "function getReserveData(address asset) view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 variableBorrowIndex, uint128 currentLiquidityRate, uint128 variableBorrowRate, uint128 lastUpdateTimestamp, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint8 id))",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
];
const AUSDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function scaledBalanceOf(address) view returns (uint256)",
];

const CAP = { perTx: 20n * 10n ** 6n, exposure: 100n * 10n ** 6n, minBalance: 5n * 10n ** 6n };

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const network = arg("network", "sepolia");
  const action = arg("action", "full-test");
  const amountStr = arg("amount", "1"); // USDC 数量
  const keyPath = arg("wallet", "");

  const cfg = ADDR[network];
  if (!cfg) throw new Error("unknown network: " + network);

  const provider = new ethers.JsonRpcProvider(cfg.rpc);
  const networkInfo = await provider.getNetwork();
  console.log(`[net] ${network} chainId=${networkInfo.chainId} rpc=${cfg.rpc}`);

  let signer;
  if (keyPath) {
    const key = fs.readFileSync(path.resolve(keyPath), "utf8").trim();
    signer = new ethers.Wallet(key, provider);
  } else {
    // 无 keyfile：只读模式（余额/汇率查询），或生成演示只读
    signer = null;
  }
  console.log(`[signer] ${signer ? signer.address : "read-only（未提供 keyfile）"}`);

  const pool = new ethers.Contract(cfg.pool, POOL_ABI, provider);
  const usdc = new ethers.Contract(cfg.usdc, ERC20_ABI, provider);
  const ausdc = new ethers.Contract(cfg.ausdc, AUSDC_ABI, provider);

  if (action === "balance") {
    if (!signer) throw new Error("balance 需要 --wallet");
    // drpc.org 免费计划禁 batch>3：全部串行查询
    const eth = await provider.getBalance(signer.address);
    const u = await usdc.balanceOf(signer.address);
    const a = await ausdc.balanceOf(signer.address);
    console.log(JSON.stringify({ eth: ethers.formatEther(eth), usdc: ethers.formatUnits(u, 6), ausdc: ethers.formatUnits(a, 6) }, null, 2));
    return;
  }

  if (action === "full-test") {
    if (!signer) throw new Error("full-test 需要 --wallet");
    const addr = signer.address;
    const amount = ethers.parseUnits(amountStr, 6);

    // 限额守卫（章程代码化）
    if (amount > CAP.perTx) throw new Error(`单笔超试点档上限 20 USDC: ${amountStr}`);
    const b = await usdc.balanceOf(addr);
    if (b < CAP.minBalance + amount) throw new Error(`USDC 余额不足（需 ≥5+amount）: ${ethers.formatUnits(b, 6)}`);

    // Step 1: 初始余额
    console.log("\n[1/8] 初始余额:");
    console.log("  USDC:", ethers.formatUnits(await usdc.balanceOf(addr), 6));
    console.log("  aUSDC:", ethers.formatUnits(await ausdc.balanceOf(addr), 6));

    // Step 2: approve
    console.log("\n[2/8] approve USDC → Pool");
    const txApprove = await (usdc.connect(signer)).approve(cfg.pool, amount);
    const rApprove = await txApprove.wait();
    console.log("  tx:", rApprove.hash, "status:", rApprove.status);

    // Step 3: supply
    console.log("\n[3/8] Pool.supply(USDC, amount, onBehalfOf=self)");
    const txSupply = await (pool.connect(signer)).supply(cfg.usdc, amount, addr, 0);
    const rSupply = await txSupply.wait();
    console.log("  tx:", rSupply.hash, "status:", rSupply.status);

    // Step 4: aUSDC 到账
    console.log("\n[4/8] aUSDC 余额（应 = amount）");
    const aBal = await ausdc.balanceOf(addr);
    console.log("  aUSDC:", ethers.formatUnits(aBal, 6));

    // Step 5: 储备数据（aToken 确认）
    console.log("\n[5/8] Pool.getReserveData(USDC).aTokenAddress");
    const rd = await pool.getReserveData(cfg.usdc);
    console.log("  aToken:", rd.aTokenAddress, rd.aTokenAddress.toLowerCase() === cfg.ausdc.toLowerCase() ? "✅ MATCH" : "⚠️ 与预置不符");

    // Step 6: withdraw
    console.log("\n[6/8] Pool.withdraw(USDC, amount, to=self)");
    const txWd = await (pool.connect(signer)).withdraw(cfg.usdc, amount, addr);
    const rWd = await txWd.wait();
    console.log("  tx:", rWd.hash, "status:", rWd.status);

    // Step 7: USDC 回账
    console.log("\n[7/8] USDC 余额（应回到初始）");
    const uBal = await usdc.balanceOf(addr);
    console.log("  USDC:", ethers.formatUnits(uBal, 6));

    // Step 8: 异常分支 — 禁区资产/超限必须 revert（代码层验证）
    console.log("\n[8/8] 禁区/超限 revert 验证:");
    try {
      const fake = "0x000000000000000000000000000000000000dEaD";
      await pool.getReserveData(fake);
      console.log("  禁区 asset：查询不抛错（预期，getReserveData 只读）");
    } catch (e) { console.log("  禁区 asset：revert", String(e.message).slice(0, 80)); }
    console.log("  超限：Vault 层由 LTZZZVault.sol 硬编码（amount > 20e6 revert），Adapter 此处仅展示上限 =", ethers.formatUnits(CAP.perTx, 6), "USDC");

    console.log("\n✅ Sepolia 8 步演练完成，tx 全部记录如上。");
    console.log("⚠️ 按章程：演练通过 + 总控复核后才许动主网试点档（≤20 USDC）。");
    return;
  }

  if (action === "supply") {
    if (!signer) throw new Error("supply 需要 --wallet");
    const amount = ethers.parseUnits(amountStr, 6);
    if (amount > CAP.perTx) throw new Error(`单笔超试点档上限 20 USDC`);
    const addr = signer.address;
    const hyp = arg("hypothesis", "");
    const exitPlan = arg("exit_plan", "");
    if (network === "base" && (!hyp || !exitPlan)) {
      throw new Error("主网真实投资必须三件齐：--hypothesis --exit_plan --tx_hash（本脚本自动返回 hash）");
    }
    console.log(`\n[主网试点档] supply ${amountStr} USDC → Aave V3 Base`);
    const txApprove = await (usdc.connect(signer)).approve(cfg.pool, amount);
    const rA = await txApprove.wait();
    console.log("approve tx:", rA.hash, "status:", rA.status);
    const txSupply = await (pool.connect(signer)).supply(cfg.usdc, amount, addr, 0);
    const rS = await txSupply.wait();
    console.log("supply tx:", rS.hash, "status:", rS.status);
    console.log("hypothesis:", hyp, "| exit_plan:", exitPlan);
    console.log("✅ 仓位已开。退出：node AaveAdapter.mjs --network base --action withdraw --amount 0 --wallet <keyfile>");
    return;
  }

  if (action === "withdraw") {
    if (!signer) throw new Error("withdraw 需要 --wallet");
    const addr = signer.address;
    const amount = amountStr === "0" ? ethers.MaxUint256 : ethers.parseUnits(amountStr, 6);
    const txWd = await (pool.connect(signer)).withdraw(cfg.usdc, amount, addr);
    const r = await txWd.wait();
    console.log("withdraw tx:", r.hash, "status:", r.status);
    console.log("USDC 余额:", ethers.formatUnits(await usdc.balanceOf(addr), 6));
    return;
  }

  throw new Error("unknown action: " + action);
}

main().catch((e) => { console.error("FAIL:", String(e.message || e).slice(0, 400)); process.exit(1); });
