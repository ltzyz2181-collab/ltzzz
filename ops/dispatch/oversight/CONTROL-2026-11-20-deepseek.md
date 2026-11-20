# 千问监督补派 / 原任务 CONTROL-2026-11-20-deepseek

- Task ID: `CONTROL-2026-11-20-deepseek`
- Idempotency-Key: oversight:CONTROL-2026-11-20-deepseek
- 补派时间：2026-11-20T18:18:34.107Z
- 补派来源：千问监督规则执行器；不是千问模型本人接单，也不是 Claude 原生派单。
- 原派单责任：gpt；执行席：deepseek；监督：qianwen。
- 状态：reminder_assigned_waiting_acceptance；问题：claim_missing
- 原截止时间：2026-11-20T22:00:00+08:00
- 输入：knowledge/results/control/2026-11-19.json
- 目标：复用原 Task ID：CONTROL-2026-11-17-deepseek、DAILY-2026-11-17-deepseek。单次执行，不重试、不新建付费调用。读取对应 repair_file 与绑定回执，补齐 claim 与 revision；产出无密钥回执到 knowledge/results/dispatch/oversight/，记录 actual provider/model、source_commit、文件SHA256、测试命令及通过/失败数。若输出为空、截断或哈希不能回读，如实写 blocked。状态只可到 submitted_pending_review，不得标已审核/已部署/已结算。实物：两个回执JSON加回读校验记录；量测：open_warnings 对应两项可读为 pending_review 或 blocked，SHA256 与路径一致。
- 输出：认领/阻塞说明及引用本 Task ID 的实物回执；代码任务必须有 commit/测试/PR，部署另附运行回执。
- 验收：证据能回读、哈希与任务一致、作者与审计实际供应方不同；草稿不算生产完成。
- 禁止：创建第二个业务订单、重购未知模型请求、重复转账或投资、补造认领；本提醒不授权资金执行。
- 监督只警告、提醒、补派，不撤销总控权限，不扣真钱或声誉分。

状态唯一来源：`knowledge/results/dispatch/oversight/latest.json`；此卡只补派，不写已执行。
