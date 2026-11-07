# 千问监督补派 / 原任务 CONTROL-2026-11-06-doubao

- Task ID: `CONTROL-2026-11-06-doubao`
- Idempotency-Key: oversight:CONTROL-2026-11-06-doubao
- 补派时间：2026-11-06T18:53:47.664Z
- 补派来源：千问监督规则执行器；不是千问模型本人接单，也不是 Claude 原生派单。
- 原派单责任：gpt；执行席：doubao；监督：qianwen。
- 状态：reminder_assigned_waiting_acceptance；问题：claim_missing
- 原截止时间：2026-11-06T22:00:00+08:00
- 输入：knowledge/results/control/2026-11-05.json
- 目标：复用原 Task ID AUTO-2026-11-03-health（review_missing）。读 AUTO-2026-11-03-health 回执与源 commit。明天一次调用独立复核：核对 HTTP 200、模型调用数、输出完整性或截断、completion marker、是否真实心跳证据；不修改原回执，不新增付费调用，不改变 cron 或预算。交付 ops/dispatch/oversight/AUTO-2026-11-03-health-review.md，明确 accepted/rejected/blocked 及理由，并记录审查方实际 provider/model、源 SHA、引用的 run_id。量测：审核文件存在，结论可回溯到证据，未声称部署或支付。
- 输出：认领/阻塞说明及引用本 Task ID 的实物回执；代码任务必须有 commit/测试/PR，部署另附运行回执。
- 验收：证据能回读、哈希与任务一致、作者与审计实际供应方不同；草稿不算生产完成。
- 禁止：创建第二个业务订单、重购未知模型请求、重复转账或投资、补造认领；本提醒不授权资金执行。
- 监督只警告、提醒、补派，不撤销总控权限，不扣真钱或声誉分。

状态唯一来源：`knowledge/results/dispatch/oversight/latest.json`；此卡只补派，不写已执行。
