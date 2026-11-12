# Deep 中转席：原生优先守卫与令牌拆分（2026-11-12）

## 1. 按 GPT 决策席口径落地的四条

| 口径 | 落地方式 | 证据 |
| --- | --- | --- |
| 原生能做的优先原生 | `relayRequested()` + `relay_seat_requires_explicit_request`（409）在派发前失败关闭；planner prompt 明确 native-first 排序 | `workers/deep-superagent/index.js`、`scripts/tests/deep-superagent.test.mjs`（25/25） |
| 中转只做执行席 | `relay_seat_generation_only` 继续拒绝 plan 与 independent_review；复核固定原生 DeepSeek | 单测「relay seat refuses planning and independent review even when enabled」 |
| 令牌拆分 | Deep 只持 `RELAY_PROXY_TOKEN` ← 仓库 secret `RELAY_PROXY_ACCESS_TOKEN`；relay-proxy 的 `PROXY_ACCESS_TOKEN` 同源注入；deploy 缺该 secret 直接 `split_relay_gateway_token_required` | `scripts/deploy-deep-superagent.mjs:202/223`、`.github/workflows/deploy-relay-proxy.yml`、`relay-acceptance.yml`、`deep-superagent.yml` |
| 资金/签名/钱包不交模型 | 未新增任何资金执行路径；中转席 receipt 仍记 `decision_authority=false`、`financial_execution=false` | 回执字段与既有验收文档 |

补充：`claude-haiku-5-5` 站点 503，配置标为不可用；`claude-sonnet-4-6` 为当前候选，relay-acceptance 默认候选已去掉 haiku。

## 2. 部署与真实调用

- 仓库 secret `RELAY_PROXY_ACCESS_TOKEN` 已写入（`put_status=201`，`has_secret=True`），明文未落任何输出。
- `Deploy LTZZZ relay proxy` run `43179948871`（head `7a465c49f`）：success，`PROXY_ACCESS_TOKEN` 已换成新网关令牌。
- `Deep Superagent isolated deployment` run `43180083749`（head `1f69ca362`）：success，Deep 侧 `RELAY_PROXY_TOKEN` 已写入新令牌。
- 真实中转复跑：探针卡 `DEEP-RELAY-PROBE-20261112-02`，queue run `43180300883`，回执 `knowledge/results/deep-superagent/queue-43180300883-attempt-1.json`。

三段回执：

| 阶段 | 席 | 实际路由 | 模型 | upstream | request_id | tokens |
| --- | --- | --- | --- | --- | --- | --- |
| plan | deepseek | 原生 | deepseek-v4-pro | 200 | `2ddc45fa-7d77-465a-a5ad-b7a7d2c995c6` | 921 |
| work_gpt | gpt | `apisrouter_relay` | gpt-6.1-sol | 200 | `resp_0ef6b2e4b0670ee8016af573b6ad3087d08f927ec9d92f7fa6` | 7957 |
| independent_review | deepseek | 原生 | deepseek-v4-pro | 200 | `5337b40b-6305-4da2-a9db-d4aff65c2e6a` | 1389 |

结论：令牌拆分后 Deep→relay 仍可正常执行（upstream 200 且回执齐全），原生席位与独立复核未受影响。该 job 最终 `needs_gpt_decision`，因为复核把「不能声称部署/验收」列为待裁决口径，属预期行为。

## 3. 仍不自动化的部分

资金、签名、钱包、Safe、放款、生产写继续不进入任何模型执行器；评审、技能迭代、资金三类自动化部署仍需 GPT 裁决后执行。
