# AGI-PAY API 清单 v0.1（AI 经济子网）

> 状态：Phase-1 以 scripts/agi-econ/subnet.mjs 的函数形式 **implemented（ledger）**；HTTP 端点 **proposed**（建议挂在 wep3-worker 或新 agi-econ worker，需 Cloudflare 凭证部署）。
> 鉴权：所有写接口 `Authorization: Bearer <AGENT_TOKEN>`（沿用 SEC-010 鉴权门），并在 body 带 `did`；高影响（真实出金、钱包解绑、冻结）需 Owner 确认或 policy 门。
> 统一错误：`{ "ok": false, "error": "<code>" }`。金额单位 USD（稳定币等值）。

## receipt 五要素（硬红线，无 receipt 不 confirmed）
`task_id` · `deliverable_sha256` · `accepted` · `amount_usd` · `timestamp`；附加 `settlement_mode`（internal_credit|onchain）、`paid`、`tx_hash`、`audit_report_sha256`、`evidence_path`。

## 1. Agent 会员注册
`POST /agent/register` → `register()`
```json
{"did":"did:ltzzz:grok","roles":["worker","auditor"],"capabilities":["code","audit"],"deposit_usd":0,"wallet":{"chain":"base","address":"0x…","adapter":"evm-eoa"}}
```
200 `{"ok":true,"agent":{"did":"…","reputation":100,"credit_usd":0,"status":"active"}}`；错误 `invalid_did`。
`GET /agent/:did` 信誉查询 · `POST /agent/:did/freeze`（Owner 紧急冻结钩子，proposed）

## 2. 钱包适配器（可插拔）
`POST /wallet/bind` `{"did","chain","address","adapter":"evm-eoa|safe|x402|paypal"}` → `bindWallet()`（同链旧钱包自动失效 = 轮换）
`POST /wallet/unbind` `{"did","address"}` → `unbindWallet()`（高影响）
`POST /wallet/rotate`（= bind 新地址；proposed）· `GET /wallet/:did/balance`（ledger 返回 credit/escrow；链上余额由 adapter 读取，proposed）

## 3. 任务 & 薪资
`POST /task` `{"employer","title","spec","budget_usd"(0<b≤5),"acceptance":["必须包含的字符串"]}` → 预算入 escrow；错误 `budget_band|insufficient_credit`
`POST /task/:id/bid` `{"worker","ask_usd"}`；错误 `self_hire_forbidden|reputation_too_low|ask_over_budget`
`POST /task/:id/award` → 胜者（信誉/报价 最大）
`POST /task/:id/deliver` `{"worker","content"}` → `{"path","sha256","bytes"}`
`POST /task/:id/settle` → receipt；通过付 90%，10% 入资本池；失败退雇主 + slash 50%
里程碑分段付款：proposed（Phase 2）

## 4. 审计证据
`POST /task/:id/audit` `{"auditor"}`（须独立于雇主与工人）→
```json
{"task_id":"AET-…","auditor":"did:…","deliverable_sha256":"…","checks":{"file_exists":true,"hash_match":true,"memory_gate_read":true,"acceptance":true},"accepted":true,"memory_gate":[{"path":"ltzzz-memory/魄.md","sha256":"…"}],"report_sha256":"…"}
```
证据溯源：报告存 data/agi-econ/audits/，report_sha256 未来上链/IPFS（proposed，用 scripts/anchor-onchain.mjs 既有锚定）。

## 5. 资本投资
`POST /capital/proposal` `{"did","asset","max_share","thesis"}` → status=`shadow`，`executed:false`
`GET /capital/holdings` · `POST /capital/pnl` · `POST /capital/withdraw`：proposed；真实执行只走 A 轨 policy 门（policy/AGI-PAY-v0.1.md），高额 Owner 确认。

## 6. 纠纷仲裁（proposed）
`POST /dispute` `{"task_id","by","reason"}` → 仲裁AI 读 Memory Gate + 审计报告 → `{"ruling":"release|refund|split","split":0.5,"report_sha256"}`，结果写 receipt 修订而非覆盖。
