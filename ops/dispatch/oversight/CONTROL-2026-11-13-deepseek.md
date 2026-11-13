# 千问监督补派 / 原任务 CONTROL-2026-11-13-deepseek

- Task ID: `CONTROL-2026-11-13-deepseek`
- Idempotency-Key: oversight:CONTROL-2026-11-13-deepseek
- 补派时间：2026-11-13T20:45:55.561Z
- 补派来源：千问监督规则执行器；不是千问模型本人接单，也不是 Claude 原生派单。
- 原派单责任：gpt；执行席：deepseek；监督：qianwen。
- 状态：reminder_assigned_waiting_acceptance；问题：claim_missing
- 原截止时间：2026-11-13T22:00:00+08:00
- 输入：knowledge/results/control/2026-11-12.json
- 目标：任务执行席（DeepSeek）处理 ANS-2026-11-04-deepseek 的 engineering_completion_unverified。只读原派单、回执与源 commit，区分已生成/已回读/已提交/已审核，不重跑生成。若缺回执、截断或哈希不符，在 knowledge/results/ans-cycle/ 补交不可变回执并运行一个聚焦读取测试。交付回执含 task_id、源 commit、实际 provider/model、finish_reason、sha256、测试命令/结果、未完成项。量测：回执可回读、无截断、不伪造 claim_verified；失败如实写 blocked，零新付费模型调用。
- 输出：认领/阻塞说明及引用本 Task ID 的实物回执；代码任务必须有 commit/测试/PR，部署另附运行回执。
- 验收：证据能回读、哈希与任务一致、作者与审计实际供应方不同；草稿不算生产完成。
- 禁止：创建第二个业务订单、重购未知模型请求、重复转账或投资、补造认领；本提醒不授权资金执行。
- 监督只警告、提醒、补派，不撤销总控权限，不扣真钱或声誉分。

状态唯一来源：`knowledge/results/dispatch/oversight/latest.json`；此卡只补派，不写已执行。
