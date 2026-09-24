# Result Center

闭环见 [RESULT_CENTER.md](./RESULT_CENTER.md)

```
Task → Execution ID → Output → Verification → Result → Memory
```

## 状态

| 状态 | 含义 |
|------|------|
| planned | 仅有任务 |
| running | 已有 EXEC |
| output_ready | 有输出，未验证 |
| verifying | VERIFY 进行中 |
| verified | VERIFY 通过 + 证据 |
| failed | 失败已记录 |
| blocked | 缺凭证/权限 |
| waiting_human | 等人（发片/资金） |

## 禁止

- AI 回复「完成」 ≠ verified
- 代码存在 ≠ deployed
- 无 VERIFY 不写 RESULT 为 verified
- RESULT 不自动写长期 Memory
