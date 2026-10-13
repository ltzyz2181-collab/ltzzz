# LTZZZ 资金统一归集 · 迁移执行协议（2026-10-13）

目标：把旧 Base 资金迁移到唯一新执行金库 `0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d`（Base 8453），并跑通受限执行接口的 1 USDC 供应/赎回。
本协议是给 MainAgent 的推送与验收指引；所有金额动作的回执在运行后以 JSON 落盘于 knowledge/results/ 下，由 workflow 自动提交。

## 0. 链上基准（2026-10-13 09:27 UTC，三 RPC 一致，block ≈ 52,547,149）

| 项 | 值 |
|---|---|
| 旧 Vault 0x872C…9Ab | guardian=0x21F5…fdc ✅、paused=false ✅、humanVetoed=false ✅、identity OK ✅、exposure=20.0 USDC |
| Vault aUSDC | **20.018075**（含利息；10-12 为 20.016092）|
| Vault USDC | 0.0 |
| 旧 guardian 0x21F5…fdc | USDC=**18.995**、ETH=**0.010280265300552586** |
| 新金库 0x5df5…32d | USDC=0、aUSDC=0、ETH=0 |

安全门全部通过；旧 guardian 私钥已公开泄露（仓库 ltzzz-secrets.md），迁移优先级最高——任何人可用该密钥直接转走 guardian 钱包资金，且可调用 Vault 赎回函数，必须尽快完成。

## 1. 提交清单（git，由 MainAgent 本机执行）

新文件：
- `scripts/treasury-migration.mjs` —— 迁移脚本（安全门→withdrawUSDC→skim→USDC 全转→0.002 ETH）
- `.github/workflows/treasury-migration-and-pilot.yml` —— 迁移 + 1 USDC 供应/赎回 + 回执提交
- `knowledge/results/migrations/base-snapshot-20261013.json`（本协议基准快照）
- `knowledge/results/migrations/safe-snapshot-20261013.json`、`safe-verification-20261013.json`、`safe-to-owner-builder-20261013.json`、`safe-owner-confirm-20261013.md`（Safe 核验与提案，见 §3）
- `knowledge/results/migrations/interface-verification-20261013.md`（受限接口核验报告，子代理产出）
- `knowledge/results/funding/aave-withdrawal-receipt-20261013.md`（Aave 个人提现回执，见 §4）

推送前确认：`git diff` 不含任何密钥/token；`.github/workflows/treasury-migration-and-pilot.yml` 仅 workflow_dispatch 触发，不会因 push 自动执行。

## 2. 触发与验收（第①项：旧 Vault 迁移 + 1 USDC 试点）

1. 推送 main 后，到 GitHub → Actions → “Treasury migration and 1 USDC pilot” → Run workflow（workflow_dispatch）。
2. workflow 依次执行：
   - `node scripts/treasury-migration.mjs`：安全门 → `withdrawUSDC(max)`（estimateGas 失败则退回 `withdrawUSDC(0)`，EXP-006 E1 已验证路径）→ `skim()` → guardian 全部 USDC transfer 新金库（实读余额）→ 0.002 ETH transfer 新金库。每步 status=1 + 3 确认。回执 `knowledge/results/migrations/treasury-migration-<RUN_ID>.json`。
   - `AAVE_ACTION=supply AAVE_AMOUNT=1 AAVE_INTENT_ID=DOUBAO-AAVE-FIRST-<RUN_ID>`：经 Worker 受限接口（TREASURY_EXECUTOR_KEY 签名）供应 1 USDC；未确认则步骤失败（exit 1）。
   - `AAVE_ACTION=withdraw AAVE_AMOUNT=1 AAVE_INTENT_ID=DOUBAO-AAVE-EXIT-<RUN_ID>`：赎回 1 USDC 回新金库；未确认则步骤失败。
   - 最终 status 快照；回执自动 commit+push。
3. 验收判据（全部满足才算完成）：
   - treasury-migration-<RUN_ID>.json 的 `status == "verified_migrated"`；
   - 4 个 tx_hash 均在 Basescan 可查、receipt.status=1；before/after 齐全；
   - aave-first-supply-<RUN_ID>.json 与 aave-exit-<RUN_ID>.json 的 `on_chain_executed == true`、`tx_hash` 非空；
   - 终态：新金库 USDC ≈ 38.99+（18.995+20.018，扣微尘）、ETH=0.002、aUSDC≈0（或利息尘）；旧 Vault aUSDC/USDC/exposure ≈ 0；guardian USDC=0、ETH 余量≈0.008（扣手续费）。
4. 重跑安全：脚本幂等——若旧 Vault 已无仓位且新金库已有 USDC，输出 `already_migrated` 不产生新交易；supply/withdraw 按 intent_id 幂等续跑，不重复签款。禁止把资金重新投入旧 Vault。

## 3. Safe 五签提款（第②项，等待 owner 配合）

- 链上实读（block≈26,182,667，RPC×2 + TxService 三方一致）：owners 5 个、threshold=**3/5**、nonce=**6**、USDT=**49.02**、ETH=**0.005**、USDC=0。
- 收款方：**必须由 owner 确认其控制权的 Ethereum 钱包**。候选 = 0xb99C6751f443842F4987bb2017580405572Df905（Safe signer#1 / MetaMask Account 1，UNCONFIRMED）。见 `safe-owner-confirm-20261013.md`。
- 提案（`safe-to-owner-builder-20261013.json`，Safe Transaction Builder 1.18.0）：
  - A（USDT，nonce 6）：to=0xdAC1…1ec7，value=0，data=transfer(recipient, 49020000)（0x02ebfc60），operation=0。
  - B（ETH，nonce 7）：to=recipient，value=0.002 ETH，data=0x，operation=0；预留 0.003 ETH 作 execTransaction gas。
- owner 操作：Safe app（https://app.safe.global/home?safe=eth:0x76379a52a9e82c259E5Db417104C65C26f9C58a3）→ New Transaction → Transaction Builder → 粘贴 JSON → MetaMask 逐签满 3/5 → 执行（执行人付 gas）。先 A 后 B，执行前现场重读 nonce/余额/门槛。
- 浏览器核验说明（2026-10-13 实测）：该页面加载正常且显示正确 Safe 地址 0x7637…58a3，但当前版本 Safe app 的余额/nonce/门槛数值显示被钱包连接门控（"Please connect your wallet"），未连接 owner MetaMask 时无只读数据；故数值以链上双 RPC + TxService 三方一致为准，owner 连接钱包后可自行对照。
- USDT 到 owner 钱包后：owner 经其可用兑换/交易所通道换 USDC，选 **Base** 提到新金库；先小额到账再转余款。Ethereum USDT 不能直接作为 Base USDC 投资；换币与跨链需另留回执（本轮不执行）。

## 4. Aave 个人提现（第③项，仅回执，不动手）

回执已写入 `knowledge/results/funding/aave-withdrawal-receipt-20261013.md`。要点：Aave Account（Family 托管）非自托管；Base 8453 入金口；USDC 托管余额≈$1,001.77；提现入口 = Aave App 自带提现到 owner 自有钱包；币安 1.58 AAVE 非 USDC 仓位（需 owner 兑换 USDC 后选 Base 提新金库，仅记录）。

## 5. 阻塞与待 owner 事项

1. **Safe 收款钱包确认**（阻塞 Safe 提案最终化）：候选 0xb99C…f905 是否可确认？或提供新 Ethereum 钱包地址。
2. Safe 3/5 签名与执行、Aave App 提现、USDT→USDC 兑换与跨链：需 owner 在钱包/平台配合。
3. 受限接口带认证行为（preview/execute/auto/pause 的 200 路径）将在真实 workflow 运行中首次验证。
