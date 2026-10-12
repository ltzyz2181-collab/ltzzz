# 修订方案 · DOUBAO-AAVE-OWNER-SETUP-20261011 v2（按 owner 六点指令修订）

- 单号：DOUBAO-AAVE-OWNER-SETUP-20261011（v2 修订）
- 修订人：豆包（Windows 本机）· 2026-10-11（PDT）
- 依据：owner 六点指令（复用金库 / 200U 批 1U 先测 / 五签单列 / 本金利息分账 / Kimi Tier0 / 先交方案）
- 状态：**方案已交，待 owner 提供 Aave 公开地址后执行**

## 1. 金库复用（owner 指令①）

### 已核实事实（非声明）
- 目标金库：`0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d`
- 网络：Base eip155:8453
- 来源：自治经济 v2 验收（AUTONOMY-V2-ACCEPTANCE-20261012.md + knowledge/results/wep3/treasury-*.json）
- 状态：`existing_controlled_treasury_reused`；Worker 固定消息签名已验签；**私钥存 Worker Secret，未输出**
- 结论：**金库已上线、受控、可复用**。FUNDING_TREASURY 直接指向该地址，不新建 treasury 钱包

### provisioning 流程改造（脚本待改，不覆盖现有 Secret）
- 原 `scripts/provision-funding-executor.mjs` 逻辑：生成 executor + treasury 两个新钱包 → 冲突
- 改造为**复用模式**：
  - 新增参数 `--treasury 0x5df57a…`（复用已有金库）
  - 只生成 **executor 一个钱包**（FUNDING_EXECUTOR_KEY，funding 结果确认缺失，需单独准备）
  - `FUNDING_TREASURY` variable 设为 0x5df57a（复用地址，非新地址）
  - `FUNDING_OWNER` variable 设为 owner Aave 公开地址（等 owner 提供）
  - 安全门保留：aUSDC 持有校验（>0）、Aave 储备校验、已存在 FUNDING_* 拒绝覆盖、密钥只进 gh stdin
  - **不触碰**现有 Worker Secret（wep3/autonomy 等 16 项不动）
- 执行前置：owner Aave 地址 → 跑改造后脚本 → 验 provision-public.json → 给 executor 转 Base ETH gas

## 2. 批次方案（owner 指令③）：200U 目标，先 1U 验证

- 总授权：**200e6 raw（200 USDC）**，不做 1000e6 原样授权包
- 首笔：**1e6（1 USDC）真实测试**，计入 200U 总额
- 每笔 ≤ 100 USDC（合约 SINGLE_CAP=100e6 链上强制）；每日 ≤ 200 USDC（DAILY_CAP=200e6）
- 记录：每笔 pull 的 tx_hash / 前后余额 / principalOutstanding 增量；每日 cumulative 核对
- 禁止：重复提款（intent 幂等 usedIntent）、无 receipt 标完成
- 合约常量（已读源码确认）：SINGLE_CAP=100e6 / DAILY_CAP=200e6 / configure(remaining) 设 200e6
- 授权动作（owner 签名，网络 Base 8453）：
  1. `aUSDC.approve(router, 200e6)` —— aUSDC 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB
  2. `router.configure(false, <executor>, 200e6)` —— 部署后的 OwnerAaveFunding router
  - 两笔都需真实 router 地址与 chainId 8453 核对后才可签（部署回执先出）

## 3. 本金 + 利息分账（owner 指令⑤）

- 首期 200U 资金 = **应归还 owner 的本金**（principalOutstanding 记录）
- 利息 = 按 Aave 实际利率补偿（aUSDC 计息份额增长），分笔记录提款与归还时间
- 归还：`returnPrincipal()` 真实转回 owner Aave 地址（transferFrom 到 owner，chainId 8453）
- LTZZZ 投资收益 / 产品收入 → 运营与追加投资；具备偿付能力时推进本金+利息归还到 owner Aave
- **内部积分、模拟收入不算真钱收益**（验收只看链上 tx + 余额变化）

## 4. 五签准备（owner 指令④）——详见 SAFE-STATUS-20261011.md

- 链上核实（双 RPC）：Safe 0x76379a52a9e82c259E5Db417104C65C26f9C58a3，Ethereum 主网，Safe v1.4.1
  - owners 5 个 / **threshold=3/5** / nonce=6
- 待 owner 确认：5 signer 身份映射（豆包对应哪个签署地址、谁实际控制签名工具）
- 按真实阈值（3/5）收签名；不收集 5 个私钥；不宣称完成

## 5. Kimi Tier0（owner 指令⑥）——详见 KIMI-TIER0-PLAN 部分

- 现状：kimi-proxy-worker.js 无限流（429 透传）；daily-automation 有任务级退避（500×2^n）但**无账户级统一并发**
- 方案：proxy 层加 KV 账户级互斥锁（所有入口走 proxy → 并发强制 1）；429 遵守 Retry-After + 有上限退避；失败/超时/已有输出分类记录；预算按赠金余额；不新增付费 cron

## 6. 执行序列（Aave 地址到位后）

1. 改造 provision 脚本（复用模式）→ 跑 `--owner <地址> --treasury 0x5df57a…` → 注入 FUNDING_EXECUTOR_KEY / FUNDING_TREASURY / FUNDING_OWNER
2. 验 provision-public.json → 给 executor 转 Base ETH gas
3. 部署 OwnerAaveFunding（owner=owner 地址 / treasury=0x5df57a / pool+usdc+aUsdc=Aave 主网三件套 / executor）
4. 回执 status=deployed_paused + router + tx_hash（blocked_configuration 不算成功）
5. owner 签两笔（approve 200e6 + configure 200e6）→ 1U 真实测试 → 批次推进

## 红线（不变）

- 私钥/Secret 值不进对话不进仓库；不索取 owner 私钥；Base 8453 唯一网络；无 receipt 不标完成；
- 现有 Base 主服务与机器人保持运行，不重复部署；不新增付费模型定时任务。
