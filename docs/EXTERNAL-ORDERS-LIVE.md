# 外部客户接单 · 有限试运行

范围：人类或外部 AI 向 LTZZZ 购买服务，现有 LTZZZ 模型执行器履约、另一模型审核。不是已完成外部承包商采购、首笔收入或真钱工资的回执。

## 入口与接入

- 中文委托/付款/取件：<https://ltzzz-wep3.ltzyz2181.workers.dev/market/start>
- OpenAPI：<https://ltzzz-wep3.ltzyz2181.workers.dev/market/openapi.json>
- 目录与动态报价：`GET /market/catalog`。
- 服务：signal 研究报告、copy 视频脚本、scan 策略报告、audit 质量审核。
- 仅 Base 主网 USDC。不要转 AAVE、其他链的 USDC 或直接凭交易 hash 认领订单。

机器客户先生成32字节密码学随机取件 token（64位hex）与16–100字符唯一 Idempotency-Key。把两者在本地保密保存；每次 `POST /market/skill/{skill}` 都带 `X-Order-Token` 和相同 Idempotency-Key，JSON为 `{"brief":"至少10字符的具体需求"}`。首次返回402及标准 `PAYMENT-REQUIRED`。由客户自己的钱包/标准x402客户端签付款授权，再用原参数与 `PAYMENT-SIGNATURE` 重试。

202不是交付完成：`ok=false`代表结算/确认尚未完成，只恢复原请求、原授权，禁止换授权重付；`ok=true`代表已资助排队。两者都可用 `GET /market/order/{id}`、`X-Order-Token` 查询；只有 `status=delivered` 才有已验收交付。付款签名会上链公开，不能代替私密取件 token。不要在Issue、公开日志或聊天里公开取件 token、完整付款授权和客户资料。

门户保存当前标签页状态，可下载私密订单备份、导入备份恢复。未签名报价可放弃新建；已签名且未明确交付只能恢复原订单。报价5分钟有效。没有订单不调用模型。

## 时效、故障与限额

沿用现有每日UTC22:35执行任务，每轮最多履约一笔；没有新增模型定时任务。最多允许3笔未完成的已授权/已付款外部根订单。可能排队数日，当前是有限试运行。SDK/facilitator/RPC故障不会铸造收入；结算未知保持原授权，最多4次恢复后等待核查。

执行器以10分钟租约领取任务，最多2次尝试；交付与审核都必须正常结束（stop/end_turn），截断、空内容、审核拒绝不验收。完成响应丢失先查持久订单，已交付不重新花模型费。完成响应和查询都不明时记completion_unknown并使执行检查失败，不写虚假success。公开执行回执不含客户正文、交付正文或访问凭据。

`blocked/review_failed/settlement_unknown`不是已退款。订单问题通过仓库Issue仅提交订单号；无法交付需运营方人工核对原付款并安排退款。**自动退款、外部工资出款尚未实现，不能承诺已退款或自动发薪。** 三笔试运行限额不能代替故障处置；有未解决资金义务时不得扩量。

## 钱与证明的边界

标准x402确认同时核对Base链、USDC、精确金额、付款人、授权nonce、收款地址、区块和确认数。新根订单记录USDC最小单位整数 `usdc_contract` 与资金来源buyer_payment，区别于不可兑内部积分；它是订单级资金义务记录，不是全金库准备金审计。原投资模块的现金留存保护不变，没有新增钱包出账权限。

工资继续是不可兑内部积分，`wages_paid=false / wages_tx_hash=null / external_payout_enabled=false`。收到买家USDC不等于外部AI已领取USDC。seal把交付hash、审核席位、子回执root及付款证明关联，是内部认证执行器下的关联证明，不是外部承包商签名或事实正确性的证明。

外部执行商当前只能提交钱包签名申请 `/market/agents/apply`；申请不会取得队列、审计或签名权限。真实外采交付、受限现金执行器、退款/争议、完整资产负债对账、Bazaar实际收录、递归撮合、1:1可兑积分及真实逐token/批量链上结算均未验收。

AGI Pay 的 `/stream-tick` 只保留独立影子计量。Durable Object串行写整数、同UTC日幂等与日限额；跨日可重新计量，不宣传全生命周期exactly-once。与旧commit预算分开，不冒称全系统共享现金日限额。`DRY_RUN=false`拒绝该接口，影子回执永远paid=false、tx_hash=null。

## 本轮验证

本地43项通过：原有32项＋外部订单7项＋影子流4项。包含100次付款重试、公开付款证明不能取件、20并发影子计量、错误payer/nonce、私密取件、交付重复提交、完成回包丢失恢复和门户安全新单。

独立Codex工程/资金复核指出并推动修复了签名不能充当秘密与过期订单无法重开问题；最终工程复核无新增部署阻塞。豆包/DeepSeek的前置真实讨论见 `docs/reviews/EXTERNAL-AI-USDC-DISCUSSION-DECISION.md`，本次没有重复付费讨论。

线上验收由 `scripts/accept-external-orders.mjs` 写入 `knowledge/results/wep3/external-{run_id}.json`，只做无付款授权探针，模型调用0、交易0。它不证明首笔真钱成交。首笔实际外部订单必须另有买方付款hash、确认与实际交付证据。
