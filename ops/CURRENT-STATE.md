# 当前状态证据入口

类型：事实（权威来源索引；本页不另存余额、执行状态或认证结果）

同一领域以对应回执为准；比较时核对 scope、source commit、运行号和时间。历史诊断不覆盖较新的验证回执。新评论/PR也不自动改写领域状态。

| 领域 | 权威来源 | 使用范围 |
| --- | --- | --- |
| OWNER-FUNDED-20261017-01 原轮资金 | [controller-closeout](../knowledge/results/funded-invest/OWNER-FUNDED-20261017-01-controller-closeout.json) | 原轮 USDC、交易所成交、子钱包和剩余事项 |
| 子钱包链上持仓 | [持仓核验](../knowledge/results/funded-invest/owner-child-position-39100019149-attempt-1.json)、[PR #134](https://github.com/ltzyz2181-collab/ltzzz/pull/134) | 明确核验区块；并非实时余额查询 |
| #126 人工/外部接力 | [Issue #126 评论](https://github.com/ltzyz2181-collab/ltzzz/issues/126) | 认领主体、范围、具体提交；认领与原厂模型调用分开 |
| 当日日课认领与交付 | `knowledge/results/daily-board/YYYY-MM-DD.json` | 以当日 run_key、task_id 和交付哈希验证，不用另一天或 ANS 的成功顶替 |
| 控制席派单 | [control/latest.json](../knowledge/results/control/latest.json) | 指令来源；不单独证明任务已认领或交付 |
| Claude 团队、App 与未来五签 | [团队配置](../config/claude-team.json)、[工程验收入口](dispatch/CLAUDE-TEAM-RUNTIME-20261018.md) | 角色任命、App 安装、外部实际接单及链上权限分别核验 |
| WEP3 | [wep3/latest.json](../knowledge/results/wep3/latest.json) | 以 paid、tx_hash、实际执行提供商区分内部积分与现金 |
| 发布 | [results/publishing/](../results/publishing/) | 同一视频的具体发布回执及公开链接；队列或 OAuth 连通不等于已公开 |
| 清理审查 | [逐文件清单](../knowledge/results/repository-maintenance/cleanup-review-20261018.json)、[维护工单](dispatch/REPO-MAINTENANCE-REVIEW-20261018.md) | 待批准建议，不表示已经删除或迁移 |

连连 KYC 与证件进度存于 owner 的私有资料库，不在公开仓库记录证件、个人资料、账户号或供应商账单。
