# 派单卡 · EMAIL-WORKFLOW-20261117

- task_id: EMAIL-WORKFLOW-20261117
- decision_id: GPT-LTZZZ-AUTONOMY-RULING-20261117-01
- decision_status: decided
- executing_seat: deploy（AI 部署席）
- permission_boundary: 只提 PR；不得直接启用生产定时任务；不得动用 L3 项（付款/退款/转账/签名/生产部署/权限提升/Secrets/不可逆外部操作）
- acceptance_criteria: ①每日收发工作流 YAML（定时 + 手动触发）②并发锁 ③失败告警与不阻断其他任务 ④回执写入路径与脱敏字段 ⑤PR 内附测试；合并后仍需独立部署授权
- 阶段: 第三阶段

## 硬约束
- 工作流不得持有或打印凭据。
- 发送前必须校验六个必填字段与收件人来源。
- 未知发送结果先查原线程，不得盲目重发。
- 上线（启用 schedule）属生产变更，须单独授权。
