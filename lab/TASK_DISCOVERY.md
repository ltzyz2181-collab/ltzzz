# 任务发现 · 防重复

```
发现任务
  ↓
查 Memory（lab/MEMORY、ltzzz-memory、promote 队列）
  ↓
查 GitHub（issues / lab/tasks / 相关路径）
  ↓
查 Result（results/executions、results/daily）
  ↓
查已有 Commit（git log / 文件是否已存在）
  ↓
已有完整实现 = 不重复开任务
  ↓
未完成 = 继续原 TASK/EXEC，不新建编号
  ↓
只有新能力 / 新边界才建立新 TASK
```

## 检查清单（每个 AI 开干前）

1. [ ] `lab/tasks.md` / `lab/MEMORY.md` 是否已有同名目标
2. [ ] `results/executions/TASK-*` 是否已有进行中任务
3. [ ] 仓库是否已有对应 Worker / 文档 / 配置
4. [ ] 最近 commit 是否已完成同类改动
5. [ ] 若只是未验证：写 VERIFY / RESULT，不新建 TASK

## 输出

- `duplicate`：指出已有路径，停止
- `continue`：沿用原 TASK-ID
- `new`：新能力说明 + 新 TASK-ID
