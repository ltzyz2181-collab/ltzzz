# LTZZZ 投资通道 · Sepolia 演练进度报告

日期：2026-10-04 ｜ 执行席：豆包 ｜ 章程：policy/web3-investment-charter-v0.1.md（owner 一票生效）

## v1.2 终版结果（2026-10-04 更新，详见 knowledge/results/EXP-005-invest-vault-testnet.md）

- Vault `0x4Bc520c6ec4036D3E0C44b0F1E2EDDc5d269a123`（部署 tx 0xe8aa84…，block 47,699,905）
- 合约级验证 T1-T5 全部通过（ForbiddenTarget / NOT_AUTHORIZED / DAILY_CAP / PAUSED / 白名单==Pool），修复 tx 0xdb104eec…（日限恢复 200e6）
- T6 真实 USDC supply 演练待测试 USDC 到账（机制已由 EXP-004 WETH 演练覆盖）
- 事故记录：0x2d7d7c1 换算误判（实际 47,699,905 非 2.99M，链未重置）；RPC eth_call 滞后 ~1 块（等待后读数正确）；_tmp-deploy2 意外部署 Vault B 0xc0A407…（无资金弃用）

## 已完成

1. **章程落库**：policy/web3-investment-charter-v0.1.md（试点档 ≤20U / 敞口 ≤100U / 只投 Aave V3 / 无需审批 / 禁区 revert / 1000U 个人仓位零接触）。
2. **代码落库**（commit a5601dd，已 push 远端）：
   - invest-channel/contracts/LTZZZVault.sol（白名单+限额+禁区 revert，supply/withdraw/probeReject）
   - invest-channel/scripts/AaveAdapter.mjs（8 步演练 + 主网试点档 supply/withdraw + 余额查询；ethers 6.17）
3. **测试钱包**：0x4b6D3ebEf9577E2935D7ff32bB5E61E8514E311D（私钥仅存本机 %TEMP%，不入库/对话）。
4. **RPC 实测**：sepolia.base.org / publicnode / blastapi 超时 → 改用 base-sepolia.drpc.org（chainId 84532 通过）。drpc 免费计划禁 batch>3，Adapter 已改串行。

## 关键纠错（给总控）

- **此前核验的 Sepolia 地址混入 Ethereum Sepolia**：
  - Pool 应为 `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27`（不是 0x07eA79F…）
  - USDC 应为 `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f`（不是 0x036CbD…）
  - aUSDC `0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC` ✅ 一致
  - 来源：github.com/bgd-labs/aave-address-book → AaveV3BaseSepolia（2026-10-04 抓取）
- **测试 USDC 非公开 mint**（mint estimateGas → "Ownable: caller is not the owner"），需 faucet 或 owner 授权。

## 阻塞点（等 owner 一个动作）

- **测试钱包需要 Base Sepolia ETH（gas）**——所有免费 faucet 均需登录（Coinbase/Chainlink/Alchemy），AI 无法代登录。
- 动作卡：打开 https://developer.coinbase.com/faucet/base-sepolia（或 https://faucets.chain.link/base-sepolia）
  → 登录 → 网络 Base Sepolia → 地址 `0x4b6D3ebEf9577E2935D7ff32bB5E61E8514E311D` → 领 0.1 ETH → 告诉我。
- 领到 ETH 后：跑 8 步（approve → supply → aUSDC 到账 → 查余额 → withdraw → 回账 → 禁区/超限 revert 验证），每步记 tx hash。

## 下一步

1. owner 领 gas → 我跑 Sepolia 8 步 → 报告 tx hash 全链。
2. 演练通过 + 总控复核 → 主网试点档（agent 钱包 40 USDC 中 ≤20 supply，hypothesis/exit_plan/tx_hash 三件齐）。
3. 跑通后再评估 owner 个人 1000U 仓位接入（AI 零接触）。
