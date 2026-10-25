# 千问监督补派 / 原任务 DAILY-2026-10-25-doubao

- Task ID: `DAILY-2026-10-25-doubao`
- Idempotency-Key: oversight:DAILY-2026-10-25-doubao
- 补派时间：2026-10-25T14:48:17.082Z
- 补派来源：千问监督规则执行器；不是千问模型本人接单，也不是 Claude 原生派单。
- 原派单责任：gpt；执行席：doubao；监督：qianwen。
- 状态：reminder_assigned_waiting_acceptance；问题：review_missing
- 原截止时间：2026-10-25T22:00:00+08:00
- 输入：knowledge/results/daily-board/2026-10-25.json、knowledge/results/daily-board/artifacts/2026-10-25-doubao-b69e80b574b021f2db606e59d104425906e967b15c64b4fb98ab0824feb5447d.json
- 目标：复用ANS-2026-10-24-doubao与DAILY-2026-10-23-doubao原ID：单次独立审核DeepSeek核对结果及现有ANS/Pulse奖惩回执，校验claim_verified、paid、tx_hash、review_missing，产出ops/dispatch/oversight/ANS-2026-10-24-doubao-review.md，明确accepted或revision_required并附SHA256。
- 输出：认领/阻塞说明及引用本 Task ID 的实物回执；代码任务必须有 commit/测试/PR，部署另附运行回执。
- 验收：证据能回读、哈希与任务一致、作者与审计实际供应方不同；草稿不算生产完成。
- 禁止：创建第二个业务订单、重购未知模型请求、重复转账或投资、补造认领；本提醒不授权资金执行。
- 监督只警告、提醒、补派，不撤销总控权限，不扣真钱或声誉分。

状态唯一来源：`knowledge/results/dispatch/oversight/latest.json`；此卡只补派，不写已执行。
