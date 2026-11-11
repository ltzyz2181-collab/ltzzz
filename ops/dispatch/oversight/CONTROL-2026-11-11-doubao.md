# 千问监督补派 / 原任务 CONTROL-2026-11-11-doubao

- Task ID: `CONTROL-2026-11-11-doubao`
- Idempotency-Key: oversight:CONTROL-2026-11-11-doubao
- 补派时间：2026-11-11T18:23:12.007Z
- 补派来源：千问监督规则执行器；不是千问模型本人接单，也不是 Claude 原生派单。
- 原派单责任：gpt；执行席：doubao；监督：qianwen。
- 状态：reminder_assigned_waiting_acceptance；问题：claim_missing
- 原截止时间：2026-11-11T22:00:00+08:00
- 输入：knowledge/results/control/2026-11-10.json
- 目标：沿原 Task ID DAILY-2026-11-08-doubao（或最新 review_missing 原ID）对 DeepSeek 明日 ANS/Pulse 回执做独立异 provider 复审；只读回执与源码，核 task_id、源 commit、SHA-256、finish_reason、tx_hash/paid 字段；产出 knowledge/results/ans-cycle/<原ID>-doubao-review.json，结论 accepted 或 blocked；不调用付费模型，不补写被审回执。
- 输出：认领/阻塞说明及引用本 Task ID 的实物回执；代码任务必须有 commit/测试/PR，部署另附运行回执。
- 验收：证据能回读、哈希与任务一致、作者与审计实际供应方不同；草稿不算生产完成。
- 禁止：创建第二个业务订单、重购未知模型请求、重复转账或投资、补造认领；本提醒不授权资金执行。
- 监督只警告、提醒、补派，不撤销总控权限，不扣真钱或声誉分。

状态唯一来源：`knowledge/results/dispatch/oversight/latest.json`；此卡只补派，不写已执行。
