# ANS 三层对账：六轮执行与真实结论（2026-11-09）

**结论：三层绑定已实测断开。不是席位的问题，是数据结构缺绑定字段。**

---

## 一、六轮执行总表

| 轮 | run_id | worker | 调用 | 结果 | 判定 |
|---|---|---|---|---|---|
| 1 | 42607819371 | qianwen + grok | 4 | approved=false | 千问只出计划，无一行数据 |
| 2 | 42609147813 | qianwen + grok | 1 | blocked | 我的包写错（planner 被要求表格开头） |
| 2b | 42609594514 | — | 0 | queue_blocked | 我的操作错（`git mv` 触发只收新增卡） |
| 3 | 42610091009 | qianwen + grok | 3 | blocked | 千问 **HTTP 520** 无输出 |
| 4 | 42610587324 | kimi + grok | 4 | approved=true | Kimi 表合规，但每格 unverified（读不到文件） |
| 5 | 42611936472 | kimi + grok | 3 | blocked | **grok 出真表**；Kimi **HTTP 504** |
| 6 | 42612494717 | grok（全三层） | 3 | needs_gpt_decision | **grok 给出完整三层判定与修复建议** |

## 二、决定性方法修正

前三轮失败后确认：**worker 席位是纯模型调用，没有文件系统。** 让它们"读仓库文件对账"物理上做不到。

第四轮起改为**数据内联**：由执行端（豆包席 VM）从真实文件读取并复算 sha256，把结果作为 pinned dataset 写进 prompt，worker 只做纯文本推理比对。

这直接奏效：
- 第 5 轮 grok 判出"LAYER B 无 run_id、`run_key` 不能替代 ANS run_id"
- 第 6 轮 grok 完整覆盖 A/B/C 三层并给出修复路径

## 三、真实对账结论（grok 原文判定）

### 逐项事实

**LAYER A｜主回执自身的 hash 全部正确**
六个 artifact（三日 × worker/reviewer）`claimed == recomputed`，全部 `equal=YES`。主回执没有伪造 hash。

**LAYER A｜verification 记录审计对象错位**
```
audited_record                  = knowledge/results/ans-cycle/2026-11-08-reviewer.json
audit_artifact_sha256_claimed   = d600a1a3aeb8…（实为 2026-11-08-worker.json 的 hash）
recomputed reviewer             = 6c51c9b6a5e6…
recomputed worker               = d600a1a3aeb8…
```
**声称审核 reviewer，实际绑定 worker 的 hash。**

**LAYER A｜sidecar 全部缺绑定字段**
六个 sidecar（三日 × worker/reviewer）`has_run_id=False`、`has_source_commit=False`。
- worker 卡 keys：`evidence_paths, finding, minimal_patch, remaining_blocker, verification_commands`
- reviewer 卡 keys：`accepted, artifact_sha256, reasons, unverified`

→ 主回执与 sidecar 只能靠 `artifact_sha256` 单向绑定，**无法反查**。

**LAYER B｜体系不同，无 ANS 标识**
```
2026-11-08: source_commit=ad54f58a…  run_key=42433064051:1  task_id=DAILY-2026-11-08-deepseek
2026-11-09: source_commit=c88e7341…  run_key=42545853488:1  task_id=DAILY-2026-11-09-deepseek
```
`has_run_id=False`。B 层是 **DAILY-** 体系，不是 ANS 体系；`source_commit` 与 A 层无一相同。

**LAYER C｜无任何 ANS 字段**
`ops/dispatch/` 下的 markdown 派单件与 JSON 回执，均不携带 ANS `run_id` 或 ANS `source_commit`。三个 ANS run_id（42278486764 / 42417292393 / 42574634598）在 dispatch 文件中一次都没出现。

### grok 的三条结论

1. **三层绑定 Broken。** 没有任何共享键能把 A→B→C 串起来。
2. **最严重的不一致**：B 与 C 缺 ANS run_id、也不复用 ANS source_commit，跨层 join 根本不可能。
3. **修法**：每个 A sidecar、B board、C dispatch 都必须持久化 ANS `run_id` 与 `source_commit`；且 verification 的 sha256 必须等于其所声称 `audited_record` 的复算 hash。

## 四、边界与成本

- `paid=false`、`deployed=false`、`financial_execution=false`，全程无资金动作、无写操作
- 席位可靠性实测：**grok 最稳（有数据即出真判定，且拒得对）> kimi（格式合规但上游两次超时 504）> qianwen（空转一次 + 520 一次）**
- 第 6 轮 grok 自述 `data_basis: executor-extracted dataset is a source claim; this seat did not read files`——边界标得诚实

## 五、待办（未执行）

1. 三个 sidecar 补 `run_id` / `source_commit` 字段（六文件）
2. `2026-11-09-doubao-verification.json` 的 `audit_artifact_sha256_claimed` 订正为 reviewer 真实 hash，或改 `audited_record` 指向 worker
3. LAYER B/C 落 ANS 绑定字段
4. 以上属代码/数据变更，需走 PatchGate，**`automatic_deploy=false` 不动**

---

回执：doubao-seat，2026-11-09。所有调用数、HTTP 码、hash 均来自 `knowledge/results/deep-superagent/queue-*.json` 与逐文件复算。
