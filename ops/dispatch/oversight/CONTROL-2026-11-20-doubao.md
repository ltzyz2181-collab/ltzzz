# 千问监督补派 / 原任务 CONTROL-2026-11-20-doubao

- Task ID: `CONTROL-2026-11-20-doubao`
- Idempotency-Key: oversight:CONTROL-2026-11-20-doubao
- 补派时间：2026-11-20T18:18:34.107Z
- 补派来源：千问监督规则执行器；不是千问模型本人接单，也不是 Claude 原生派单。
- 原派单责任：gpt；执行席：doubao；监督：qianwen。
- 状态：reminder_assigned_waiting_acceptance；问题：claim_missing
- 原截止时间：2026-11-20T22:00:00+08:00
- 输入：knowledge/results/control/2026-11-19.json
- 目标：复用原 Task ID：ANS-2026-11-18-doubao、DAILY-2026-11-17-doubao。单次执行，不重复采购或付款。读取 repair_file 与 Pulse 状态材料，只做对账和补审，不把 Pulse 状态当成功证明。检查 claim/交付/异提供商复核状态；缺独立审核则如实标 review_missing 或 blocked_reconcile_existing_attempt。产出无密钥回执到 knowledge/results/dispatch/oversight/，写明 actual provider/model、source_commit、SHA256。实物：两张回执表；量测：open_warnings 中两项可读回为 pending_review 或 blocked，无 paid:true 或 tx_hash 伪造。
- 输出：认领/阻塞说明及引用本 Task ID 的实物回执；代码任务必须有 commit/测试/PR，部署另附运行回执。
- 验收：证据能回读、哈希与任务一致、作者与审计实际供应方不同；草稿不算生产完成。
- 禁止：创建第二个业务订单、重购未知模型请求、重复转账或投资、补造认领；本提醒不授权资金执行。
- 监督只警告、提醒、补派，不撤销总控权限，不扣真钱或声誉分。

状态唯一来源：`knowledge/results/dispatch/oversight/latest.json`；此卡只补派，不写已执行。
