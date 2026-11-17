# 中转接入五要素核查（GPT 裁决 §五.11）

裁决要求：中转 GPT 允许在已授权范围接入，但必须明确 **①输入范围 ②裁决权限 ③成本上限 ④失败回退 ⑤审计记录**，且高风险不得由中转自动批准。

## 核查结论

| # | 要素 | 裁决要求 | 当前实现 | 证据 | 状态 |
|---|---|---|---|---|---|
| 1 | 输入范围 | 明确哪些请求可以进站 | 只允许 `long_context_or_batch_only`；短请求禁止；`min_input_tokens=4096`；allowlist 仅 5 个模型（claude-opus-5-5 / claude-opus-5 / claude-sonnet-4-6 / claude-haiku-5-5 / gpt-6.1-sol）；有 `excluded_models` | `config/relay-seat-policy.json:routing` | 已具备 |
| 2 | 裁决权限 | 中转不得自动批准高风险 | 新增 `adjudication_authority`：`relay_may_approve_high_risk=false`；中转输出只算 `advice_only_not_a_ruling`，不得被引用为"GPT 裁决原文"或"owner 授权"；高风险（资金/退款/签名/部署/权限/Secrets/外部不可逆）一律回到 GPT 决策席；禁止自审自批 | 同上字段 | 已具备（本次补齐） |
| 3 | 成本上限 | 必须有上限，不能无界烧钱 | 现有硬上限：余额 < 3 USD 自动关席，未知余额直接拒；**单次/日额上限尚未设定**（`per_call_cost_cap_usd=null`） | `config/relay-seat-policy.json:balance_guard / cost_guard` | **部分缺口**：需 owner 或 GPT 给一个数字 |
| 4 | 失败回退 | 失败要有确定行为 | 新增 `failure_fallback`：代理错误→fail-closed 拒；上游 5xx→记错不重试；429→不自动重试；未知余额→拒；**不回落直连 key、不换站**；且不阻塞其他独立任务 | 同上字段 | 已具备（本次补齐） |
| 5 | 审计记录 | 每笔可追溯 | `knowledge/results/relay-seat/balance-ledger.json` 记每次调用费用；`seat-state.json` 记开/关席；证据里强制记 `official_provider_api=false`、`boundary_exception`、`batch` 标记 | `config/relay-seat-policy.json:balance_guard.ledger_path`、`docs/RELAY-SEAT-PROXY.md` | 已具备 |

回归：`node --test scripts/tests/relay-seat-guard.test.mjs scripts/tests/relay-seat-acceptance.test.mjs` → 24/24 通过。

## 未闭合项

- ③ 成本上限只到"余额地板 3 USD"，没有单次/日额上限。这是唯一还缺的要素，需要 owner 或 GPT 给数字；在此之前按 `cost_guard.cap_status=unset_requires_owner_or_gpt_number` 处理：只允许 allowlist 内模型、每次调用必须记 usage 与费用，不允许批量放飞。
