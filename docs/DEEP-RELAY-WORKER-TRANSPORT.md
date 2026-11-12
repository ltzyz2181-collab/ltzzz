# Deep 执行席经 LTZZZ Worker 转发（v2 传输层）

## 1. 为什么改

v1 的 `callRelaySeat` 用 `RELAY_API_KEY` 直连 `api.apisrouter.com`，等于让 Deep Worker 自己持有中转商 key，和「席位只调 LTZZZ Worker、key 只在服务端 Secret」的边界冲突。v2 把传输层改成：

```
Deep Worker(仅持 RELAY_PROXY_TOKEN) → LTZZZ relay proxy /v1/chat/completions
                                     → APIsRouter（RELAY_STATION_KEY 只在此 Worker）
                                     → 上游厂商
```

## 2. 启用条件（全部满足才 enabled，任一不满足各自 fail closed）

| 顺序 | 条件 | 不满足时的状态 |
|---|---|---|
| 1 | 不是 relay 席 | `not_a_relay_seat` |
| 2 | `RELAY_API_KEY` 不存在（直连 key 属于越界） | `relay_direct_station_key_forbidden` |
| 3 | `RELAY_PROXY_TOKEN` 存在 | `relay_proxy_token_missing` |
| 4 | `RELAY_ACCEPTANCE_VERIFIED === '1'` | `relay_acceptance_pending` |
| 5 | `RELAY_PROXY_URL` 可解析、https、host 为 `ltzzz-relay-proxy.ltzyz2181.workers.dev`、路径为 `/v1`、无 query/hash | `relay_proxy_url_invalid` / `relay_proxy_host_not_allowlisted` / `relay_proxy_path_not_allowlisted` / `relay_proxy_url_not_allowlisted` |
| 6 | `RELAY_MODEL_GPT` / `RELAY_MODEL_CLAUDE` 有值 | `relay_model_not_configured` |

## 3. 调用约束

- 席位角色不变：relay 席只能 `work_<seat>`，不能做 planner、不能做独立复核；receipt 里 `decision_authority=false`。
- 请求头用 `x-ltzzz-seat-token`，不带 `Authorization`，因此 Deep Worker 侧没有站点 key。
- 每个 relay 调用显式声明 `x-ltzzz-batch: 1`：Deep 派的是批处理条目，不是交互短问。代理只对声明批处理的请求放宽最小输入闸门（4096 token），上下文上限 1.1M、`max_tokens` ≤32768 仍照旧生效；未声明的短请求继续 400 `proxy_short_request_forbidden`。
- receipt 新增 `relay_transport=ltzzz_proxy_seat_token`、`batch_declared=true`；`relay_host` 记的是 LTZZZ Worker 主机名，`official_provider_attestation=false`、`native_provider=false`，避免被误读成原厂调用。

## 4. 默认模型档

| 席位 | 变量 | 默认值 | 依据 |
|---|---|---|---|
| gpt | `RELAY_MODEL_GPT` | `gpt-6.1-sol` | 2026-11-12 实调 200/stop |
| claude | `RELAY_MODEL_CLAUDE` | `claude-sonnet-4-6` | haiku 站点侧 503，sonnet 实调 200/stop |

白名单仍是五项，换档只改 Cloudflare 上的变量值，不需要改代码。

## 5. 部署与验证

- 代理与 Deep Worker 都由既有的 workflow 部署：`deploy-relay-proxy.yml`（`workers/relay-proxy/**` 变更即触发）与 `deep-superagent.yml`（`workers/deep-superagent/**` 变更即触发）。
- Deep Worker 的 `RELAY_PROXY_TOKEN` 由部署脚本从 `LTZZZ_AGENT_TOKEN` 注入（`secret bulk`），不落盘、不回显。
- 验证看三处：`/health` 与 `/v1/status` 的 `relay_seats` 应为 `relay_generation_enabled`；一次真实 `work_gpt` 回执应有 request id 与 usage；代理侧 401 冒烟（无令牌）仍应通过。

## 6. 未改变的红线

资金、签名、钱包、Safe、放款、生产写仍在模型执行器之外；评审与独立复核仍要 ≥2 家原生 provider，中转调用不进该映射；技能迭代仍需 owner 建 Issue 触发；评审、技能迭代、资金三类自动化部署仍需 GPT 网页版裁决后执行。
