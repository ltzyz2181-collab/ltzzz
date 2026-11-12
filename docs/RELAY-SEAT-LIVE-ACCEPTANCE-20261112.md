# 中转执行席实测回执（2026-11-12）

## 1. 本轮做了什么

| 步骤 | 结果 | 证据 |
|---|---|---|
| 桌面机用 wrangler 从本地 key 文件经 stdin 注入 Worker Secret `RELAY_STATION_KEY` | 成功，`Success! Uploaded secret RELAY_STATION_KEY`，exit=0，key 值未打印、未进仓库 | 桌面临时配置 `relay-deploy/wrangler.relay-proxy.toml`（不含 key） |
| 真实调用走到 Worker → APIsRouter → 上游 | GPT 类与 Claude 类各 1 次成功 | 下方 4 份 calls 证据 |
| 侧载 CI 验收工作流 | `.github/workflows/relay-acceptance.yml`，由 GitHub 连接器写入（本机 OAuth 无 workflow scope） | run 43134888196、43135084006（后者 success） |
| 台账与状态 | 真实调用成本回写台账，席位余额由 12.947201 更新为 12.930531 | `knowledge/results/relay-seat/balance-ledger.json`、`seat-state.json` |
| 验收判定 | `node scripts/relay-seat-acceptance.mjs` → `accepted`（7 PASS / 0 FAIL / 0 INSUFFICIENT） | `knowledge/results/relay-seat/acceptance-verdict.json` |

## 2. 真实调用证据

| 模型 | HTTP | finish_reason | request id | 成本 USD | 结果 |
|---|---|---|---|---|---|
| `gpt-6.1-sol` | 200 | stop | `2026111201314465120053Xz9IiLBs` | 0.011234 | 成功（6465 输入 / 64 输出） |
| `claude-haiku-5-5` | 503 | null | `2026111201315542947903392c90xCK` | 未计费 | 站点回 `The requested model is temporarily unavailable` |
| `claude-sonnet-4-6` | 200 | stop | `20261112013157352034001coZaO3zg` | 0.005436 | 成功（6465 输入 / 64 输出） |
| `gpt-6.1-sol`（网络失败探针） | 无响应 | null | null | 未计费 | `failure.code=ENOTFOUND`，未记成成功 |

证据文件：`knowledge/results/relay-seat/calls/20261112T0131*.json`。
两类调用均 `key_transport=ltzzz_proxy`、`official_provider_api=false`、`effects` 四项全 false。

## 3. 边界与未覆盖项（不得被“accepted”掩盖）

- 密钥边界：key 只在 Worker Secret；本轮未把 key 写入仓库、前端、PR、邮件或聊天窗口，未新增 `RELAY_STATION_KEY` GitHub Secret，因此 CI 触发 deploy 时不会覆盖它（工作流仅在 secret 存在时注入）。
- 网关令牌：`PROXY_ACCESS_TOKEN` 仍由 CI 从 `LTZZZ_AGENT_TOKEN` 注入，本轮不轮换、不落地到任何机器。
- 超时类证据：验收里的 `timeout_or_network_failure` 由一次 DNS 级不可达探针（`relay-proxy-unreachable.invalid`）提供，证明执行器在网络失败时不记成功、不重放已到达站点的请求；Worker 侧 504 `proxy_upstream_unreachable` 只有代码路径，未真实触发。
- 模型可用性：`claude-haiku-5-5` 当前在站点侧不可用（503），Claude 类成功调用实际落在 `claude-sonnet-4-6`；四档白名单未变。
- Deep Worker 自身的 `relay_generation_seats` 仍为关闭：其 `callRelaySeat` 直接以 `RELAY_API_KEY` 调 `api.apisrouter.com`，未走 LTZZZ Worker。改成走 Worker 需要改 `workers/deep-superagent/index.js` 的传输层、host 白名单与单测，本轮未做；因此 Deep 席位仍 `closed_until_credential_and_acceptance`，不得宣称已启用。
- 资金、签名、钱包、Safe、放款、生产写：未触碰。余额熔断仍只做定期 `set-balance` 估算，未实现自动止损。

## 4. 成本与余额

- 本轮真实支出：0.011234 + 0.005436 = 0.016670 USD。
- 席位余额：12.947201 → 12.930531 USD，距 $3 下限仍有 9.930531 USD。
- 失败调用（503、ENOTFOUND）未见计费；若站点事后补扣，属未记录不确定性，下一次 `set-balance` 以控制台余额为准覆盖。

## 5. 后续更新（同日，v2 传输层）

上文第 3 节「Deep Worker 自身仍为关闭」这条，已在获得 owner 授权后改掉：Deep 的 `relay_generation_seats` 已改为只持 `RELAY_PROXY_TOKEN`、经 `x-ltzzz-seat-token` 调 LTZZZ Worker，不再需要 `RELAY_API_KEY`；直接配置站点 key 会被判 `relay_direct_station_key_forbidden`。详见 `docs/DEEP-RELAY-WORKER-TRANSPORT.md`，历史结论保留不改。
