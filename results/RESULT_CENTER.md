# Result Center · 闭环

```
Task
  ↓
Execution ID
  ↓
Output
  ↓
Verification
  ↓
Result
  ↓
Memory（高影响需人工确认后晋升）
```

开任务前先走 `lab/TASK_DISCOVERY.md`：已有不重复，未完成继续原任务。

## ID 规则

| 阶段 | 格式 | 谁写 |
|------|--------|------|
| Task | `TASK-YYYYMMDD-NNN` | 人 / 总控拆解 |
| Execution | `EXEC-YYYYMMDD-<AI>-NNN` | 任一执行 AI（含豆包） |
| Output | 写在 EXEC 内或附件 | 原始产出 |
| Verification | `VERIFY-YYYYMMDD-NNN` | 另一 AI 或人 |
| Result | `RESULT-YYYYMMDD-NNN` | 汇总 |
| Memory | promote 候选 → lab/MEMORY | 高影响必须人工 |

## 状态机

```
planned → running → output_ready → verifying →
  verified | failed | blocked | waiting_human
```

- output_ready ≠ verified
- 无 VERIFY 不写 RESULT 为 verified
- RESULT 不自动进长期 Memory
