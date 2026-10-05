# EXP-005-DEEP · 给 DeepSeek 的「一周投资测试 + 转回」执行指令

- 下发：豆包（2026-10-04）｜执行：DeepSeek（复核席转执行席，owner 点名）
- 前置：Vault v1.2 已部署并完成合约级验证（见 knowledge/results/EXP-005-invest-vault-testnet.md，commit 5940bdf）

## 一、你的任务（owner 原话：测试投资一个礼拜，然后转回 ltzzz）

1. **复核**（先做）：按 EXP-005 报告的 9 项审核清单审 `invest-channel/contracts/LTZZZVault.sol` 与 `adapters/AaveAdapter.mjs`，逐项给出 ✅/❌ 及理由。
2. **一周投资循环测试**（Base Sepolia，chainId 84532，全部真实 tx，每日 1 轮）：
   - 第 1-6 天：`depositUSDC(amount)` → `allocate(strategyId=1, amount)`（supply 进 Aave）→ 读 `aUSDC` 余额确认份额 → 记录每笔 tx hash。
   - 第 7 天：`withdrawUSDC(amount)` 全量赎回 → 确认 USDC 回到 Vault/测试账户 → **转回 ltzzz**（测试网 USDC 归集到测试钱包 `0x4b6D3ebEf9577E2935D7ff32bB5E61E8514E311D`，Vault 内零残留）。
   - 金额建议：测试币 20-50 USDC 区间（mint 或 faucet 到账为准），单笔 ≤ 100 USDC 不触发 alert。
3. **异常分支**（至少各 1 次）：非白名单 strategyId=99 → ForbiddenTarget；amount 超日限 → DAILY_CAP；陌生地址调用 → NOT_AUTHORIZED；pause → PAUSED。
4. **回执格式**（每日追加到 `knowledge/results/EXP-005-weekly-drill/`，一天一个文件）：
   日期 | 动作 | tx hash | status | aUSDC 余额 | 失败与原因。第 7 天附「转回完成」结论（Vault 内 USDC=0，测试钱包余额=初始+利息）。

## 二、硬性约束（红线）

- 私钥/卡号/CVV 不进对话不进仓库；私钥读 env.OWNER_PK 或本地 keyfile（`C:\Users\李天柱\Documents\ltzzz-test-wallet.txt`，读后不得输出）。
- 无 receipt（tx hash）不得标 confirmed；测试失败按 dry_run/失败如实记录，禁止虚报成功。
- 主网（Base mainnet）**严禁**动：owner 个人 Aave 1000U 零接触；ltzzz 自有资金主网试点档（≤20U）需测试网一周通过 + XAI 复核 + 总控复核三关全过才开门。
- 合约地址唯一信源：bgd-labs/aave-address-book `src/AaveV3BaseSepolia.sol`（POOL 0x8bAB…、USDC 0xba50…、aUSDC 0x10F1…）。

## 三、交付

- 第 7 天：一周测试报告（含全部 tx hash 清单 + 异常分支记录 + 转回凭证）落盘并 push。
- 通过后：由你出具「测试网一周通过」签核，供总控/XAI 复核后决定主网试点档开闸。

## 四、状态

- 测试 USDC：等 Coinbase CDP faucet 发放（豆包正在处理）；测试钱包 ETH 0.0000026（gas 足够小额 tx，若不足会再领）。
