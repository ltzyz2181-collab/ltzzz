# 错误台账（knowledge/lessons）

一条教训一个文件。格式见 `protocol/lesson.schema.json`，设计见 `docs/REFLECTION-HARNESS.md`。

- 命令：`node scripts/lessons.mjs validate | retrieve --tags a,b | check-preflight <文件> --tags a,b | recurrence <失败.json> | draft <回执.json> | stats`
- `observed` 只作建议；`adopted` 才可强制，需要异供应方接受评审；`verified` 需要测试或 CI 守卫。
- 教训只能增加谨慎，不能放松限制，也不能触及资金、密钥或信任根。
- 不删除，过期标记 `retired`。
