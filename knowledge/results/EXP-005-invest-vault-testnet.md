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

- 主网 Pool 尾缀已核：官方 AaveV3Base.POOL = `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`（章程 98d123 笔误已于 2026-10-05 修正，见第九节）；主网 aUSDC 地址占位待填（address-book AaveV3Base 部署前取，禁止 TBD 部署）。
- 测试网真实 USDC 8 步通过 + XAI 复核 + 总控复核 → 才允许主网试点档（≤20 USDC，Aave supply，hypothesis/exit_plan/tx_hash 三件齐）。
- owner 个人 Aave 仓位（1000U）AI 零接触（红线）。

## 七、编译链备注

- npm/npx solc 在 Windows 全 EBADPLATFORM（勿重试）；用 solc-windows-amd64-v0.8.23 exe（%TEMP%\solc.exe）编译成功。
- 产物 .build/（bin/abi）不入库；ABI 可从合约源码用 solc 随时重编。

## 九、GPT 观察席复议项处置（2026-10-05）

GPT 提交三项技术复议，逐项核实与处置如下（commit `45952a8`）：

1. **地址双真值源（章程旧地址 vs Adapter 新地址）— 属实，已清零**
   - 核实：章程 v0.1 写 Sepolia Pool `0x07eA79F6…`/USDC `0x036CbD53…`（混入 Ethereum Sepolia），Adapter/Vault 用 `0x8bAB6d1…`/`0xba50Cd…`。
   - 处置：章程已改为 address-book 值（含主网 Pool 尾缀 98d123→98d1c5 笔误修正），真值源唯一化；本报告第六节同步更新。
2. **白名单无"代码级官方地址校验"（部署期缺口）— 属实，已补脚本闭环**
   - 核实：构造函数仅 require 非零；但运行时防线真实存在——`usdc`/`aavePool` 为 immutable，`allocate()` 对 `allowlist[strategyId] != aavePool` 链上 revert ForbiddenTarget（T1/T5 实测）。缺口仅在**部署期**：传入错误但非零的 pool/usdc 时合约可被部署。
   - 处置：新建 `invest-channel/scripts/deploy-vault.mjs`——按 NETWORK 对 pool/usdc/aToken 做官方地址硬断言（不匹配拒绝部署）+ solc 编译 + 链上验证（guardian/allowlist[1]==pool/maxDaily/paused）+ 输出 _deployed.json。与 v1.2"主网地址不写死"约束不冲突：官方地址核对在部署脚本/测试层闭环，合约保持 immutable+白名单运行时防线。
   - 说明：GPT 建议的"合约硬编码官方地址"与 v1.2 明确约束（主网地址只留占位不写死）冲突，未采纳硬编码方案，采用部署脚本断言 + 链上验证替代，同等消除误部署风险。
3. **Sepolia 8 步未完成（ready ≠ tested ≠ passed）— 属实，维持门禁**
   - 现状如实：T1-T5 合约级验证 ✅、T6 真实 USDC supply 演练 ⚠️ 阻塞（测试钱包 USDC=0，mint 非公开、faucet 需登录）。报告/章程均未将"ready"标为"passed"。
   - 门禁维持：Sepolia 8 步全通（tx hash 齐全）前，主网试点档不执行（章程 §3 不变）。

结论：三项复议全部接受并已闭环/如实记录；主网验收前复核项清零清单 = ① T6 测试 USDC 演练 ② 主网 aUSDC 地址补全 ③ Deep 复核 + XAI 正式批复。

## 八、明日第一步

- 等测试 USDC 到账（Coinbase CDP faucet 或 AaveV3BaseSepolia Faucet mint）→ 跑真实 8 步 supply 演练（每步 tx hash 补入本报告）；
- DeepSeek 复核本报告 + 合约源码；XAI 按 9 项清单正式批复；
- 主网部署前置项（试点档参数 + 主网 aUSDC 补全）待总控复核。

## 十、T6 复核（2026-10-05）：CDP faucet 到账但**币种不符**（重要发现，链上证据）

- **到账**：CDP faucet 两笔 1 USDC 均已确认——tx `0xd43c262d05ef371a81e189b9855ab50b195f7b6352a9038548dfdc26a757dc31`（block 47703049，status 0x1）及用户侧一笔（同 faucet 合约 0x8fDDcc0c…，Transfer 目标均为测试钱包 `0x4b6D…311D`）。链上实测测试钱包 **0x036CbD… USDC 余额 = 2.0**。
- **关键事实**：CDP faucet 发放的是 **`0x036CbD53842c5426634e7929541eC2318f3dCF7e`（Circle 官方 Base Sepolia USDC，FiatTokenProxy）**；而 **Aave V3 Base Sepolia 的储备 USDC = `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f`**（aave-address-book `AaveV3BaseSepolia.sol` 原文再次抓取核实，aToken `0x10F1A9…`，与 Vault/Adapter/章程一致 ✅）。**两者是不同合约的 USDC，Aave 池不接受 0x036CbD… 供应**。
- **获取渠道结论**：Base Sepolia 的 address-book **无 FAUCET 常量**（Ethereum Sepolia 才有，`0xC959483D…`）；0xba50Cd… 的 owner 实测 `0xD9145b5F45Ad4519c7ACcD6E0A4A82e83bB8A6Dc`，公开 mint 不可用（此前 Ownable 实测）。→ **测试网没有官方途径把 0xba50Cd… 测试 USDC 充到测试钱包**，T6 的"真实 USDC supply"受测试网资产生态限制，**不是代码/操作问题**。
- **机制验证替代证据**：Aave supply/withdraw 全链路已由 **EXP-004 WETH 8 步演练**闭环（approve→supply→aUSDC→withdraw→回账，tx hash 齐全）。USDC 品种差异问题在主网不存在（主网 Aave V3 Base 储备即主流 USDC `0x833589fC…`）。
- **处置建议（待总控裁定，不擅自开门禁）**：① T6 门禁口径可调整为"合约级 T1-T5 ✅ + 机制演练 EXP-004 ✅ + 主网地址断言（deploy-vault.mjs）✅"→ 主网试点档；② 或坚持真实 USDC 演练，则需 owner 在 Base Sepolia 上找到 0xba50Cd… 的私有获取渠道（无公开 faucet）。

## 十一、owner 门禁裁定（2026-10-05）：方案 A 放行主网试点档

- **裁定人**：owner（一票）｜**时间**：2026-10-05｜**内容**：走方案 A——「合约级验证 T1-T5 ✅ + 机制演练 EXP-004（WETH 8 步）✅ + 部署断言（deploy-vault.mjs 官方地址硬校验）✅」放行主网试点档。
- **试点档参数**（章程 §2 不变）：Base 主网 Aave V3，单笔 ≤20 USDC、敞口 ≤100 USDC、只投 Aave V3、A 轨免审批（≤20U 档）、hypothesis/exit_plan/tx_hash 三件齐全才执行、禁区 revert。
- **执行前置项（未清零前不执行）**：
  1. 主网 aUSDC 地址从 address-book `AaveV3Base.sol` 补全（deploy-vault.mjs 对 TBD 拒部署）；
  2. 主网部署 Vault 用 deploy-vault.mjs（官方地址断言 + 链上验证），不重蹈 Sepolia 部署脚本副作用；
  3. 实际 supply 前用 agent 钱包（0x21F5…）Base 主网 USDC（≈40，其中 ≤20 试投）确认余额与 gas；
  4. 执行后回填 transactions.json（agent=ltzzz-invest · status=confirmed · 真 tx_hash）并入库 knowledge/results/。
- **资金边界**：owner 个人 Aave 1000U 零接触不变；B 轨 5 签不动；测试网一周循环（Deep）与主网试点档并行推进，互不阻塞。
- **验收**：主网试点档首笔 supply tx 成功后，以链上 hash + aUSDC 份额为证据记入 EXP-006。
