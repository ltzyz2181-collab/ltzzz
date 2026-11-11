# LTZZZ 中转代理（relay proxy）

席位不再直接持中转商 key。唯一持有 key 的是这个 Worker 的服务端 Secret；席位只拿一个受限的网关令牌。

```
席位(deepseek/claude/gpt) → LTZZZ Worker /v1/chat/completions → APIsRouter → 上游厂商
                          ↑ x-ltzzz-seat-token          ↑ RELAY_STATION_KEY(server secret)
```

## 1. 代理做什么

- `POST /v1/chat/completions`（兼容 `/chat/completions`），其余路由 404，非 POST 405。
- 鉴权：`x-ltzzz-seat-token` 必须等于 Worker Secret `PROXY_ACCESS_TOKEN`，不匹配 401，未配置 token 也一律 401。
- 模型白名单固定五项：`claude-opus-5-5`、`claude-opus-5`、`claude-sonnet-4-6`、`claude-haiku-5-5`、`gpt-6.1-sol`；其余 403 `proxy_model_not_allowlisted`。
- 长上下文闸门：按中文 1 字≈1 token、其他 4 字符≈1 token 估算，低于 4096 直接 400 `proxy_short_request_forbidden`，超过 1.1M 413。
- `stream:true` 拒绝（当前执行器不用流式）；`max_tokens` 非法或超 32768 拒绝。
- 未配置站点 key 时返回 503 `proxy_key_missing`，不会带着空 key 去打上游。
- 上游不可达/超时返回 504 `proxy_upstream_unreachable`。
- 透传上游状态码与正文，并透传 `x-request-id`、`x-oneapi-request-id`、`request-id`、`x-upstream-request-id` 响应头，供验收记录 request ID。
- 不记录、不回显 prompt 正文与 key；错误体只给 code。

## 2. Secrets 与变量

| 名称 | 位置 | 用途 |
|---|---|---|
| `RELAY_STATION_KEY` | Worker Secret（服务端） | 中转商 key，只在 Worker 内注入，不进仓库/前端/PR/邮件/聊天 |
| `PROXY_ACCESS_TOKEN` | Worker Secret（服务端） | 席位访问代理的令牌，当前由 `LTZZZ_AGENT_TOKEN` 注入 |
| `LTZZZ_RELAY_PROXY_URL` | 席位环境变量 | 形如 `https://<worker>.workers.dev/v1`；执行器拼 `/chat/completions` |
| `LTZZZ_RELAY_PROXY_TOKEN` | 席位环境变量 | 与 `PROXY_ACCESS_TOKEN` 同值，放 `x-ltzzz-seat-token` 头 |

`config/relay-seat-policy.json` 的 `access_boundary` 已登记 `proxy_env`、`proxy_token_env`、`proxy_worker`、`proxy_deploy_workflow`，`seat_direct_key_allowed=false`。

## 3. 部署

```bash
# CI（推荐，使用仓库既有 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID）
gh workflow run deploy-relay-proxy.yml
# 或推送 workers/relay-proxy/** 自动触发
```

部署后必须再设两个 Secret，否则代理不可用：

```bash
npx wrangler secret put RELAY_STATION_KEY -c wrangler.relay-proxy.toml   # 在持有 key 的机器上执行
npx wrangler secret put PROXY_ACCESS_TOKEN -c wrangler.relay-proxy.toml
```

`RELAY_STATION_KEY` 只允许在服务端输入，不写入任何仓库文件；这条与 `config/relay-seat-policy.json` 的 `secret_must_not_appear_in` 一致。

## 4. 与验收判据的关系

| 判据 | 代理如何支撑 |
|---|---|
| 真实调用成功 | 响应原样回传，执行器按 200/stop/输出 token/成本判定 |
| GPT 类与 Claude 类区分 | 白名单内两类模型都可走同一代理，证据记 `model_served` 与实际路由 |
| request ID/模型/时间/用量 | 透传 request id 响应头；执行器记录时间与 usage |
| 失败可正确返回 | 401/403/400/413/503/504 均有固定 code，执行器逐条落证据 |
| 不记成业务完成 | 代理只转发模型调用，无业务写入口；执行器写 `effects` 全 false |
| 不碰资金/签名 | Worker 只有模型转发路由，不挂任何钱包、签名、Treasury 绑定 |
| 密钥边界 | key 只在 Worker Secret；席位只见 `key_transport=ltzzz_proxy` |

## 5. 当前状态（2026-11-11）

- 已部署：`https://ltzzz-relay-proxy.ltzyz2181.workers.dev`（`/v1/chat/completions`），由 `deploy-relay-proxy.yml` 经 `CLOUDFLARE_API_TOKEN` 发布。
- 已绑定 `PROXY_ACCESS_TOKEN`（由仓库 Secret `LTZZZ_AGENT_TOKEN` 注入）；无令牌请求返回 401。
- **`RELAY_STATION_KEY` 尚未注入**：此时代理对任何已鉴权调用返回 503 `proxy_key_missing`。原始 key 只在持有它的机器上执行 `wrangler secret put`，不进仓库。
- GitHub Actions 冒烟实测：无令牌 POST 返回 `401 proxy_unauthorized`（run 43029265751），证明网关可达且鉴权生效。
- 云主机对该 workers.dev 域名的 DNS 被污染（解析到无关 IPv6），本机 curl 不通；网关可达性以 GitHub Actions 网络内的冒烟步骤为准（期望 401）。
- 验收判定仍为 `not_accepted`（1 PASS / 5 FAIL / 1 INSUFFICIENT）：两条 guard 拒绝证据来自临时台账 fixture，真实成功调用、双类覆盖、request ID、超时证据仍缺。
- 临时台账 fixture 未触碰真实余额与真实账户；证据内用 `evidence_origin=temp_ledger_fixture_no_real_account_touched` 标注来源。

## 6. 与“原厂 API”的区别

| 维度 | 原厂 API | 本中转 |
|---|---|---|
| 身份 | 厂商签发 key，账单与用量在厂商后台 | 聚合站签发 key，账单在聚合站；上游厂商不认这个 key |
| 模型身份 | 厂商可 attest 实际模型与版本 | 只能看聚合站返回的 `model` 字段，无法独立证明未被降级或替换 |
| 计费 | 厂商 usage 为准 | 聚合站自报 usage，已实测 Claude 返回 `prompt_tokens=0`，只能按估算下限记账 |
| 余额 | 有官方余额/账单接口 | 无可用余额接口（`dashboard/billing` 404，`/api/user/self` 无效），只能推算 |
| 数据 | 直接进厂商 | prompt 先经过聚合站，留存与出境政策由它决定 |
| SLA/限流 | 有官方配额与状态页 | 无 SLA；限流、超时、模型下线由聚合站临时决定 |
| 合规 | 厂商条款 | 多一层转售条款；不能对外宣称是原厂调用 |

因此仓库把 `official_provider_api=false` 写进每条证据，禁止把中转调用伪装成原厂。
