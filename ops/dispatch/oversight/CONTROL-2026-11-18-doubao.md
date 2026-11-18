# 千问监督补派 / 原任务 CONTROL-2026-11-18-doubao

- Task ID: `CONTROL-2026-11-18-doubao`
- Idempotency-Key: oversight:CONTROL-2026-11-18-doubao
- 补派时间：2026-11-18T19:58:22.658Z
- 补派来源：千问监督规则执行器；不是千问模型本人接单，也不是 Claude 原生派单。
- 原派单责任：gpt；执行席：doubao；监督：qianwen。
- 状态：reminder_assigned_waiting_acceptance；问题：claim_missing
- 原截止时间：2026-11-18T22:00:00+08:00
- 输入：knowledge/results/control/2026-11-17.json
- 目标：复用 AUTO-2026-11-16-health，独立复核心跳与自动恢复证据：只读现有 health/日课回执和台账，核对 provider/model、usage、claim_verified、review 状态；逐项给出 accepted/rejected/blocked 并写入 oversight 回执；缺失字段写 unverified，不重跑生成、不调用付费模型；若 DeepSeek 新 ANS 回执存在则一并独立复核。
- 输出：认领/阻塞说明及引用本 Task ID 的实物回执；代码任务必须有 commit/测试/PR，部署另附运行回执。
- 验收：证据能回读、哈希与任务一致、作者与审计实际供应方不同；草稿不算生产完成。
- 禁止：创建第二个业务订单、重购未知模型请求、重复转账或投资、补造认领；本提醒不授权资金执行。
- 监督只警告、提醒、补派，不撤销总控权限，不扣真钱或声誉分。

状态唯一来源：`knowledge/results/dispatch/oversight/latest.json`；此卡只补派，不写已执行。
