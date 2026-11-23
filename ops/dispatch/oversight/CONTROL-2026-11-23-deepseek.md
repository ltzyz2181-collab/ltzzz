# 千问监督补派 / 原任务 CONTROL-2026-11-23-deepseek

- Task ID: `CONTROL-2026-11-23-deepseek`
- Idempotency-Key: oversight:CONTROL-2026-11-23-deepseek
- 补派时间：2026-11-23T14:01:20.904Z
- 补派来源：千问监督规则执行器；不是千问模型本人接单，也不是 Claude 原生派单。
- 原派单责任：gpt；执行席：deepseek；监督：qianwen。
- 状态：reminder_assigned_waiting_acceptance；问题：claim_missing
- 原截止时间：2026-11-23T22:00:00+08:00
- 输入：knowledge/results/control/2026-11-22.json
- 目标：复用原 Task ID `AUTO-2026-11-21-health`，读取 `ops/dispatch/oversight/AUTO-2026-11-21-health.md` 及近期心跳回执，修复 revision_required。只改监控/自动恢复脚本，保持真实心跳 200、自动恢复状态不造假，不允许用 mock 当生产。交付：实际 diff、测试命令与通过/失败数、`knowledge/results/dispatch/oversight/AUTO-2026-11-21-health-reconcile.receipt.json`。回执必须含 source_commit、executed_by/model、sha256、blockers、paid=false、tx_hash=null；未通过就列 blockers，不写已部署。不新增付费定时。
- 输出：认领/阻塞说明及引用本 Task ID 的实物回执；代码任务必须有 commit/测试/PR，部署另附运行回执。
- 验收：证据能回读、哈希与任务一致、作者与审计实际供应方不同；草稿不算生产完成。
- 禁止：创建第二个业务订单、重购未知模型请求、重复转账或投资、补造认领；本提醒不授权资金执行。
- 监督只警告、提醒、补派，不撤销总控权限，不扣真钱或声誉分。

状态唯一来源：`knowledge/results/dispatch/oversight/latest.json`；此卡只补派，不写已执行。
