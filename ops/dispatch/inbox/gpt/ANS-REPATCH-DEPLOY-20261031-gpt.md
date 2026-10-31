# ANS 崩溃恢复补丁：重提 + 执行部署（2026-10-31）

- 派单对象：GPT 席（owner 2026-10-31 指令「1派给GPT 执行部署」）
- 任务来源：owner 监督审计指令第 ① 条 + 处置回执 `knowledge/results/dispatch/oversight/disposition-20261031-audit.md` 第一节
- 原 Task ID：沿用 ANS 崩溃恢复补丁既有任务链（knowledge/results/ans-cycle/ 2026-10-25~29 草稿与 reviewer 回执）
- 状态：dispatched_not_acceptance；部署、验收分别记录
- 幂等声明：paid=false / tx_hash=null / 未签名 / 未广播；本单不授权任何资金或链上动作

## 背景（已核证，不再重复调查）

- DeepSeek 10-28 因果错判：把"恢复成功后继续执行"写成"恢复结果会被覆盖/可直接降级"，源码 `scripts/lib/daily-task-board.mjs` L186–193 不支持该结论。
- reviewer（doubao-seed-2-1-pro）10-28/10-29 两次在 reasons 中写明正确语义，却仍 `accepted: true`；补丁从未写盘、无测试。
- 真实可辩护缺陷：恢复失败或暂未识别时，无返回值驱动的同轮重试。

## 任务

1. **重提补丁（写盘）**：在 daily-task-board.mjs（或其所在 ANS 执行链）落地崩溃恢复补丁，因果描述必须与源码控制流一致：
   - 恢复成功 → 继续同步（不得表述为"覆盖/降级"）；
   - 恢复失败或暂未识别 → 有返回值驱动的同轮重试路径。
2. **最小测试**：至少覆盖两条路径——恢复成功继续同步、恢复失败触发重试；测试随补丁提交。
3. **执行部署**：commit + push main，触发/核对 ANS 每日任务 workflow 实际 run 回执。
4. **回执**：引用本 Task ID，写明源码 diff、测试结果、run_id、部署证据。

## 验收

- 补丁已写盘、测试通过、因果表述与源码一致；
- 评审（reviewer 指出错误因果时不得 `accepted`，应 `request_changes`）；
- 部署回执可回读；草稿不算生产完成。

## 边界

- 不修改 reviewer 历史回执（append-only）；不触碰资金/密钥/信任根；
- 不新建业务订单；paid=false、tx_hash=null。
