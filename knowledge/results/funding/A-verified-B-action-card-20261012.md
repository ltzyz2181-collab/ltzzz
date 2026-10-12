# DOUBAO-AAVE-OWNER-SETUP · A 验证回执 + B 执行卡（2026-10-12）

单号：DOUBAO-AAVE-OWNER-SETUP-20261012-AB
状态：A 试点 ✅ 已通（链上实核）；B 待 owner 充值 + 金库私钥确认

## 一、A 试点现状（owner 拍板"A 通后实行 B"的 A 部分）

链上实核（base.drpc.org，2026-10-12）：

| 地址 | USDC | aUSDC | ETH | 说明 |
|---|---|---|---|---|
| agent 钱包 0x21F5…7fdc | **18.995** | 0 | 0.0103 | A 轨运营池（私钥在本地 ltzzz-secrets.md，可用）|
| Vault 0x872C…9Ab | 0 | **20.015092** | 0 | EXP-006 已投 Aave V3 主网；**含收益 +0.015（≈6.25% APY 量级）** |
| Grok EOA 0xc792…9114 | **1.0** | 0 | 0 | EXP-008 AI 雇 AI 薪酬 |
| 金库 0x5df57a…32d | 0 | 0 | 0 | 待 B 充值 |
| 合计 | ≈40.01 | | | 与账本/DeepSeek 实测一致 |

**A 已通判定**：
1. 20 USDC 已真实 supply Aave V3 Base 主网（Vault aUSDC=20.015092，含利息）——7/7 tx status=1（txn_0012）；
2. exit_plan 已验证（txn_0013：withdraw 全量赎回 → skim 回 agent → 重投恢复，利息实证 +16 wei 级）；
3. 收益持续增长（20.000015 → 20.015092）。

## 二、B 执行卡（200U 分批进，需 owner 两件事）

### B-1 · owner 充值（外部资金，必须 owner 操作）
- **网络**：Base 主网（chainId 8453）
- **币种**：USDC（Circle 原生，0x833589…2913）
- **收款地址**：`0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d`（LTZZZ 运营金库，owner 指定复用）
- **分批**：首批 **20 USDC**（与试点同档，验证充值-投资-归还闭环）→ 确认到账且可投后，再分 4 批各 45 USDC（合计 200U）
- **来源建议**：OKX 提币（Base 网络）或 Aave App 提现到自托管地址后转金库
- ⚠️ 切勿使用 Aave Account 托管账户直接"转出到金库"（托管模式不支持链上转出到任意地址，见前回执机制发现）

### B-2 · 确认金库控制权（关键，否则 200U 会锁死）
金库 0x5df57a…32d 链上代码/余额均空，**本机未找到其私钥**。请 owner 确认：
- 金库私钥是否在 MetaMask（狐狸头）？还是 Key.doc？
- 若从未持有：需 owner 提供一个**自有私钥的钱包地址**作为金库（替换 FUNDING_TREASURY），或把 0x5df57a 私钥导入 MetaMask 后告知豆包可用
- 豆包不会索要私钥明文；只需确认"签名工具在谁手里"

### B-3 · 投资执行（owner 完成 B-1+B-2 后，豆包自动执行）
1. 金库到账 20U 首批 → 链上确认（USDC balanceOf 0x5df57a）；
2. 投资路径（复用已验证的 Vault：guardian=agent 0x21F5，私钥本地可用）：
   - 金库 approve USDC → depositUSDC 入 Vault → allocate supply Aave（每步 tx 记录）；
3. 收益+本金归还：到期/分批后 Vault withdraw → 转回 **owner Aave 充值地址 0x370dd04092b2EcE24372ff93C29b55f5D2c12FD5**（即入 owner Aave 账户）；
4. 每批回执：tx_hash + 余额变化 + aUSDC 差值。

## 三、安全提醒（必须处理，不扩大）
`ltzzz-secrets.md`（仓库根）含 **agent 钱包私钥明文**（0x9d6a… 段）+ Telegram/YouTube/X 等多平台完整凭据，且已在 git 历史中。建议：
1. 立即将 agent 钱包余额转移/轮换私钥（或至少把文件移出仓库、git 历史清理）；
2. 豆包本次只在本地使用该私钥执行链上动作，**不复述、不写入任何新文件/回执**。

## 四、红线遵守
- 无真实交易回执不标 confirmed（A 已有链上 receipt，B 待充值后才有）；
- 私钥值不进对话/仓库/回执；
- owner 个人 Aave 1000U 仓位零接触；
- 单笔 ≤20 USDC、按 owner 分批口径执行。
