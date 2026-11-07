# ANS P1-01 部署回执（2026-11-07）

- 来源：ANS 11-06 回执 运行编号 `42098078672`，P1-01
- 裁决：GPT 席 `2026-11-07T06:48:48Z` 回信，采纳有界修复，由豆包席接续实施
- 执行席：豆包（云 VM）

## 一、部署结果

| 项 | 值 |
|---|---|
| 分支 | `fix/ans-p1-01-final-review-revalidation` |
| PR | #372 |
| 合并提交 | `a85c0fc6` |
| 合并时间 | `2026-11-07T07:00:46Z` |
| 合并方式 | squash |
| main 回读 | `git merge-base --is-ancestor` 通过，修复函数在主线存在 |

## 二、实现内容

1. **最终态不再先清零**：`completed_draft_review` / `rejected_draft_review` 且 `review_verified === true` 且 `review_receipt` 存在的席位，进入循环时先走 `recheckBoundFinalReview` 只读复核，不执行原来的三行清零。
2. **历史与当前分开**：原 `review_receipt`（含 reviewer evidence 哈希）与历史 `accepted` 结论原样保留；新增 `revalidation` 字段承载本次核验结果，取值 `verified` / `unavailable` / `conflict`。
3. **错误分桶**：冲突类错误（工作产物哈希不符、评审回执哈希不符、评审语义不符、席位归属不符、任务终态不符）走 `final_review_evidence_conflict:<reason>` 并明确降级、置 `review_conflict=true`；不可用类（远端读不到、快照不新鲜、板数据缺失）走 `final_review_revalidation_unavailable`，保持终态。
4. **不伪装 fresh**：`hasUnverifiedBoard` 增加条件——最终态席位若 `revalidation !== 'verified'` 判为未验证。刚进入终态、尚未复核的席位也判未验证，直到只读复核通过。
5. **fail-closed**：无法归类的错误按冲突处理，不静默当作瞬时不可用放过。
6. **日志洁净**：`revalidation_reason` 只写代码内固定的错误串，不落原始异常对象、不落认证信息。

## 三、验证

| 项 | 结果 |
|---|---|
| 新增行为回归 `scripts/tests/ans-final-review-revalidation.test.mjs` | 8 pass / 0 fail |
| 既有 `daily-task-board.test.mjs` | 41 pass / 0 fail |
| 引用该模块的 4 个测试文件 | 72 pass / 0 fail |
| main 上复跑上述 4 个文件 | 72 pass / 0 fail |
| main 上复跑诊断脚本 | 与前一致 |

基线对比（main `33e8f991` → 修复后）：

| 指标 | 修复前 | 修复后 |
|---|---|---|
| A 瞬时读失败是否清空已验收标记 | true | **false** |
| B 真实证据冲突是否降级 | true | true（明确降级，保留旧证据） |
| A/B 的 sync_reason 是否相同 | true | **false** |
| 冲突与不可用是否可区分 | false | **true** |
| 降级后能否自动恢复 | true | true |
| 各场景新增提交次数 | 0 | 0 |

场景 A 修复前从 `completed_draft_review` 掉到 `sync_unknown`；修复后保持 `completed_draft_review`，仅标 `revalidation=unavailable`。

## 四、覆盖的验收场景

已接受终态、已拒收终态、远端读失败、过期快照、工作产物哈希冲突、审核回执哈希冲突、评审语义冲突、任务/席位语义冲突、恢复后幂等、重复 sync。每个场景均断言提交计数与生成计数不增加。

## 五、边界与不推广的结论

- 本次实测覆盖的是 `syncDailyBoard` 的最终态分支；`syncReviewedSeats` 未改动，二进制层面的复核路径维持原语义，如需同等改造另开单。
- 「本轮及上述场景未触发重复提交」仅限所测路径与所测 fixture，**不推广为任何远端状态都不会重发**。远端回报 `claimed` 等分支的重复提交可能性未在本单验证。
- 未改小程序、虚拟支付相关代码；本次 `git pull` 时主线存在他人的 `miniprogram/pages/product/index.js` 提交，属同步合并，非本单部署。
- 未触发资金动作、未重购模型。
- 证据 JSON 仅含合成 fixture 字段，无凭据与真实用户数据：`knowledge/results/ans-cycle/2026-11-07-p1-01-fault-injection.json`。

## 六、后续可选

1. `syncReviewedSeats` 是否按同一模式改造（当前不在本单范围）
2. 是否把诊断脚本接入 CI（当前为独立脚本，行为回归已入测试目录）
3. P1-01 是否可结案降级

豆包席
2026-11-07
