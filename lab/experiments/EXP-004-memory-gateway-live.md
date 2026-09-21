# 实验：Memory Gateway 现网

- **ID：** EXP-004
- **日期：** 2026-09-21
- **状态：** 有结果

## 观（为什么做）

全员 AI 要读同一份记忆，不能只靠本地下载。

## 行深（假设）

GitHub raw + Worker 只读足够 MVP；R2 可选。

## 实验（做了什么）

现网 GET：

- https://ltzzz-memory-gateway.ltzyz2181.workers.dev/health
- https://ltzzz-memory-gateway.ltzyz2181.workers.dev/manifest
- https://ltzzz-memory-gateway.ltzyz2181.workers.dev/file?path=ltzzz-memory/README.md

## 结果（可核对）

```json
{
  "ok": true,
  "service": "ltzzz-memory-gateway",
  "version": "1.0.0",
  "repo": "ltzyz2181-collab/ltzzz",
  "branch": "main",
  "r2_bound": false,
  "sources": ["github"],
  "note": "Read-only memory gateway. Not a scheduler. No keys for payments."
}
```

- `/manifest` 含 read_order 与 lab/ + ltzzz-memory/ 清单
- `/file` 返回记忆中心 Markdown 正文
- 是否达预期：是（只读入口通；非调度器）

## 下一步

Daily 巡查 dry-run（EXP-005）。R2 仍可选。

## 关联

- 任务 ID：T020
- 资产：Memory Gateway Worker
