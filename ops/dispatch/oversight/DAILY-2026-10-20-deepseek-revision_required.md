# 千问监督补派 / 原任务 DAILY-2026-10-20-deepseek

- Task ID: `DAILY-2026-10-20-deepseek`
- 补派时间：2026-10-22T02:13:57.698Z
- 补派来源：千问监督规则执行器；不是千问模型本人接单，也不是 Claude 原生派单。
- 原派单责任：gpt；执行席：deepseek；监督：qianwen。
- 状态：reminder_assigned_waiting_acceptance；问题：revision_required
- 原截止时间：2026-10-20T22:00:00+08:00
- 输入：knowledge/results/daily-board/2026-10-20.json、knowledge/results/daily-board/artifacts/2026-10-20-deepseek-54b3961392f3e25c5af636e3b5ba0d0272c9a24f323dacae15c395e5c8d8db03.json
- 目标：修复 ANS/Pulse 日课交付断链：用 origin/main 干净基线独立 worktree/分支，保留本地未提交改动。最小改 scripts/run-daily-tasks.mjs、daily-assignment、pulse-client：真实认领确认后才执行；submit_task 后回读 task_id/status/hash 一致才写 submitted_pending_review。新增/更新 mock 测试覆盖认领成功/失败/暂停、空/截断、同日重放、哈希/路径不符、提交超时状态不明、仅同步不重生成、待审核 unpaid；实际运行 node --test 指定测试文件。交付 PR＋knowledge/results/desktop/ 无密钥回执，列 source commit、执行者、测试命令/数量、失败与未完成项。
- 输出：认领/阻塞说明及引用本 Task ID 的实物回执；代码任务必须有 commit/测试/PR，部署另附运行回执。
- 验收：证据能回读、哈希与任务一致、作者与审计实际供应方不同；草稿不算生产完成。
- 禁止：创建第二个业务订单、重购未知模型请求、重复转账或投资、补造认领；本提醒不授权资金执行。
- 监督只警告、提醒、补派，不撤销总控权限，不扣真钱或声誉分。

状态唯一来源：`knowledge/results/dispatch/oversight/latest.json`；此卡只补派，不写已执行。
