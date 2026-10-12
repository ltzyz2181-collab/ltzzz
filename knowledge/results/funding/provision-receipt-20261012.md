# DOUBAO-AAVE-OWNER-SETUP · provision 执行回执（2026-10-12）

单号：DOUBAO-AAVE-OWNER-SETUP-20261012-PROVISION
执行：豆包（电脑端，gh CLI + 链上只读核实）
状态：配置注入 ✅ / 代码落库 ✅ / 链上部署 ⏳ 触发待验 / 真实资金未动

## 一、Aave owner 地址（本次关键成果）

- **FUNDING_OWNER = 0x370dd04092b2EcE24372ff93C29b55f5D2c12FD5**
  - 来源：owner 手机 Aave App →「存入 USDC」页面的 **Base 存入地址**（截图核验，App 明示最低 $2、仅 USDC 走 Base、地址可能变更）
  - 链上核验（base.drpc.org）：aUSDC=0 / USDC=0 / ETH=0
  - **结论：这是 Aave Account（Family 托管账户）的充值/入金口，不是自托管钱包。** 用户 $1,001.77 在 Aave 托管内，MetaMask 各账户无 aUSDC 的原因即在此（已落库 aave-owner-address-probe-20261011.md）
- 该地址即「本金+利息归还到我的 Aave」的还款目标。

## 二、配置注入（GitHub 仓库 ltzyz2181-collab/ltzzz）

| 项 | 值 | 方式 |
|---|---|---|
| FUNDING_OWNER | 0x370dd04092b2EcE24372ff93C29b55f5D2c12FD5 | variable ✓ |
| FUNDING_TREASURY | 0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d（复用已上线金库，**未新建、未覆盖任何 Secret**）| variable ✓ |
| FUNDING_EXECUTOR_KEY | 已注入（executor 公开地址 0xD00663F818cC4998565611aD36F335B4aFe5eA87）| secret ✓ |

- Secrets 现有 17 项 = 原 16 + FUNDING_EXECUTOR_KEY；测试密钥（PROV_TEST_KEY/PROV_TEST2/PROV_TEST_VAR）已清理。
- 复用的金库 0x5df57a…32d 不在脚本黑名单（0x1893…/0x21f5…）内 ✓。
- 授权包已按 owner 指令改为 **200e6**（原 1000e6 未提交；`aave-owner-funding.mjs` authorization 已改 approve+configure 200000000n，commit 7115830）。
- funding-plan 首笔 1e6（1 USDC）计入 200U 批次总额 ✓（existing logic，未改）。

## 三、代码落库

- commit **7115830**（main，远端 69a6e6f..7115830，rebase up to date 无冲突）
  - scripts/provision-funding-executor.mjs：复用金库模式（--treasury 默认 0x5df57a…32d、不再生成 LTZZZ_TREASURY_KEY）、--aave-account 托管豁免（owner 链上 aUSDC=0 属托管特性）、argv 解析 bug 修复、catch 输出真实错误
  - scripts/aave-owner-funding.mjs：授权 1000e6 → 200e6
  - knowledge/results/funding/provision-public.json：公开回执（无密钥）

## 四、链上部署状态（⏳）

- push 已触发 `aave-owner-funding.yml`（readiness 由 blocked_configuration → ready）。
- 预期：workflow 将编译 + 部署 OwnerAaveFunding 合约（executor 签名）。
- **已知阻塞（如实）**：executor 0xD006… 无 Base ETH（gas）→ 部署交易大概率无法完成；且见下节机制不兼容。

## 五、机制不兼容（本轮最重要发现，需总控/owner 裁定）

OwnerAaveFunding 合约的 `pull` 路径：`transferFrom(owner, router, amount)` 从 **owner 自持的 aUSDC** 划转后再 withdraw 到 treasury。
但 owner 的仓位在 **Aave Account 托管账户**（链上 0x370d… 的 aUSDC=0，无自托管 aUSDC 可 approve）→ **pull 链路对 owner 托管账户不可行**。

此外 LTZZZ 金库 0x5df57a…32d 链上 **USDC=0 / aUSDC=0 / ETH=0**（空），「本批 200U」资金尚未到位。

→ 待裁定（二选一或组合）：
1. **机制改轨**：本批 200U 由 LTZZZ 自有资金（金库/agent 钱包充值到位后）走 **AaveAdapter / LTZZZVault 金库自投 Aave**，收益与本金按批次归还到 owner 充值地址 0x370d…（与 owner 六点第 3/5 条语义一致）；
2. **owner 补自托管来源**：若 owner 愿意把 Aave 仓位迁出自托管（如新 MetaMask 账户直接 supply aUSDC），则原 pull 机制可跑通，授权 200e6 生效。

**红线遵守**：无真实交易回执前不标 confirmed；本次无任何资金移动（0 USDC 出/入）；私钥未入对话/仓库。

## 六、下一步

1. 总控/owner 裁定机制（改轨 vs 补自托管来源）+ 200U 到位路径（充值金库/agent 钱包）；
2. 若改轨：确认金库资金来源后由豆包部署 AaveAdapter 链路，1U 验证计入 200U 批次；
3. executor 0xD006… 如需保留 pull 选项，从任一持 ETH 账户转入 ≈0.002 Base ETH 打 gas；
4. 五签 3/5（MetaMask）与 1U 分录 confirmed 维持既有状态。
