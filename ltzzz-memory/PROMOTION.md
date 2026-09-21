# 记忆晋升

```
Daily Memory
     ↓
候选记忆     memory/promote/candidates/
     ↓
去重         hash / 近似标题
     ↓
冲突检测     与长期 Memory 矛盾
     ↓
AI验证       CROSS_REVIEW 链
     ↓
人工确认     高影响必须
     ↓
长期 Memory   ltzzz-memory/ + lab/MEMORY.md
```

## 状态

candidate → deduped → conflict → reviewed → waiting_human → applied | rejected

## 高影响（没有人工确认不能 applied）

- 资金 / 钱包 / 支付 / 出金
- 私钥 / Secret / 权限
- 对外发片 public
- 替换说明书式定位、决策日志
- 宣称某 Worker “已接管”

## 低影响（AI 验证后可建议 applied，仍建议人看一眼）

- 当日巡查摘要
- 实验编号、execution_id 链
- 已验证的 /health JSON
