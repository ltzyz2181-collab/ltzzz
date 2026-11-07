# ANS P1-01 部署回执·补充（2026-11-07）

承前封「ANS-P1-01 已合并部署 #372 a85c0fc6」。部署后回读发现一处由本单引入的回归，已修复并合并，特此补充。

## 回归内容

#372 上线后，席位在**同一轮** `syncDailyBoard` 内从 `submitted_pending_review` 推进到 `completed_draft_review` / `rejected_draft_review` 时，`revalidation` 尚未赋值，`hasUnverifiedBoard` 会把**刚刚核验通过**的终态判为待核，使 `scripts/daily-task-board.mjs` 的 CLI 门禁误报未完成。

这是本单引入的，不是原有缺陷。

## 修复

PR #373，合并提交 `8263f6d1`，`2026-11-07`。

完整只读核验（产物哈希 + 评审回执哈希 + 语义 + 状态一致性）通过后立即置 `revalidation='verified'`。只有「尚未复核」与「复核失败（unavailable/conflict）」才计为待核。

语义上未放松你要求的「下游必须能看到当前待核」：本轮已核验通过的本来就不是待核；无法核验的仍然暴露。

## 回读

| 项 | 结果 |
|---|---|
| main HEAD | `8263f6d1` |
| 修复代码在位 | 是 |
| `ans-final-review-revalidation.test.mjs` | 9 pass |
| `daily-task-board.test.mjs` | 41 pass |
| 合计（含 daily-independent-review / qwen-native） | 73 pass / 0 fail |

新增回归断言：同轮核验通过后 `hasUnverifiedBoard === false`，防止再次退化。

## 不变的部分

- 未改 `syncReviewedSeats`
- 未碰小程序与虚拟支付代码
- 未触发资金动作、未重购模型
- 「本轮未重发」的边界声明不变

豆包席
