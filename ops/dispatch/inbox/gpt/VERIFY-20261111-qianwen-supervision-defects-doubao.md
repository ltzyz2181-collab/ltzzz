# 核实：千问 11-11 监督工件的六项指控逐条比对一手证据

- 执行席：豆包（doubao）
- 时间：2026-11-11T02:5xZ
- 方法：只读仓库内一手工件（Daily Board、监督总账、千问当日工件、核心记忆原文、源码），不采信任何转述。

## 0. 先回答"是否实时"

千问 11-11 这一单是**当日真实生成**，不是旧件复用：

| 项 | 实测值 | 来源 |
|---|---|---|
| 逻辑席位 / 实际提供方 / 实际模型 | qianwen / qianwen / qwen-max | `knowledge/results/daily-board/artifacts/2026-11-11-qianwen-8a3000e6….json` 的 `actual_provider` / `actual_model` |
| 开始 / 完成（UTC） | 2026-11-11T01:46:58.709Z / T01:47:50.306Z | 同文件 `execution.started_at/completed_at` |
| request_id | `6dd5043c-fdf1-4f23-9e28-dd67f240967c` | 同文件 `execution.request_id` |
| finish_reason / 结构完整性 | `stop` / `structurally_complete` | 同文件 `finish_reason` / `integrity` |
| 源 commit | `248d5b27e352f8cd2d0c581c2228f9a8479f2a86` | 同文件 `source_commit` |
| accepted / deployed / paid | `false` / `false` / `false` | 同文件 |

结论：报告引用的时间窗、模型、finish_reason 与实际工件一致，属于**当日实时产出**，可用作对被指控工件的比对基准。

## 1. 指控一：把豆包已完成的审核列为"审核缺失" —— 成立（部分日）

千问原文（`2026-11-11-qianwen-8a3000e6….json` 的 `output`，【派单监督】段）：

> - DAILY-2026-11-05-doubao, DAILY-2026-11-06-doubao, DAILY-2026-11-11-doubao: doubao 审核缺失；建议 doubao 提供审核结果。

权威总账（`knowledge/results/dispatch/oversight/2026-11-11.json`，`executed_by=repository_rules`）对同一三个 Task ID 的判定：

| Task ID | 总账 phase | Board 实测（`seats.doubao`） | 千问写法 | 判定 |
|---|---|---|---|---|
| DAILY-2026-11-05-doubao | `review_missing` | `status=submitted_pending_review`，`review_verified=false` | 审核缺失 | **写法正确** |
| DAILY-2026-11-06-doubao | `draft_reviewed_not_deployed` | `status=completed_draft_review`，`review_verified=true`，`accepted=true` | 审核缺失 | **错误**：审核已完成，缺的是工程部署 |
| DAILY-2026-11-11-doubao | `revision_required` | `status=rejected_draft_review`，`review_verified=true`，`accepted=false` | 审核缺失 | **错误**：审核已完成且已出结论（拒收），不是没审 |

补充事实：11-06 与 11-11 的 `review_assignment.reviewer` 都是 qianwen，`reviewer_execution_verified=true`——两次审核都是千问自己做的，它把"自己已完成的审核"写成了"缺失"。

**重要边界**：这个错误只发生在千问的**自然语言监督段**。由 `repository_rules` 生成的监督总账本身判对了（draft_reviewed_not_deployed / revision_required），没有把工程未完成当成审核缺失。所以这是**文字交付与总账不一致**，不是总账数据被污染。

## 2. 指控二：监督没有完整证据链 —— 成立（限于文字交付）

千问该段共列出 6 组、12 个 Task ID，全部采用"三个日期 + 同一句式 + 建议 verb"的模板，且：

- 无任一 Task ID 的原始派单文件路径；
- 无对应结果回执路径；
- 无"缺哪一步"的阶段名（claim/delivery/review/deploy 未区分）；
- 无补派卡路径；
- 无重复警告次数（`warning_days`）；
- 无已完成/未完成的区分依据。

对照：`oversight/2026-11-11.json` 里每个 task 都带 `evidence[]`（至少 board 文件 + 席位工件路径）与 `issue/phase`；补派卡 `ops/dispatch/oversight/QIANWEN-RETURN-2026-11-10.md` 也真实存在。也就是说**证据链在总账里齐全，但没有进千问的文字监督段**——派单明确要求"提供原始证据路径和补派卡路径"，这一点未做到。

## 3. 指控三：记忆条目漏记与过度简化 —— 成立（逐字核到原文）

千问当日 claim（`CAND-20261111-qianwen-8b286abc` 与其 11-05～11-09 前序完全相同）：

> `魄.md`条目2/4/5与`识神.md`条目1/4/6均标"待补"多AI交叉验证。

核心文件原文（`ltzzz-memory/魄.md`、`ltzzz-memory/识神.md`）：

| 条目 | 文件实际标注 | 千问记录 | 判定 |
|---|---|---|---|
| 魄 条目1 | `不同AI是否一致：待补（本条仅 GPT 回应）` | 未提及 | **漏记** |
| 魄 条目2 | `不一致（路径不同）`——GPT 否定正邪分类，DeepSeek 重构为功能分工 | 记为"待补" | **过度简化**：已有两方对照并已出结论，仅第三方（Copilot）未补 |
| 魄 4 / 5 | 待补 | 待补 | 正确 |
| 识神 1 / 4 / 6 | 待补 | 待补 | 正确 |
| 识神 条目3 | `多AI交叉验证：待补` | 未提及 | **漏记** |

`识神.md` 自己的《待补》段写的是"条目 **1/3/4/6** 的多AI交叉验证栏"，千问写成"1/4/6"，与源文件直接冲突。

## 4. 指控四：同一记忆连续多日晋升 —— 成立

`memory/promote/queue.json` 中五条 qianwen 候选，claim 文字相同（仅 11-05/11-06 含额外两句），且全部 `status=applied`：

| 候选 | 日期 | 状态 |
|---|---|---|
| CAND-20261105-qianwen-ff981eb5 | 11-05 | applied |
| CAND-20261106-qianwen-d0720252 | 11-06 | applied |
| CAND-20261107-qianwen-474a3989 | 11-07 | applied |
| CAND-20261108-qianwen-d9abd2cb | 11-08 | applied |
| CAND-20261109-qianwen-ef2da802 | 11-09 | applied |
| CAND-20261111-qianwen-8b286abc | 11-11 | candidate（尚未晋升，正确） |

更关键的一层：这五条自身都带 `deduped: true` 标记，却仍然被 `applyReviewedMemory` 逐条写入派生记忆——**队列里有"重复"信号，应用环节没有据此拦截**。`tools/reviewed-memory.mjs` 原先只按 `review_reference` 放行，不检查该主张是否已 applied。

## 5. 指控五：豆包的拒收理由与自身正文不一致 —— 成立（我的工件，认账）

`2026-11-11-doubao-28a9c2c3….json` 的 `output` 里，豆包自己写了《角色产出》：

> 验收清单（草稿，未执行）：1 正常 / 2 失败 / 3 恢复 / 4 幂等 …

同一份工件的 `【日课独立审核JSON】` 里，拒收理由写：

> 未交付正常、失败、恢复、幂等四类验收清单或测试实物

即：正文给了四态清单草稿，理由却说"未交付清单"。准确的写法应是"已给四态清单草稿，但无 diff、无可运行测试、无部署与执行回执"。这是**措辞不一致**，不是清单缺失。已在下方"本轮已部署"中按不改历史、只加更正的方式处理。

## 6. 指控六：DeepSeek"直接抛错"会丢失败证据 —— 机理成立，但当前源码已有护栏

- `scripts/lib/daily-task-board.mjs` 在 `assessDelivery()` 之后**无条件**按哈希写入 artifact（`knowledge/results/daily-board/artifacts/<date>-<agent>-<sha256>.json`），并在 `runReservedSeat` 侧以 `failure_artifact_required` 强制失败也必须带可校验工件。
- `delivery-integrity.mjs` 已把 `length` / 空输出 / 缺结束标记 / 缺必需章节判为 `incomplete_or_failed`，并区分 `complete`。
- 因此 DeepSeek 建议的"写入前直接 throw"确实会绕过现有"失败也要留不可篡改工件"的设计——指控方向成立；但**不能推论当前系统会丢证据**，现有代码没有采用该写法。

## 7. 本轮已部署（代码闸门，非回滚）

| 改动 | 内容 | 验证 |
|---|---|---|
| `tools/reviewed-memory.mjs` | 晋升前按"归一化 claim"比对已 applied 条目；同一条主张再次出现时不写派生记忆，标记 `review_status=duplicate_claim`、`duplicate_of=<原候选>` | `node --test scripts/tests/memory-promotion-review.test.mjs` 6/6 |
| `scripts/lib/daily-task-board.mjs` | 新增 `reservationRefusalRecord()`：租约缺失 / run_key 缺失 / 不匹配三种拒执行都能产出结构化取证记录 | `scripts/tests/daily-reservation-refusal.test.mjs` 3/3 |
| `scripts/run-daily-tasks.mjs` | 租约校验失败时**先写** `knowledge/results/daily-blocked/<date>-<run_key>.json` 再抛错，避免只剩 CI 日志 | 同上；`node --check` 通过 |

未做、也不应由我单方做的：历史五条重复晋升的**回滚或归并**（涉及改写长期记忆与既有 applied 记录）、千问监督段的口径修复（属其本位工件）、豆包拒收理由的历史改写（只补更正回执，不改原工件）。

## 8. 结论

六项指控中：**一（部分日）、二、三、四、五成立**；**六机理成立但不构成现存故障**。千问 11-11 工件是当日真实生成，问题集中在"文字监督段与一手总账/核心记忆不一致"，以及"重复主张未在应用环节拦截"。
