# ANS 三层绑定：当前做法与已完成范围（2026-11-17）

依据 GPT 2026-11-11 裁决：**允许补 `run_id` / `source_commit`，但不得改写既有六个 sidecar 原件**，绑定关系只能放在 companion metadata 或 append-only 绑定索引里。本文件记录实际做法与已完成边界，不是提案。

## 一、做法

- 新增 `scripts/ans-binding-index.mjs`（`REVISION=ans-binding-v1`）：从主回执 `knowledge/results/ans-cycle/<YYYY-MM-DD>.json` 的 `artifacts[]` 派生绑定记录，复算每个 sidecar 的 sha256，写入 `knowledge/results/ans-cycle/binding-index.jsonl`。
- 索引是 **append-only**：第二次构建同一批不再追加；写入前校验「新内容必须是既有索引的字节前缀」，否则直接报错拒绝（`append-only 护栏触发`）。
- 六个 sidecar 原件 **字节与 mtime 一律不动**：构建前后逐个比对 size / mtimeMs / sha256，脚本内自带断言，测试 `构建过程不改写原件` 覆盖。
- 每条记录带：`run_id`、`source_commit`、`main_receipt_path` / `main_receipt_sha256`、`artifact_role`、`task_id`、`executed_by`、`artifact_path`、`artifact_sha256_claimed`、`artifact_sha256_recomputed`、`binding`（`match` / `mismatch`）、`original_sidecar_rewritten=false`。

命令：

```
node scripts/ans-binding-index.mjs build --days 2026-11-07,2026-11-08,2026-11-09 [--dry-run]
node scripts/ans-binding-index.mjs verify
node scripts/ans-binding-index.mjs stats
```

## 二、已完成（实测数字）

| 项 | 结果 |
|---|---|
| 绑定记录 | 6 条（11-07 / 11-08 / 11-09 各 2，worker 3 + reviewer 3） |
| `binding=match` | 6 |
| `binding=mismatch` | 0 |
| 带 `run_id` | 6 |
| 带 `source_commit` | 6 |
| 原件被改写 | 0 |
| `verify` 结果 | `total=6 / mismatch=0 / missing=0 / problems=[]` |

三层绑定此前「断开」的直接原因（sidecar 缺 `run_id`/`source_commit`，只能靠 `artifact_sha256` 单向绑定、无法反查）已由索引解决：现在从任一 sidecar 的哈希可反查 `run_id` → `source_commit` → 主回执。

## 三、verification 记录错位的处置

`2026-11-09-doubao-verification.json` 自称审计 `2026-11-08-reviewer.json`，但 `audit_artifact_sha256_claimed` 实为 `2026-11-08-worker.json` 的哈希（`claimed==worker: true`、`claimed==reviewer: false`）。

按同一裁决**不改原件**，改为写 companion：`knowledge/results/ans-cycle/2026-11-09-doubao-verification.companion.json`，登记 `declared_value` / `declared_value_sha256` / `claimed_hash_belongs_to` / 两侧真实哈希，并在文件里写明 `original_rewritten=false`。

## 四、未做（边界）

1. **LAYER B（DAILY- 体系）**：`2026-11-08/09` 的 board 仍是 `run_key=42433064051:1` 这类体系，与 ANS `run_id` 不同源，本轮未强行 join。要接必须先在 board 侧持久化 ANS `run_id`，属改数据结构，未做。
2. **LAYER C（`ops/dispatch/` 派单件）**：里面一次都没出现 ANS `run_id`，回填等于改写历史派单件，未做。
3. 索引只覆盖 A 层六个 sidecar；`2026-11-07-p1-01-fault-injection.json`、`2026-11-01/04-supervision-*.json` 等旁支工件未纳入。
4. 未接线到 CI：索引靠手动或巡检时构建，没有 workflow 步骤强制校验。

## 五、纪律

只读原件、只追加索引、无资金动作（`financial_execution=false`、`paid=false`）、无部署（`deploy=false`）。`automatic_deploy` 开关未因此改变。
