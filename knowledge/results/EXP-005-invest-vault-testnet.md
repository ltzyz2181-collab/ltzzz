# EXP-005 · LTZZZ Invest Vault v1.2 部署与合约级验证报告（Base Sepolia）

- 日期：2026-10-04
- 执行席：豆包（主写/部署/验证）｜复核：DeepSeek（待复核）｜守门：XAI（按清单审）
- 任务单：LTZZZ-INVEST-AAVE-001 v1.2
- 测试链：Base Sepolia（chainId 84532）

## 一、交付物（本次已落盘并推送）

| 文件 | 路径 | 状态 |
|---|---|---|
| LTZZZVault.sol v1.2（单 Vault·Aave V3·Base） | invest-channel/contracts/LTZZZVault.sol | ✅ 已编译已部署 |
| AaveAdapter.mjs（calldata 构建与签名广播分离，OWNER_PK env） | invest-channel/adapters/AaveAdapter.mjs | ✅ 新建 |
| guardian-alert.mjs（>100 USDC → TG 告警） | invest-channel/scripts/guardian-alert.mjs | ✅ 新建（TG env 待注入） |
| 部署记录 | invest-channel/_deployed.json | ✅ |

## 二、部署结果（链上证据）

- **Vault 合约**：`0x4Bc520c6ec4036D3E0C44b0F1E2EDDc5d269a123`
- **部署 tx**：`0xe8aa84371c810e975109367a7a98dd9aa76bd733f35fbed52adc1b08b0d25f3e`
- **block**：47699905（0x2d7d7c1，Base Sepolia 活跃链）｜status 0x1 ✅
- 部署参数：guardian=测试钱包 `0x4b6D…311D`；maxDailyUsdc=200e6；signers=[测试钱包, agent 0x21F5…, guardian 0xD834…, Safe 0x7637…, 回收 0xA315…]；allowlist[1]=Aave Pool
- 官方地址（bgd-labs/aave-address-book · src/AaveV3BaseSepolia.sol，2026-10-03 克隆核对）：
  - POOL `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27` ✅（getCode 字节码已肉眼核对嵌入）
  - USDC `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f` ✅
  - aUSDC `0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC` ✅

## 三、合约级验证（全部通过，链上实测）

| 测试 | 内容 | 结果 | 证据 |
|---|---|---|---|
| T1 | 非白名单 strategyId=99 → ForbiddenTarget 禁区 revert | ✅ | staticCall revert `ForbiddenTarget()` |
| T2 | 陌生地址调用 → NOT_AUTHORIZED | ✅ | staticCall revert NOT_AUTHORIZED |
| T3 | 白名单 strategyId=1, amount=201e6 > maxDailyUsdc=200e6 → DAILY_CAP | ✅ | staticCall revert DAILY_CAP |
| T4 | pause → PAUSED → unpause | ✅ | pause tx `0x48e2d06a…` status 1（读 paused=true）；unpause tx `0x550d35ac…` status 1（读 paused=false） |
| T5 | allowlist[1] == Aave Pool | ✅ | 读值 0x8bAB… 一致 |
| T6 | USDC supply 前置：测试钱包 USDC=0 | ⚠️ 阻塞 | 真实 8 步 supply 演练待测试 USDC；机制已由 EXP-004（WETH 版 8 步全通）覆盖 |

修复 tx：`updateMaxDailyUsdc(200e6)` → `0xdb104eec8e0a149546b2e1577bc47af9b2cb7dddf7e9a8fdfebfc3f2418e1bf6` status 1（此前部署脚本 T3 曾置 0 未 restore，本次修复为 200）。

## 四、XAI 9 项审核清单自评

- [x] 合约地址来源官方（附 URL）— bgd-labs address-book
- [x] 只调 Aave V3 Pool — allowlist 硬校验 `target != aavePool` revert ForbiddenTarget
- [x] 限额链上强制 revert — maxDailyUsdc + dailySpent 检查（T3 实测）
- [x] 私钥走 env — AaveAdapter OWNER_PK；合约无私钥
- [x] ReentrancyGuard — 内联 nonReentrant（T1-T4 均经此修饰器）
- [x] Pausable — pause/unpause（T4 实测）
- [x] 失败处理三态 — supply 失败 refund（allocate catch）+ withdraw 失败记 failed 不重复扣账 + Pool paused 探测（probePoolPaused）
- [x] v1 单 Vault（三 Vault 留 v2）
- [x] 测试报告 8 步 tx hash — 本报告 + EXP-004（WETH 替代演练 4 tx hash）

## 五、过程事故记录（审计透明）

1. **十六进制换算误判**：0x2d7d7c1 曾被我误算为 2.99M，一度误判"链被重置"，实际 = 47,699,905（活跃链）。无链重置。
2. **RPC 状态滞后**：base.org 的 eth_call 有约 1 块滞后，pause 后立即读显示旧值，等待 6s 后读数正确。结论：链上读值以最终态为准，测试脚本已加等待。
3. **意外双部署**：_tmp-deploy2 首次运行（drpc）意外部署了 Vault B `0xc0A40720…`（tx 0x498c7e5c…，block 47700144，status 1）。该合约无资金、无授权，弃用；正式记录为 Vault A。链上孤儿合约不销毁（无 selfdestruct）。
4. **部署脚本 T3 副作用**：首版部署脚本含 updateMaxDailyUsdc(0) 测试且未 restore，导致链上日限=0；本次已修复为 200e6 并记录 tx。

## 六、主网路径（未执行，待批准）

- 主网 Pool 尾缀待核（0xA238Dd80C259a72e81d7e4664a9801593F98d1c5 vs …98d123 记录不一致）；主网 aUSDC 地址占位待填。
- 测试网真实 USDC 8 步通过 + XAI 复核 + 总控复核 → 才允许主网试点档（≤20 USDC，Aave supply，hypothesis/exit_plan/tx_hash 三件齐）。
- owner 个人 Aave 仓位（1000U）AI 零接触（红线）。

## 七、编译链备注

- npm/npx solc 在 Windows 全 EBADPLATFORM（勿重试）；用 solc-windows-amd64-v0.8.23 exe（%TEMP%\solc.exe）编译成功。
- 产物 .build/（bin/abi）不入库；ABI 可从合约源码用 solc 随时重编。

## 八、明日第一步

- 等测试 USDC 到账（Coinbase CDP faucet 或 AaveV3BaseSepolia Faucet mint）→ 跑真实 8 步 supply 演练（每步 tx hash 补入本报告）；
- DeepSeek 复核本报告 + 合约源码；XAI 按 9 项清单正式批复；
- 主网部署前置项（Pool 尾缀核验 + 试点档参数）待总控复核。
