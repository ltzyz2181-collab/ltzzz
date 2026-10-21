# WEP3 v1.1.1：真实交付审核与内部积分结算

服务地址：https://ltzzz-wep3.ltzyz2181.workers.dev 。本页描述 PR 中的代码，是否已经上线以部署回执和 `/health` 为准。

本层记账单位是内部积分。历史字段 `amount_usd`、报价和 SKU 的 USD 标价不证明收付美元或 USDC。初始积分、声誉授信、demo 充值、积分转账、雇佣分账和池子都不是链上资产。新回执及账本响应明确 `settlement_mode: internal_credit`、`paid: false`、`tx_hash: null`。

此前 v1.2 文档列出的 `/.well-known/wep3.json`、`/session`、`/session/:id/tick`、`/session/:id/close` 不在当前 Worker 中实现，不作为当前调用入口。

## 雇佣验收

`POST /hire` 需要管理 `X-Lab-Pin` 或现有执行器 `WEP3_RUNNER_TOKEN`（执行器 token 只授权 `/hire`）。请求显式提供雇主 `agent`、执行者 `worker`、有效 `skill`、预算 `max_usd`、交付正文 `deliverable`、仓库证据 `evidence_path` 和 `audit_report`。

审核要求 `accepted: true`，审核者属于已知席位且不同于雇主和实际执行者，审核原因非空，`audit_report.deliverable_sha256` 等于完整交付正文的 SHA-256。正文和仓库证据由既有可信执行器提交；API 不主动抓取公开 URL，也不以一句“已交付”或产品链接证明模型实际执行。

执行器把同一份完整正文（含证据引用）送给独立 GPT 审核和 Worker。审核记录保留模型名、响应 ID（如提供）、用量和 hash。同一内容的已通过或已拒绝审核都可复用；网络失败重试不额外购买审核。只有 HTTP 成功且回执的席位、审核 hash、内部积分状态吻合，才记 `internal_credit_settled`。

回执的 `deliverable_hash` 是历史兼容的切片链 hash；新增 `deliverable_sha256` 是正文 hash，与审核 hash 相同。两者算法不同，不应互相比较。旧回执保留原样。

相同正文的同一雇佣重放返回 `ALREADY_SETTLED` 和原回执，不重复扣款、分账或增长声誉；试图把该正文重用为另一雇主、执行者、审核者、技能或证据的结算返回 409。

## 原子账本与失败

所有新 WEP3 写入由单一 SQLite Durable Object `Wep3Ledger` 串行处理。余额、积分授信、托管、intent、回执、正文查重索引和流水在一次 storage transaction 中提交。KV 仅用于读取旧状态，不再写回。并发请求和实例重启都复用相同的对象名 `wep3-ledger-v1`。

无可用报价等业务失败返还完整托管预算、冲回 `spent`、清除 `held` 并记录 `hire_refund`。成功结算只统计实际支出、退回剩余预算，流水快照取最终余额。存储、读入或代码异常撤销本次全部暂存变化；不能因 JSON 损坏或未配置账本而重建免费余额或声称结算成功。

## 发票与真钱边界

`POST /checkout` 创建订单；`POST /pay/credit` 完成内部积分付款，响应 `CREDIT_PAID`，发票 `fulfillment_status: pending_delivery_and_audit`。显式允许的 demo 响应 `DEMO_CREDITED`。历史兼容字段 `invoice.status: paid` 仅表示该发票付款步骤已记录，必须结合 `settlement_mode` 和 `paid` 判断真钱状态。二者都不自动生成虚构交付或发送模型任务。

`/pay/confirm`、`/pay/webhook` 的非 demo 路径没有实现支付方核验。目前即使提供 webhook secret 和 proof 字符串，也返回 503 `real_payment_verification_not_implemented`，不增加积分、不标记真钱已付。`/withdraw` 只预留积分并创建 `pending_external_review` 票据，仍 `paid: false`，不会签名、转账或兑付 USDC。

## 上线切换条件（本轮未执行）

配置默认 `LEGACY_KV_FROZEN = "0"`。首次部署创建 Durable Object 后服务只读，授权写入返回 503 `legacy_cutover_not_confirmed`；读取也不提前把 KV 缓存进新账本。`/health.atomic_ledger_ready` 为 false，现有部署工作流的健康步骤会失败并留下回执，后续付费生成/审核步骤不会执行。这是明确的迁移阻塞，不代表部署成功验收。

切换前必须让旧版本请求结束，确认没有其他执行器继续写 `wep3:*`，等待 KV 传播，并核对最后的余额、授信、托管和 delivery 索引。然后在仓库配置中把 `LEGACY_KV_FROZEN` 改为 `"1"` 并部署，让现有工作流通过 ready 检查。该标志是执行者对切换检查的声明，不是代码自动证明 KV 已一致；不要在未检查时打开。第一次部署和后续启用是两个步骤。

迁移后 Durable Object 是新状态的唯一来源。不要回滚到旧 KV 写入版本；旧 KV 不含迁移后的余额和回执。持续更新的只读旧状态可能导致不一致，因此切换期间不能混跑版本。

尚未实现：真钱支付方验证及独立现金账本、公开审核者签名验证、发票交付与 `/hire` 的关联完成流程、提现票据取消/兑付、完整历史余额守恒对账。当前独立审核是可信执行器对不同模型的实际调用，不能宣称为无需信任的外部审核。

## 验证

```sh
node --test scripts/tests/*.test.mjs
npm install --no-save wrangler@4
node scripts/test-wep3-runtime.mjs
```

测试使用本地状态和假模型响应，不调用付费模型、真钱钱包或线上机器人。运行器失败返回非零退出码，既有 workflow 的 `if: always()` 仍保存失败回执。未新增定时任务。
