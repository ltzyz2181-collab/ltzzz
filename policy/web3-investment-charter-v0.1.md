# LTZZZ Web3 投资章程 v0.1（owner 一票确认 · 2026-10-04 生效）

> 签署方：owner（李天柱）｜执行席：豆包（代码+部署+测试）｜复核席：Grok/XAI｜守门席：Deep（代码复核）
> 生效条件：owner 一票确认（2026-10-04 会话内「按章程写」即确认）。

## 1. 标的与白名单（禁区代码层 revert）

- 仅允许：**Aave V3 Base 主网 / Base Sepolia 测试网**，资产 **USDC**。
- 白名单池：Aave V3 Pool（主网 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5，Sepolia 0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27，以官方 address-book 为准；主网尾缀已由 98d123 修正为 98d1c5）。
- 白名单资产：USDC（Base 主网 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913；Sepolia 测试 0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f）。
- 地址真值源唯一化：**以 bgd-labs/aave-address-book（src/AaveV3BaseSepolia.sol）为准**；本文件与 invest-channel/ 代码已对齐（2026-10-04 修正，消除双真值源）。部署时由 invest-channel/scripts/deploy-vault.mjs 做官方地址断言（per-network 硬校验），断言失败拒绝部署。
- 非白名单 pool/asset → 合约 revert（禁区不可绕过）。

## 2. 限额（代码化，不可被调用方覆盖）

- 试点档：单笔 ≤ **20 USDC**；累计敞口 ≤ **100 USDC**（默认档，无需审批）。
- 标准档：单笔 ≤ 500 USDC（需总控复核 + owner 一票）。
- 审批档：单笔 > 500 USDC（需 owner 显式签名）。
- 余额低于 5 USDC 自动停止新开仓位（告警，不自动关仓）。

## 3. 执行门禁（无 receipt 不算投资）

- 任何真实投资动作必须三件齐：**hypothesis（为什么投）→ exit_plan（何时/如何退出）→ tx_hash（链上证据）**。
- Sepolia 8 步演练全通（tx hash 齐全）后才许动主网。
- 主网首笔 = 试点档（≤20 USDC，Aave supply）。

## 4. 资金边界

- **owner 个人 Aave 仓位（1000U）AI 零接触**——不在任何白名单/调用路径内。
- 先测试 LTZZZ 自由资金（agent 钱包 40 USDC），跑通后再评估个人资金接入（需单独授权）。

## 5. 风险与退出

- 平台风险：Aave 合约/Base 网络；无常损失不适用（单资产 USDC supply）。
- 退出：withdraw 随时可执行（Aave 无锁定期）；退出后 USDC 回 agent 钱包。
- 最大损失场景：Aave 池故障/网络故障 → 计入 LTZZZ 实验预算（试点档总额 100U 封顶）。

## 6. 治理

- 章程修改需 owner 一票；执行席不得自行扩大限额/白名单。
- 每笔真实投资落 knowledge/results/ 报告（hypothesis/exit_plan/tx_hash）。
