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

## Owner 本轮修订：交易所现金现货与一次外部 AI 采购

Owner 最新会话明确要求“安排 gpt xai 豆包 deep 真钱分别去欧易交易所和欧易 Web3 钱包 DeFi 投资，金额按每个 AI 声誉”，并要求一个外部 AI 真钱订单及直接部署。本段记录这一票授权，优先于上文仅 Aave 的旧范围；不是执行席自行提权。

本次固定订单真源为 `policy/funded-owner-round-20261017.json`：四席位按线上 WEP3 实时声誉分配，Aave 合计最多20 USDC，OKX BTC-USDT 现金现货合计最多20 USDT（IOC 限价、相对当前卖一价最多50bps偏差并预留费用），外部 AI 单单最多0.05 Base USDC。现货不得借贷、杠杆或提现；账户划转仅限下述 owner 后续授权的固定本账号入金路径；个人 Aave、Safe 和旧 Vault 不纳入。未核实账户权限/余额时不下单。

本轮只执行一次，持久订单ID、链上 intent_id、交易所 clOrdId 去重；重试只认领原订单或对账，未知成交状态不换ID再次买入。已有 cron 继续仅 dry-run，未增加自动重复真钱投资或付费模型定时。投资本金的分配是托管账，不是可兑现金内部积分；收益、费用和亏损按真实成交另记，均不保证。


### Owner 后续一票：为本轮交易所账户入金

Owner 明确要求“叫 AI 转钱到交易账户、资金账户中”，并表示将开通账户间转账权限。本轮追加的是既有20U交易所预算的资金来源和同账号划转权限，不增加20U预算。2026-10-17认证只读回执 `inspection-39004684738-attempt-1.json` 确认：当前OKX账号支持USDC-Base原生USDC，充值地址 `0x217ba12313a5555b3bd6d4cf64893f74e8fba117`，落资金账户6；账号身份哈希为 `dc5657b650a7580e`。

执行前重新认证核对账号、网络、合约、最小充值额和地址；固定金库仅可转20 Base USDC到该地址。必须链上成功且交易所按同一交易哈希确认入账后，才可按持久clientId从本账号资金账户6划到交易账户18。随后仅允许20USDC以内的USDC-USDT现金IOC卖出换币，四席位投资预算按实际净得USDT重新切分，最高仍20USDT。未知提交状态只对账，不重复创建。禁止对外提现、子账号转出、任意接收人、杠杆、个人Aave或旧Vault。

金库转往自己交易所账号是资产位置变化，不是收入、工资、采购支出或投资收益。投资完成另需真实Aave回执或交易所成交证明。
