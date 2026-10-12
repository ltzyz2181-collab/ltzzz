# 接单回执 · DOUBAO-AAVE-OWNER-SETUP-20261011（豆包 · Windows 本机）

- 单号：DOUBAO-AAVE-OWNER-SETUP-20261011
- 接单方：豆包（Windows DoubaoWork 本机）
- 时间：2026-10-11（PDT）
- 状态：**已接单（acknowledged）· awaiting owner Aave 公开地址**
- 原始状态：awaiting_agent_ack → 本回执即 ack

## 环境核查结果（已实际验证，非声明）

| 项 | 结果 | 证据 |
|---|---|---|
| 本机 gh CLI | ✅ 已安装 v2.102.0（winget）| `C:\Program Files\GitHub CLI\gh.exe` |
| gh 认证 | ✅ 部署 PAT（ltzyz2181-collab，30 天有效期内）| gh api user / secret list 成功 |
| 仓库 git 同步 | ✅ main == origin/main，工作区干净 | git status -sb |
| provision 脚本 | ✅ 存在 | scripts/provision-funding-executor.mjs |
| 合约 | ✅ 存在 | invest-channel/contracts/OwnerAaveFunding.sol（+LTZZZVault.sol）|
| node | ✅ v22.23.2 | node --version |
| 半截状态 | ✅ 无 provision-public.json（未跑过半截）| knowledge/results/funding/ 不存在 |
| GitHub Secrets | ✅ 16 项在列，**无 FUNDING_* / LTZZZ_TREASURY_KEY** | gh secret list（10-11 实测）|

## 执行前置（脚本安全门）

`provision-funding-executor.mjs` 会：
1. 校验 `--owner` 地址在 **Base 主网（chainId 8453）持有 aUSDC（>0）**——无则拒绝生成密钥；
2. 校验 Aave 储备（aUSDC 0x4e65fE… / POOL 0xa238Dd… / USDC 0x8335…）；
3. 已存在 FUNDING_EXECUTOR_KEY / LTZZZ_TREASURY_KEY 时拒绝覆盖；
4. 密钥只进 gh stdin → GitHub Actions Secret，不输出、不进对话/仓库。

## 当前唯一阻塞（需 owner 提供，AI 不可代猜）

- **FUNDING_OWNER = owner 实际连 Aave 的钱包公开地址**（Base 主网 8453、持有 aUSDC）。
- 候选不可用：0x4b6D3e…（测试网）、0x2E7C93…（钱包4 零 USDC）、0x21F5…（旧泄露 agent 钱包）、0x1893…（U 卡收款）。
- 部署单明确"不索取 owner 私钥"——只需公开地址。

## 拿到地址后的执行序列（部署单第 2-8 步）

1. `npm install --no-save ethers@6.17.0` → `node scripts/provision-funding-executor.mjs --owner <公开地址>`
2. 校验 knowledge/results/funding/provision-public.json（public 地址 / Base aUSDC 实测 / secret_provisioned）
3. 给专用 executor 地址转少量 Base ETH 作 gas（非 Ethereum ETH）
4. 部署 OwnerAaveFunding → 必须 status=deployed_paused + router/tx_hash（blocked_configuration 不算成功）
5. 交两笔授权 calldata 给 owner 钱包签名：aUSDC.approve(router) + router.configure（chainId 8453 核对）
6. 首次真实测试 1USDC（保留 txHash / 前后余额 / principalOutstanding）→ 再开放定额补款
7. 回执：接单回执 + 公开四地址 + Secret 名称及注入状态（不含值）+ 两笔授权 txHash + 首笔测试 txHash

## 纪律

- 私钥/Secret 值不进对话不进仓库；FUNDING_OWNER 不索取私钥；
- 部署网络 = Base 主网 8453（不混用 Sepolia）；Ethereum ETH 不能当 Base gas；
- 无 owner 钱包初次签名，任何 AI 不能替代；无回执不标完成。
