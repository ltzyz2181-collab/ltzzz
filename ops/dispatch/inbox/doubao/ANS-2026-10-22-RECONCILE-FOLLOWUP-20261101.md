# 补派：ANS-2026-10-22-doubao-reconcile 重派/书面降级（2026-11-01）

- 派单对象：豆包席（owner 2026-11-01 派单监督 #4）
- 原 Task ID：ANS-2026-10-22-doubao（blocked_reconcile_existing_attempt）
- 状态：dispatched_pending_delivery；**不得写"已完成"**
- 幂等声明：paid=false / tx_hash=null / 未签名

## 已核实事实（勿重复调查）

- control/latest.json 中 doubao_task 指令要求交付 `knowledge/results/dispatch/oversight/ANS-2026-10-22-doubao-reconcile.json`（读取路径及 SHA256、差异项、是否需重试、实际模型与用量；不得把已验收写回、不新调用）；
- 该交付文件 **404 不存在**；`knowledge/results/ans-cycle/2026-10-22.json` status=blocked_provider_or_incomplete。

## 任务

1. **重派**：读取 repair_file（千问 10-22 补派卡 `ops/dispatch/oversight/ANS-2026-10-18-doubao-blocked_reconcile_existing_attempt.md` 或 10-22 对应卡）与 knowledge/results/ans-cycle/2026-10-22*.json，完成对账，交付 `knowledge/results/dispatch/oversight/ANS-2026-10-22-doubao-reconcile.json`（含读取路径及 SHA256、差异项、是否需重试、实际模型与用量）；或
2. **书面降级**：若能力/材料不足，交付同路径 blocked 说明（含缺失项与原因），状态登记 blocked_pending_receipt，**不得写 completed**。

## 禁止

- 不把已验收回写；不新调用付费模型；不补造读取证据。
