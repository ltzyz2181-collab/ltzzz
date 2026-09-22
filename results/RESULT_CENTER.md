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

## ID 规则

| 阶段 | 格式 | 谁写 |
|------|--------|------|
| Task | `TASK-YYYYMMDD-NNN` | 人 / GPT 拆解 |
| Execution | `EXEC-YYYYMMDD-<AI>-NNN` | 执行 AI（必带 memory_id） |
| Output | 写在 EXEC 内或 `output/` | 原始产出 |
| Verification | `VERIFY-YYYYMMDD-NNN` | 另一 AI 或人 |
| Result | `RESULT-YYYYMMDD-NNN` | 汇总：证据 + 状态 |
| Memory | promote 候选 → lab/MEMORY | 高影响必须人工 |

## 状态机

```
planned → running → output_ready → verifying →
  verified | failed | blocked | waiting_human
```

- `output_ready` ≠ `verified`
- AI 说「完成」不能直接 `verified`
- 只有 VERIFY 通过才写 RESULT；RESULT 不自动写进长期 Memory

## 目录

```
results/
  RESULT_CENTER.md          本文
  results.md                索引
  executions/
    TASK-*.md
    EXEC-*.md
    RESULT-*.md
    VERIFY-*.md
  daily/
  video/
```

## 交叉审（默认）

```
GPT 提出
  ↓
DeepSeek 验证
  ↓
Claude 反向审
  ↓
Grok 找反例
  ↓
GPT 最终整理 → RESULT
```

微软不参与。豆包不做 VERIFY（只做 EXEC 文案类）。
