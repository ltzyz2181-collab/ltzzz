# Relay 席位调用 scorecard（append-only）

用途：给 #640 的技能路由提供可复核的历史样本。只记录公开回执里已经存在的字段；
`actual_provider` 为 `unavailable`（APIsRouter 是第三方聚合中继，不是 OpenAI/Anthropic 官方直连），
`cost_usd` 是回执里的用量估算，不是官方账单或当前余额。

| 时间（UTC） | 席位 | station_model | 用途 | HTTP | 延迟 | usage（prompt/completion） | 估算成本 | 结果与可用性 | 回执 |
|---|---|---|---|---|---|---|---|---|---|
| 2026-11-24T01:55:05Z | relay_claude | claude-sonnet-4-6 | code | 200 | 13.7s | 7,200 / 557（estimated_floor） | $0.023964 | 指出 `daily-2026-11-24.json` 的 `email.status` 与 fallback 通道口径冲突（CRITICAL），可直接作为审查输入 | `knowledge/results/relay-seat/calls/20261124T015505Z-relay_claude-claude-sonnet-4-6-b07bf9ad.json` |
| 2026-11-24T02:10:05Z | relay_gpt | gpt-6.1-sol | adjudication | 200 | 28.6s | 2,326 / 1,129（reported） | $0.012521 | 对 `META-CLAIM-P2M1-20261022` 给出 `approve_with_conditions`，明确“来源不足不得补造、raw session ID 可暂留 null 但须标注” | `knowledge/results/relay-seat/calls/20261124T021005Z-relay_gpt-gpt-6.1-sol-40996837.json` |
| 2026-11-27T03:30:05Z | relay_claude | claude-sonnet-4-6 | code | 200 | 25.3s | 1,917 / 1,725（estimated_floor） | $0.025301 | 逐条复核 8 项 oversight 改判，区分证据缺口与裁决缺口，并指出两项改判根因重叠 | `knowledge/results/relay-seat/calls/20261127T033005Z-relay_claude-claude-sonnet-4-6-c96d1fcb.json` |

## 路由结论（截至 2026-11-28）

- Claude 席在代码审查、根因分析、长上下文复核上已有三次 HTTP 200 实际回执，适合实现/测试/审查；
- GPT 席在结构化裁决与条件化批准上有实际回执，适合架构/方案/CI 分析与独立复核；
- 两者都是 advisory input，不是审批门；单次失败不构成永久停席理由；
- 余额/额度未知只影响该次调用，不关闭席位，也不阻断其他任务。

新增调用直接追加行；不覆盖历史行，不改写已有回执。
