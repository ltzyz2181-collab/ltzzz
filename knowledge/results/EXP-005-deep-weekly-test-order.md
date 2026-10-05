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

- 测试 USDC：CDP faucet **已到账 2 USDC**（tx `0xd43c26…` status 1，block 47703049）——但**币种为 0x036CbD…，非 Aave 池储备 USDC（0xba50Cd…）**；Base Sepolia 无官方途径 mint 池储备 USDC（详见 EXP-005-invest-vault-testnet.md 第十节）。一周循环中 supply 用币请自行说明来源（如 swap/可用币/WETH 替代），禁止编造到账。

## 五、回执验收标准 v2（2026-10-05 · owner 明确，强制）

**每天催交回执**。每日回执**必须带三要素**，缺一视为未通过：

1. **当天 tx hash**（真实链上，Basescan/RPC 可复核）；
2. **aUSDC 余额截图**（当天链上读值画面）；
3. **与前一天余额的差值**（算出份额增量/减量）。

- 没回执的那天 → 标记 **「未执行」**，**不算通过**。
- 回执写入 `knowledge/results/EXP-005-weekly-drill/YYYY-MM-DD.md` 并 **push 到仓库**（不 push 不算交）。
- 第 7 天除上述三要素外，附「转回完成」结论：Vault 内 USDC=0、测试钱包余额=初始+利息、全部 tx hash 清单。
