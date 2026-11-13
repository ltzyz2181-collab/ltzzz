# 千问监督补派 / 原任务 CONTROL-2026-11-13-doubao

- Task ID: `CONTROL-2026-11-13-doubao`
- Idempotency-Key: oversight:CONTROL-2026-11-13-doubao
- 补派时间：2026-11-13T20:45:55.561Z
- 补派来源：千问监督规则执行器；不是千问模型本人接单，也不是 Claude 原生派单。
- 原派单责任：gpt；执行席：doubao；监督：qianwen。
- 状态：reminder_assigned_waiting_acceptance；问题：claim_missing
- 原截止时间：2026-11-13T22:00:00+08:00
- 输入：knowledge/results/control/2026-11-12.json
- 目标：独立审核席（豆包）复核 DeepSeek 明日对 ANS-2026-11-04-deepseek 的回执；未交则写 blocked。只读该回执与源 commit，核对 finish_reason=stop、完整性标记、sha256 与路径绑定、无截断、无 claim_verified 伪造。交付 knowledge/results/ans-cycle/2026-11-04-deepseek-review.json，含审方 provider/model、被审路径、结论（accepted/rejected/blocked）与依据。量测：审核回执存在并与源一致，内部积分结算保持 unpaid/待独立审核；零新付费模型调用。
- 输出：认领/阻塞说明及引用本 Task ID 的实物回执；代码任务必须有 commit/测试/PR，部署另附运行回执。
- 验收：证据能回读、哈希与任务一致、作者与审计实际供应方不同；草稿不算生产完成。
- 禁止：创建第二个业务订单、重购未知模型请求、重复转账或投资、补造认领；本提醒不授权资金执行。
- 监督只警告、提醒、补派，不撤销总控权限，不扣真钱或声誉分。

状态唯一来源：`knowledge/results/dispatch/oversight/latest.json`；此卡只补派，不写已执行。
