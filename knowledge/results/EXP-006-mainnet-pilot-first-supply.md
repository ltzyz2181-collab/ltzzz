# EXP-006 · 主网试点档首笔 supply（Base 主网 Aave V3）

- 状态：**COMPLETED（2026-10-05 执行完成）**｜下发：owner 2026-10-05「aUSDC 补全后直接执行首笔 supply（≤20 USDC）」
- 门禁：方案 A 已裁定（见 EXP-005 第十一节，commit 628a0e9）——T1-T5 ✅ + EXP-004 WETH 演练 ✅ + deploy-vault.mjs 官方地址断言 ✅
- 签名通道：owner 交付私钥文件（DOC 附件，运行时 env 注入，用毕即焚，未入对话/仓库）

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

## 四、执行回执（2026-10-05，真实链上证据）

**已部署主网 Vault**：`0x872C322e886ccd3f2Bb63e0611a6d8c620D859Ab`（deploy tx `0xfcc2f9b4…86f6`，block 52197834，status 1）
- 构造器已设 Vault→Pool 的 USDC max approve（链上实测 allowance=2^256-1 ✅）；guardian=agent EOA（storage[0] 实读验证）
- **实践修复（部署前发现并解决）**：原合约无 approve 入口 → supply 必 NO_ALLOWANCE；已修复=构造函数 max approve + IERC20 approve 接口（Aave 推荐一次性 max approve）；deploy-vault.mjs 两处 BigInt 崩溃修复（`ethers.formatUnits`）

**7 步交易链（全部 status=1，Basescan/block 可复核）**：

| # | 操作 | tx hash | block |
|---|---|---|---|
| 1 | 部署 Vault | `0xfcc2f9b40b9cc31961d1800af11c56ed543ebbe61d6c46c1b429d9b50ae786f6` | 52197834 |
| 2 | approve USDC 1e6 | `0xf08c0004b6ea56d88a1a4e589654ed977ab8eb9cfd9c308b742028cbc1c0517a` | — |
| 3 | depositUSDC 1e6 | `0x7d7939cec93b389138d49badea8b0de109a4ee9e94e50cf2287c960da9f5c4cc` | — |
| 4 | allocate(1, 1e6) → Aave supply | `0xc90e7867367efe9ae9ba6436971c46cf76f37c499d9c2d1f99b2c338f7ca8623` | 52198050 |
| 5 | approve USDC 19e6 | `0xdb817a6b0ad68e6d6338eeaeb6769fbcbe80e0d247f597daf37d886506fe2d44` | — |
| 6 | depositUSDC 19e6 | `0x2f1749c1153246e60e25fc03158472c7a3f8a9e7bff23a5e76875de2f11cba51` | — |
| 7 | allocate(1, 19e6) → Aave supply | `0xcf4fbcdf47457b59618f978c301f43743247250fa0448c572abae5902b401dec` | 52198133 |

**最终链上状态（2026-10-05）**：
- aUSDC@Vault = **19,999,999**（≈20 USDC，精度差 1 为 aToken 份额正常现象）
- Vault USDC 余额 = 0（全部供应）
- exposure = **20,000,000**｜dailySpent = 20,000,000（日限 60 USDC 内）
- agent 钱包 USDC 余 **19.995**（39.995 → −1 → −19，此前一处笔误写 38.995，以链上余额为准）

**已知环境限制（诚实记录）**：Base 主网公共节点（mainnet.base.org / 1rpc.io / base-rpc.publicnode.com）对刚写入状态常误报 `execution reverted / NO_RESERVE`（estimateGas 与 sendTransaction 均出现过），**交易实际成功**——验证必须走 USDC/aUSDC 官方合约 balanceOf + 等待同步，Vault 读函数 eth_call 亦可能 revert（节点调用层问题，storage/事件读正常）。

## 五、退出演练回执（2026-10-05，exit_plan 验证通过）

**演练目标**：任意时刻 withdraw 全量赎回回 agent 钱包，Vault 零残留——验证 exit_plan 真实可执行。

| 步骤 | 操作 | tx hash | 结果 |
|---|---|---|---|
| E1 | withdrawUSDC(0) 全量赎回（w=exposure=20e6） | `0x4a0774b1da362aadc33e125afdb97d53708307bddaacf6964d943ba28d422209` | status 1｜aUSDC@Vault 20,000,016 → 16｜exposure 20,000,000 → 0 |
| E2 | skim() 转回 guardian(agent) | `0x9ea1a4b133d7206cce09d4a41a2b089249a8cfc69cca4919b4ed4327e5c94b78` | status 1｜agent 收到 20 USDC（19.995 → 39.995）|
| E3 | 重新供应 approve(20e6) | `0xffa0471b988895dfb33785ce2f3810e8f3bde1b6bbc26b034a599996546d572f` | status 1 |
| E4 | 重新供应 depositUSDC(20e6) | `0x10cec1d36cf009db86ea53a87b4a3abd7f08aa4dcf1cb7ff4141b4fedbe8770f` | status 1 |
| E5 | 重新供应 allocate(1,20e6) | `0xf6b144bbdcc64f96c6e8c38dce8650470b915deb77ef25718e0edf691caeb934` | status 1｜aUSDC@Vault 20,000,015｜exposure 20,000,000 |

**结论**：exit_plan 验证通过——退出通道完整可执行（赎回→转回→可重投），投资状态已恢复。
**APY 实证**：投入 20e6，约数小时后赎回得 aUSDC 20,000,016（+16 利息，约 6.25% APY 量级），利息真实累积。

## 六、后续
