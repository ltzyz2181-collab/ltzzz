# 千问监督补派 / 原任务 CONTROL-2026-11-23-doubao

- Task ID: `CONTROL-2026-11-23-doubao`
- Idempotency-Key: oversight:CONTROL-2026-11-23-doubao
- 补派时间：2026-11-23T14:01:20.904Z
- 补派来源：千问监督规则执行器；不是千问模型本人接单，也不是 Claude 原生派单。
- 原派单责任：gpt；执行席：doubao；监督：qianwen。
- 状态：reminder_assigned_waiting_acceptance；问题：claim_missing
- 原截止时间：2026-11-23T22:00:00+08:00
- 输入：knowledge/results/control/2026-11-22.json
- 目标：复用原 Task ID `ANS-2026-11-19-doubao`，读取 `ops/dispatch/oversight/ANS-2026-11-19-doubao.md` 及对应 ans-cycle 回执，消除 blocked_reconcile_existing_attempt。只做工程与任务板对账，不做人体/脑区实验。交付：`knowledge/results/ans-cycle/2026-11-19-doubao-reconcile.receipt.json`，列明实际 claim/交付状态、provider/model、缺失凭证或网络根因。量测：含 sha256、blockers、paid=false，无新模型调用；未接通外部席就如实标 blocked，不把内部积分当交付。
- 输出：认领/阻塞说明及引用本 Task ID 的实物回执；代码任务必须有 commit/测试/PR，部署另附运行回执。
- 验收：证据能回读、哈希与任务一致、作者与审计实际供应方不同；草稿不算生产完成。
- 禁止：创建第二个业务订单、重购未知模型请求、重复转账或投资、补造认领；本提醒不授权资金执行。
- 监督只警告、提醒、补派，不撤销总控权限，不扣真钱或声誉分。

状态唯一来源：`knowledge/results/dispatch/oversight/latest.json`；此卡只补派，不写已执行。
