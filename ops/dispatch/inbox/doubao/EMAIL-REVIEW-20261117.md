# 派单卡 · EMAIL-REVIEW-20261117

- task_id: EMAIL-REVIEW-20261117
- decision_id: GPT-LTZZZ-AUTONOMY-RULING-20261117-01
- decision_status: decided
- executing_seat: doubao（只读独立审查席）
- permission_boundary: 只读审查；不写仓库、不改配置、不发送邮件、不接触凭据；只输出审查意见
- acceptance_criteria: 覆盖六项并逐项给结论与反例：①邮件隐私（无关私人正文/个人信息）②三层去重 ③发送幂等与未知结果处理 ④L1/L2/L3 分级是否被绕过 ⑤凭据保护（日志/回执/异常）⑥失败处理不阻断其他任务
- 阶段: 与第一阶段并行

## 交付形式
- 输出审查报告（结论 + 证据路径 + 反例），不伪造通过。
- 发现 L3 被自动化的事实，直接标 BLOCKED 并给出复现路径。
