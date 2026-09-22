# LTZZZ 任务池

## 发现规则
见 [TASK_DISCOVERY.md](./TASK_DISCOVERY.md)

```
发现 → Memory → GitHub → Result → Commit
→ 已有不重复 → 未完成继续 → 仅新能力新建
```

## 进行中 / 常驻

| ID | 内容 | 状态 |
|----|------|------|
| 闭环 | Result Center Task→…→Memory | 规范已落地，按任务套用 |
| OAuth | OAuth→Token→private 发布 | 文档+Worker；待主人填 Secret 与授权 |
| Daily | cron 小时触发 + 北京时刻匹配 AI | 配置层；dry_run 以现网为准 |

## 完成定义

有可核对结果（链接、路径、链上或 API 状态）+ 写入 RESULT；高影响进 Memory 需人工确认。
