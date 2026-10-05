# EXP-006 · 主网试点档首笔 supply（Base 主网 Aave V3）

- 状态：**PREPARED（等签名通道）**｜下发：owner 2026-10-05「aUSDC 补全后直接执行首笔 supply（≤20 USDC）」
- 门禁：方案 A 已裁定（见 EXP-005 第十一节，commit 628a0e9）——T1-T5 ✅ + EXP-004 WETH 演练 ✅ + deploy-vault.mjs 官方地址断言 ✅

## 一、链上参数（已全部核实，address-book 原文）

| 项 | 地址 | 来源 |
|---|---|---|
| 网络 | Base 主网（chainId 8453） | — |
| Aave V3 Pool | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` | AaveV3Base.POOL |
| USDC（储备） | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | AaveV3Base.USDC_UNDERLYING |
| aUSDC | `0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB` | AaveV3Base.USDC_A_TOKEN（2026-10-05 补全） |
| RPC | https://mainnet.base.org | 官方 |

## 二、执行步骤（签名通道就绪后按序执行）

1. `NETWORK=mainnet node invest-channel/scripts/deploy-vault.mjs` → 部署主网 Vault（官方地址断言 + 链上验证），记录部署 tx hash；
2. agent 钱包 `0x21F502f29294c50d9C37A30dc038D8D95eB97fdc` 确认 Base 主网 USDC 余额（≈40，≤20 试投）与 gas（需原生 ETH）；
3. `approve`：USDC → 主网 Vault（金额 = 试点金额）；
4. `depositUSDC(试点金额)` → `allocate(strategyId=1, 试点金额)`（Aave supply）；
5. 读 aUSDC 份额确认；
6. 回填 `agent-wallet/transactions.json`（agent=ltzzz-invest · status=confirmed · 真 tx_hash）；
7. 本报告追加「首笔执行回执」节：tx hash × N + aUSDC 份额 + 时间。

## 三、试点金额与边界

- 单笔 ≤20 USDC；敞口 ≤100 USDC；只投 Aave V3；禁区 revert；hypothesis/exit_plan/tx_hash 三件齐全才执行。
- hypothesis：Base 主网 Aave V3 USDC 供应 APY（无杠杆，纯底层利率）；exit_plan：任意时刻 withdraw 全量赎回回 agent 钱包，Vault 零残留。
- owner 个人 Aave 1000U 零接触；B 轨 Safe 不动。

## 四、阻塞点（诚实记录）

- **签名通道未就绪**：本执行环境（Linux VM）无 agent 钱包私钥（ltzzz-wallet.json 仅存地址）。首笔 supply 必须由持钥方签名。
- 可用签名通道（三选一，owner 定）：
  A. owner 将 agent 钱包私钥以 **env.OWNER_PK** 或本地 keyfile 注入执行环境（章程允许的运行时注入，不进对话不进仓库）→ 我直接跑完整 7 步；
  B. owner 在 Windows 本机 MetaMask 导入 agent 钱包 → 我提供签名的交易数据/参数，owner 确认广播（tx hash 回填我负责）；
  C. 维持测试网：Deep 一周循环（EXP-005）跑完后，测试网签核 + 主网签名通道再定。
- 未就绪前：不编造 tx hash、不标 confirmed。

## 五、下一步

- owner 选定签名通道后 30 分钟内完成首笔 supply 并回报 tx hash。
- 首笔成功 → 记入 EXP-006 回执节 → 通知 Grok/XAI/Deep 复核 → 决定第二笔节奏（遵循章程日限 60、单笔 20）。
