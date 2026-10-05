#!/usr/bin/env node
/**
 * deploy-vault.mjs — LTZZZVault v1.2 正式部署脚本（带官方地址断言 + 链上验证）
 * 任务：LTZZZ-INVEST-AAVE-001 v1.2 收尾 · 堵「部署期无官方地址校验」缺口（GPT 观察席复议项）
 *
 * 用法（PowerShell）：
 *   $env:OWNER_PK="0x..."            # 部署钱包私钥（运行时注入，不落盘）
 *   $env:NETWORK="sepolia"           # sepolia（默认）| mainnet（mainnet 段 aToken 为 TBD，部署前必须补）
 *   node invest-channel/scripts/deploy-vault.mjs
 *
 * 流程：
 *   1) 按 NETWORK 校验传入的 pool/usdc/aToken == 官方 address-book 地址（不匹配 → exit 1，拒绝部署）
 *   2) 用 %TEMP%\solc.exe (0.8.23) 编译 LTZZZVault.sol 取 ABI+bytecode
 *   3) 部署 Vault（guardian 默认测试钱包；signers 默认 5 签集）
 *   4) 链上验证：guardian / allowlist[1]==pool / maxDailyUsdc / paused 回读比对
 *   5) 输出 _deployed.json（与既有结构兼容）
 *
 * 地址来源：github.com/bgd-labs/aave-address-book · src/AaveV3BaseSepolia.sol（2026-10-03 克隆核对）
 */
import { ethers } from "ethers";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

// ─── 官方地址（per-network，真值源唯一）───
const ADDR = {
  sepolia: {
    pool: "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27",   // AaveV3BaseSepolia.POOL
    usdc: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",   // AaveV3BaseSepolia.USDC_UNDERLYING
    ausdc: "0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC",  // AaveV3BaseSepolia.USDC_A_TOKEN
    note: "aave-address-book AaveV3BaseSepolia (2026-10-03 verified)"
  },
  mainnet: {
    pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",   // AaveV3Base.POOL（2026-10-05 address-book 原文核实）
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",   // AaveV3Base.USDC_UNDERLYING（Base 主网 Circle USDC）
    ausdc: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",   // AaveV3Base.USDC_A_TOKEN（2026-10-05 address-book 原文核实，原 TBD 已补全）
    note: "AaveV3Base — 2026-10-05 aUSDC 已从官方 address-book 补全，mainnet 可部署"
  }
};

const DEFAULT_SIGNERS = [
  "0x4b6D3ebEf9577E2935D7ff32bB5E61E8514E311D", // 测试钱包
  "0x21F502f29294c50d9C37A30dc038D8D95eB97fdc", // agent EOA
  "0xD834a769b31447daf5a042009CF06fAFCE7e2F51", // guardian EOA
  "0x76379a52a9e82c259E5Db417104C65C26f9C58a3", // Safe B 轨
  "0xA315E37028c0AFe95C7da3D101f83f0111fC491A"  // 回收地址（signer 席位，仅否决权）
];

function env(name, def) {
  const v = process.env[name];
  return v === undefined ? def : v;
}
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`缺少环境变量 ${name}（运行时注入，不落盘）`);
  return v;
}

async function main() {
  const net = env("NETWORK", "sepolia");
  const addr = ADDR[net];
  if (!addr) throw new Error(`未知 NETWORK: ${net}（可选 sepolia | mainnet）`);
  if (addr.ausdc === "TBD") throw new Error(`NETWORK=${net} 的 aToken 未补齐（ADDR.${net}.ausdc=TBD），禁止部署`);

  const pk = requireEnv("OWNER_PK");
  const rpc = env("RPC_URL", net === "sepolia"
    ? "https://base-sepolia.drpc.org"
    : "https://mainnet.base.org");
  const provider = new ethers.JsonRpcProvider(rpc, net === "sepolia" ? 84532 : 8453, { staticNetwork: true });
  const wallet = new ethers.Wallet(pk, provider);

  // ─── 1) 官方地址断言（部署期硬校验）───
  const guardian = env("GUARDIAN", "0x4b6D3ebEf9577E2935D7ff32bB5E61E8514E311D");
  const poolArg = env("POOL", addr.pool).toLowerCase();
  const usdcArg = env("USDC", addr.usdc).toLowerCase();
  const aTokenArg = env("A_TOKEN", addr.ausdc).toLowerCase();
  if (poolArg !== addr.pool.toLowerCase()) throw new Error(`POOL 断言失败：${poolArg} != 官方 ${addr.pool}（${addr.note}）`);
  if (usdcArg !== addr.usdc.toLowerCase()) throw new Error(`USDC 断言失败：${usdcArg} != 官方 ${addr.usdc}（${addr.note}）`);
  if (aTokenArg !== addr.ausdc.toLowerCase()) throw new Error(`A_TOKEN 断言失败：${aTokenArg} != 官方 ${addr.ausdc}（${addr.note}）`);
  console.log(`✅ 地址断言通过（${net}）：pool=${addr.pool} usdc=${addr.usdc} aToken=${addr.ausdc}`);

  // ─── 2) 编译（%TEMP%\solc.exe 0.8.23）───
  const solcPath = env("SOLC_PATH", path.join(os.tmpdir(), "solc.exe"));
  const solPath = path.resolve(env("SOL_PATH", "invest-channel/contracts/LTZZZVault.sol"));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "ltzzz-solc-"));
  execSync(`"${solcPath}" --abi --bin -o "${outDir}" "${solPath}"`, { stdio: "inherit" });
  const abi = JSON.parse(fs.readFileSync(path.join(outDir, "LTZZZVault.abi"), "utf8"));
  const bin = fs.readFileSync(path.join(outDir, "LTZZZVault.bin"), "utf8").trim();
  console.log(`✅ 编译完成：bytecode ${bin.length / 2} bytes`);

  // ─── 3) 部署 ───
  const maxDaily = ethers.parseUnits(env("MAX_DAILY_USDC", "200"), 6); // 200 USDC
  const signers = env("SIGNERS", DEFAULT_SIGNERS.join(",")).split(",").map(s => s.trim());
  if (signers.length !== 5) throw new Error(`SIGNERS 必须 5 个，当前 ${signers.length}`);
  const factory = new ethers.ContractFactory(abi, "0x" + bin, wallet);
  console.log(`部署中（guardian=${guardian} maxDaily=${ethers.formatUnits(maxDaily, 6)} USDC）...`);
  const vault = await factory.deploy(guardian, addr.pool, addr.usdc, addr.ausdc, maxDaily, signers);
  const receipt = await vault.deploymentTransaction().wait();
  console.log(`✅ 部署 tx: ${receipt.hash}  block: ${receipt.blockNumber}  status: ${receipt.status}  Vault: ${await vault.getAddress()}`);

  // ─── 4) 链上验证 ───
  const v = new ethers.Contract(await vault.getAddress(), abi, provider);
  const [g, al, md, ps] = await Promise.all([
    v.guardian(), v.allowlist(1), v.maxDailyUsdc(), v.paused()
  ]);
  const checks = {
    guardian: g === guardian ? "OK" : `MISMATCH(${g})`,
    allowlist1_isPool: al.toLowerCase() === addr.pool.toLowerCase() ? "OK" : `MISMATCH(${al})`,
    maxDailyUsdc: md.toString() === maxDaily.toString() ? `OK(${ethers.formatUnits(md, 6)}U)` : `MISMATCH(${md})`,
    paused: ps === false ? "OK(false)" : `UNEXPECTED(${ps})`
  };
  console.log("链上验证:", JSON.stringify(checks, null, 2));
  const allOk = Object.values(checks).every(c => c.startsWith("OK") || c.includes("OK"));
  if (!allOk) throw new Error("链上验证未全过，禁止记录为已部署");

  // ─── 5) 输出 _deployed.json ───
  const out = {
    network: net, vault: await vault.getAddress(), deployTx: receipt.hash,
    block: receipt.blockNumber, guardian, maxDailyUsdc: maxDaily.toString(),
    pool: addr.pool, usdc: addr.usdc, aToken: addr.ausdc,
    signers, source: addr.note,
    verified: checks, deployedAt: new Date().toISOString(),
    note: net === "sepolia" ? "测试网部署（T6 USDC 演练目标）" : "主网试点档部署（需章程门禁全过）"
  };
  const outFile = path.resolve("invest-channel/_deployed.json");
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`✅ 已写入 ${outFile}`);
}

main().catch(e => { console.error("ERR:", e.message); process.exit(1); });
