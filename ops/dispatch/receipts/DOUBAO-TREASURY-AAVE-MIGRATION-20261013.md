# 接单回执：DOUBAO-TREASURY-AAVE-MIGRATION（2026-10-13）

派单来源：用户 2026-10-13 指令（统一归集至新执行金库 0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d）+ 总控 2026-10-12 迁移派单（ops/dispatch/DOUBAO-TREASURY-AAVE-MIGRATION-20261012.md）+ 总控 2026-10-13 续跑指令（1 USDC pilot 收尾执行）。
状态：**迁移已完成（verified_migrated）并推送；1 USDC pilot 被 worker 侧 market_exception 阻塞（资金安全，详见阻塞证据）；Safe 提案 A 已由 owner 执行成功（USDT 49.02 → 0xb99C…f905）；Aave 提现已核实网页版可操作、待 owner 发起**。

## 一、旧 Vault 迁移执行结果（2026-10-13 本地执行，09:57 UTC）

- 回执：knowledge/results/migrations/treasury-migration-local.json（**已提交 commit 9c99819 并推送**）
- 状态：verified_migrated；snapshot_before block 52,548,062 / after block 52,548,087
- **4 txHash（全部 receipt.status=1）**：
  - t1 withdrawUSDC(max)：`0x9413666e646f4c2be2f00e0b27ac2aa51d8e2c72a95b05af87187cba6a701fa5`（gas 202,213）
  - t2 skim()：`0x349936292f921d8e3d27e1c0e94f108869e224f04d8a36437ef24e1bf6e98d9b`（gas 52,234）
  - t3 USDC→新金库 39.013125：`0x49cda52c029ec89ca6d3b12972bfef0a38457bd0c6e74e1083cbbcd7c4a0eaf2`（gas 57,371）
  - t4 ETH 0.002 gas：`0x0f36d9c497a3d5293f00d161504519dd73bf802a288ca2b711a46d49adb150d6`（gas 21,000）
- 前后余额：旧 Vault aUSDC 20.018125→0；guardian USDC 18.995→0、ETH 0.010280265→0.008278262；新金库 0→USDC 39.013125/ETH 0.002。

## 二、1 USDC pilot 执行状态（阻塞，未上链）

- workflow：.github/workflows/treasury-migration-and-pilot.yml（commit d92ef71 换 auto 机制 + commit 1af2da7 修复 YAML 步骤名引号；均推送）
- dispatch：run 38396322543（12:18 UTC，head 1af2da7）——migration 步 success（no-op）、**supply auto 步 5 次全 `http:500 market_exception`**、exit/status/commit skipped
- **根因（高置信）**：DO 存储存在指向缺失 intent 对象的 stale `active_intent`（DOUBAO-AAVE-FIRST-38380985712），autoAave 无防御判断即 TypeError → 500；次要风险 publicnode RPC 间歇失效。认证与 RPC（mainnet.base.org/drpc）均正常。
- 详细证据与修复选项：**knowledge/results/migrations/pilot-market-exception-blocker-20261013.md**
- 链上终核（独立直读，block 52,552,571）：新金库 **USDC=39.013125、aUSDC=0、ETH=0.002**；status 端点 first_supply_confirmed=false、exit_test_confirmed=false。
- 待修复后重触发（选项 A：autoAave 防御 + RPC 顺序调整后经 deploy-wep3 重新部署；选项 B：临时 clear-intent admin 端点）。
- 关键 YAML 教训（已修复）：步骤名含 `: `（冒号+空格）必须加引号，否则 GitHub Actions 解析整个 workflow 失败（name 回退为路径、dispatch 422、push 自动运行瞬间失败）。

## 三、Safe（第②项）与个人 Aave（第③项）

- Safe：**提案 A 已执行成功**（2026-10-13 13:18 UTC，txHash `0xf7a6b07e5d4a5810e3886b8a663c0b8fb177a0857f63172234df02b70c8e064d`，nonce 6，3/5 签名：0xb99C…+0xD834…+0x01B8…，isSuccessful=true）：**USDT 49.02 已转至 0xb99C6751f443842F4987bb2017580405572Df905**（Safe signer#1 = owner MetaMask Account 1）；链上复核 block 26,183,894：Safe USDT=0、ETH=0.005、nonce=7。**提案 B（ETH 0.002，nonce 7）未执行**——需 owner 决定是否继续转出剩余 ETH。USDT→USDC 兑换 + Base 跨链提新金库待 owner 执行（先小额验证再余款，另留回执）。
- Aave：回执 knowledge/results/funding/aave-withdrawal-receipt-20261013.md（**已修正：Aave Account 为非托管钱包，支持网页版操作**，官方 Zellic 审计报告 2026-05 佐证；USDC≈$1,001.77；转出目标待 owner 确认——建议先小额直转新金库 0x5df5…32d 验证）；币安 1.58 AAVE 非 USDC 仓位，仅记录。

## 四、产物清单（已推送）

- scripts/treasury-migration.mjs、.github/workflows/treasury-migration-and-pilot.yml
- knowledge/results/migrations/：treasury-migration-local.json、treasury-migration-protocol-20261013.md、base-snapshot-20261013.json、safe-snapshot-20261013.json、safe-verification-20261013.json、safe-to-owner-builder-20261013.json、safe-owner-confirm-20261013.md、interface-verification-20261013.md、pilot-market-exception-blocker-20261013.md
- knowledge/results/funding/aave-withdrawal-receipt-20261013.md

执行通道声明：旧 guardian 动作仅走 GitHub Actions secret LTZZZ_WALLET_PRIVATE_KEY（迁移已完成，该 Secret 已不存在）；新金库动作仅走 Worker TREASURY_EXECUTOR_KEY（受限接口）；未读取/使用任何泄露私钥；回执不含任何密钥/token/pin。
