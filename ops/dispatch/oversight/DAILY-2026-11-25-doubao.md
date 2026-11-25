# 千问监督补派 / 原任务 DAILY-2026-11-25-doubao

- Task ID: `DAILY-2026-11-25-doubao`
- Idempotency-Key: oversight:DAILY-2026-11-25-doubao
- 补派时间：2026-11-25T14:01:21.116Z
- 补派来源：千问监督规则执行器；不是千问模型本人接单，也不是 Claude 原生派单。
- 原派单责任：gpt；执行席：doubao；监督：qianwen。
- 状态：reminder_assigned_waiting_acceptance；问题：revision_required
- 原截止时间：2026-11-25T22:00:00+08:00
- 输入：knowledge/results/daily-board/2026-11-25.json、knowledge/results/daily-board/artifacts/2026-11-25-doubao-c2a01c67073901eebcc141c83b50d346205501a654ad01d0465f7b46d10b5d7f.json
- 目标：复用 ANS-2026-11-23-deepseek 的独立审核权，异 provider 复核 DeepSeek 明日 reconcile 回执：校验 sha256、源 commit、测试命令可复现、线上任务板认领/提交哈希一致；输出 knowledge/results/ans-cycle/2026-11-25-doubao-review.json，明确 accepted/blocked/evidence_only，不得把 structurally_complete 或 pending_review 写成验收通过。
- 输出：认领/阻塞说明及引用本 Task ID 的实物回执；代码任务必须有 commit/测试/PR，部署另附运行回执。
- 验收：证据能回读、哈希与任务一致、作者与审计实际供应方不同；草稿不算生产完成。
- 禁止：创建第二个业务订单、重购未知模型请求、重复转账或投资、补造认领；本提醒不授权资金执行。
- 监督只警告、提醒、补派，不撤销总控权限，不扣真钱或声誉分。

状态唯一来源：`knowledge/results/dispatch/oversight/latest.json`；此卡只补派，不写已执行。
