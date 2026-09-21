# Execution ID

所有 AI 工作按一条链记，不再各说各话。

```
TASK-YYYYMMDD-NNN
       ↓
EXEC-YYYYMMDD-<AI>-NNN
       ↓
RESULT-YYYYMMDD-NNN
       ↓
VERIFY-YYYYMMDD-NNN
```

| 前缀 | 谁写 | 含义 |
|------|------|------|
| TASK | 人 / GPT 拆解 | 要做什么 |
| EXEC | 某个 AI | 必须带 memory_id |
| RESULT | 汇总 | 产出 + 证据 |
| VERIFY | 交叉审 | DeepSeek→Claude→Grok→GPT |

禁止把 EXEC 直接当 RESULT。禁止不带 memory_id 的 EXEC。
微软不再部署。
