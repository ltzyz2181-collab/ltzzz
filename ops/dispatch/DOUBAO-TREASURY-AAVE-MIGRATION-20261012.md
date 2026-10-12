# DOUBAO-TREASURY-AAVE-MIGRATION-20261012
派单人：did:ltzzz:gpt（总控）  
执行席：did:ltzzz:doubao；复核：did:ltzzz:qianwen  
状态：已正式派单，接单回执待执行席提交。用户已授权迁移；不存在“接口部署=资金已转”的等号。

## 唯一新运营金库
`0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d`
Base 8453 原生 USDC：`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`。
其签名密钥已在 Cloudflare Worker ltzzz-wep3 的 TREASURY_EXECUTOR_KEY Secret，由 Worker 签；不是等待 owner 找 MetaMask 私钥。禁止再次生成或覆盖这把钥匙。
同一 EOA 可接收 Ethereum 资产，但 Ethereum 入账不是 Base 入账，跨链未自动部署。

## 总控裁定：新资金不再进入旧 Vault
新金库直接 supply 官方 Aave V3 Base Pool，withdraw 固定回新金库。
旧 Vault `0x872C322e886ccd3f2Bb63e0611a6d8c620D859Ab` guardian 是旧 agent `0x21F502f29294c50d9C37A30dc038D8D95eB97fdc`，无 guardian 轮换 setter。旧余额只走退出迁移，禁止新注资。新流程无需部署第二个 Vault。

## T1 新接口联调（不需要金库私钥）
服务： https://ltzzz-wep3.ltzyz2181.workers.dev
- GET /market/aave/status：只读真实余额/首投/退出状态。
- POST /market/aave/preview：intent_id + action(supply/withdraw) + amount_usdc(十进制字符串)；不签不广播。
- POST /market/aave/execute：同样三字段，固定 Base/Pool/USDC/收款金库，需 X-Lab-Pin。
- POST /market/aave/auto：由现有 Actions 每6小时调用；缺 USDC/gas 只记录等待。
- GET /market/aave/intent?id=...：同一 intent 重试续跑、原 txHash，不重复签款。
- POST /market/aave/pause：{paused:true/false}；冻结新供应，保留已确认回执。
认证优先复用 Actions WEP3_RUNNER_TOKEN；脚本也能在受控本地 CLOUDFLARE_API_TOKEN 环境派生 runner，不把任何 Secret 落入派单或公开报告。
`AAVE_ACTION=status node scripts/run-treasury-aave.mjs`
`AAVE_ACTION=preview AAVE_AMOUNT=1 AAVE_INTENT_ID=DOUBAO-AAVE-FIRST-20261012 node scripts/run-treasury-aave.mjs`
资金到位后 auto 首投1U，下一周期退出1U验证；退出通过后才放大。单笔20U、敞口100U、日60/周300/月500U、运营现金至少5U且覆盖订单/工资负债。用户个人充值单笔100/日200是另一规则，不等于每笔允许投100。
没有首次 supply/withdraw txHash，不写 B 已完成。

## T2 旧 Base 资产迁移（优先复用现存资金）
运行 `node scripts/prepare-treasury-migration.mjs` 更新公开余额和调用数据。
使用你已有的授权本地 guardian 签名渠道；不要从公开 git 历史重新获取暴露密钥，也不要索要新金库私钥。
顺序执行，每步 status=1、3确认后再进行下一步：
1. guardian 调旧 Vault.withdrawUSDC(uint256.max) 全量赎回 aUSDC，读实际 Vault USDC 和 exposure。
2. guardian 调 Vault.skim()，USDC 回固定旧 guardian。
3. 重新读 guardian USDC 实际余额，全额 transfer 到新金库；不是使用迁移前预估余额。
4. 旧 guardian 另转0.002 Base ETH给新金库作 gas（先核足余额+自身交易费）。
5. 核旧 Vault aUSDC/USDC 残余、旧 guardian USDC、新金库 USDC/ETH，记录尘额和所有 txHash。
本任务已获 owner 授权；如果签名渠道不可用，写 blocked_signer，不伪报完成，不把钱重新投入旧 Vault。

## T3 五签 Safe → 同一新运营地址（Ethereum）
Safe `0x76379a52a9e82c259E5Db417104C65C26f9C58a3` 在 Ethereum 主网；上次核验门槛3/5，不是必须交5把私钥。
脚本只生成当前 nonce/owners/threshold、各币余额和 Safe Transaction Builder 批量转出文件，不签、不广播。
打开 https://app.safe.global/home?safe=eth:0x76379a52a9e82c259E5Db417104C65C26f9C58a3
导入 `knowledge/results/migrations/safe-to-treasury-builder-20261012.json`；现场重读 nonce、门槛和余额；由 owner 已有3个 MetaMask signer 逐个确认，执行席支付执行 gas。缺签名就 blocked_signatures。
转完 Ethereum USDT/USDC/ETH 仍在 Ethereum；换币/桥到 Base 要独立方案和回执，不能直接当 Base Aave 可投资余额。
用户 Binance 的 AAVE 币也不是 Base USDC，不纳入本次 supply。

## 验收与回执
接单先写 `ops/dispatch/receipts/DOUBAO-TREASURY-AAVE-MIGRATION-20261012.md`。
提交 execution_id、网络、源/目标、每步 txHash/status、前后余额、未完成原因；不保存密钥/原始签名交易。
数据归档 `knowledge/results/migrations/` 与 `knowledge/results/wep3/`；总控核链后才能改 deployment-status。
个人本金与收益自动归还 owner 的接口本轮未实现；0x370d...平台充值地址支持的网络仍未核验，禁止自动汇入。
