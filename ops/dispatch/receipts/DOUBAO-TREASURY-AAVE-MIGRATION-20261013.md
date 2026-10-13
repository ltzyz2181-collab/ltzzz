# 接单回执：DOUBAO-TREASURY-AAVE-MIGRATION（2026-10-13）

派单来源：用户 2026-10-13 指令（统一归集至新执行金库 0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d）+ 总控 2026-10-12 迁移派单（ops/dispatch/DOUBAO-TREASURY-AAVE-MIGRATION-20261012.md）。
状态：已接单；第①项（旧 Vault 迁移 + 1 USDC 试点）产物就绪待推送执行；第②项（Safe）核验与提案就绪、等 owner 确认收款钱包与签名；第③项（Aave）回执已写、不动手。

## 一、已完成的核查（证据齐全，见 knowledge/results/migrations/）

1. **受限执行接口已部署（生产实测）**：源码 commit 0e38162（2026-10-12 02:51 UTC-7）→ deploy-wep3 run 38232625942 success → 生产端点 200；`/market/treasury` 身份签名经 ethers verifyMessage 恢复地址 == 金库地址；全部 admin 端点无 pin 一律 401；金库余额全 0、从未上链。报告：interface-verification-20261013.md。
2. **Base 链上基准（三 RPC 一致，block≈52,547,35x）**：旧 Vault aUSDC=20.0181（含利息）、USDC=0、exposure=20、paused=false、humanVetoed=false、identity OK；guardian USDC=18.995、ETH=0.01028；新金库全 0。安全门全过。
3. **Safe 链上核验（双 RPC + TxService 三方一致，block≈26,182,667）**：owners 5 个、threshold=3/5、nonce=6、USDT=49.02、ETH=0.005、USDC=0。
4. **浏览器打开 Safe 页面**：https://app.safe.global/home?safe=eth:0x7637…58a3 加载正常、地址正确；该版本页面数值显示被钱包连接门控（"Please connect your wallet"），未触碰 owner MetaMask；数值以链上/TxService 为准。
5. **迁移脚本本地干跑**：读路径+安全门验证通过（无密钥时停在 blocked_missing_wallet_secret，零交易）。

## 二、本轮产物（待 MainAgent 本机 git 提交推送）

- scripts/treasury-migration.mjs + .github/workflows/treasury-migration-and-pilot.yml（迁移 + 1 USDC 供应/赎回 + 回执提交）
- knowledge/results/migrations/treasury-migration-protocol-20261013.md（执行协议与验收判据）
- knowledge/results/migrations/base-snapshot-20261013.json、safe-snapshot-20261013.json
- knowledge/results/migrations/safe-verification-20261013.json、safe-to-owner-builder-20261013.json、safe-owner-confirm-20261013.md
- knowledge/results/migrations/interface-verification-20261013.md
- knowledge/results/funding/aave-withdrawal-receipt-20261013.md

## 三、阻塞与待 owner

1. Safe 收款钱包确认（候选 0xb99C6751f443842F4987bb2017580405572Df905，UNCONFIRMED）。
2. Safe 3/5 签名与执行；Aave App 提现；USDT→USDC 兑换 + Base 跨链（先小额）。
3. 迁移与 1 USDC 试点需 MainAgent 推送后触发 workflow_dispatch 执行，回执自动提交。

执行通道声明：旧 guardian 动作仅走 GitHub Actions secret LTZZZ_WALLET_PRIVATE_KEY；新金库动作仅走 Worker TREASURY_EXECUTOR_KEY（受限接口）；未读取/使用任何泄露私钥；回执不含任何密钥/token。
