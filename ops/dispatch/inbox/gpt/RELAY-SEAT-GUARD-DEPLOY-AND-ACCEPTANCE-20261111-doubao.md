# 中转站席位 3 USD 熔断 + 长上下文白名单：落码、部署、验收回执

- 执行席位：豆包（本卡不含任何凭据）
- 时间：2026-11-11（部署提交与验收调用均在当日）
- 关联：`ops/dispatch/inbox/gpt/APISROUTER-TOPUP-KEY-HANDOFF-20261110.md`、`docs/RELAY-SEAT-POLICY.md`

## 一、owner 口径落码情况

| owner 要求 | 落码位置 | 验证 |
| --- | --- | --- |
| 余额低于 3 USD 自动关席 | `config/relay-seat-policy.json`（`balance_guard.floor_usd=3`、`on_below_floor=close_seat`）、`evaluateRelayCall` 的 `relay_balance_below_floor`（`requires_close:true`）、执行器调用后跌破即关席 | 单测「balance below the 3 USD floor requests a close, and the close persists」 |
| 关席后任何调用一律拒绝 | `relay_seat_closed` 判定 + `seatStatus !== 'open'` 也拒绝（`relay_seat_state_unverified`） | 单测「closed and unreadable seat states fail closed」 |
| 只允许 Claude 四档 + gpt-6.1-sol | `routing.allowlist`（5 条，含价格与实测延迟）；`relay_model_not_allowlisted` | 单测白名单/黑名单双向断言 |
| 只接长上下文 / 批处理，禁短请求 | `min_input_tokens=4096`；`relay_short_request_forbidden`；`batch=true` 需显式声明并留痕 | 单测 4096/4095 边界与 batch 例外；真实调用前先用 `ping` 验证被拒 |

## 二、部署

- 仓库 `ltzyz2181-collab/ltzzz`，main `3bae6381`（`cf847e48..3bae6381`，由云主机 push）。
- 回读核对：`gh api .../commits/main` 与 `raw.githubusercontent.com/.../seat-state.json` 均返回 `3bae6381` 的内容。
- 新增文件：`config/relay-seat-policy.json`、`scripts/lib/relay-seat-guard.mjs`、`scripts/relay-seat.mjs`、`scripts/tests/relay-seat-guard.test.mjs`、`docs/RELAY-SEAT-POLICY.md`、`knowledge/results/relay-seat/{balance-ledger.json,seat-state.json}`。
- 未改动 `config/ai-providers.json`、`config/deep-superagent.json`、`config/workpool.json`。
- 单测：`node --test scripts/tests/relay-seat-guard.test.mjs` → 11 pass / 0 fail（桌面机与云主机各一次）。

## 三、Deep 席位真实调用验收

- 短请求拦截：prompt `ping`（估算 2 token）→ `relay_short_request_forbidden`，`sent_http_request=false`，证据 `knowledge/results/relay-seat/refusals/20261111T094914Z-deepseek.json`。
- 长上下文放行：`claude-opus-5-5`，输入 13192 字符 / 估算 8589 token（仓库公开文档拼装），`max_tokens=160`；HTTP 200、`finish_reason=stop`、输出 252 token、25.9 s。
- 证据 `knowledge/results/relay-seat/calls/20261111T095051Z-deepseek-claude-opus-5-5-25747c26.json`：`requested_agent=deepseek`、`executed_by=apisrouter_relay`、`official_provider_api=false`、`key_fingerprint=sha256:16=ef66fcd3ab08c92f`。

## 四、计费口径修正（重要）

站方对 Claude 调用返回 `usage.prompt_tokens=0`。若照上报值扣费，当次只计 0.004032 USD。现已改为 `billedPromptTokens(上报, 估算)`：上报值 > 0 才采信，否则按估算下限；该条台账 entry 已由 0.004032 修正为 0.029799，并保留 `cost_correction` 说明与单测锚点。

## 五、余额与席位

- 基线 13.00 USD（`2026-11-11T02:52Z` 控制台读取；10 充值 + 3 首充赠送，订单 `ref_39673cd92bcbe5588df333e49e4c`）。
- 推算余额 **12.947201 USD**；floor 3；状态 `open`。
- 该站无 key 认证余额接口，余额只能人工从控制台读取写入，属设计边界。

## 六、交付与遗留

- 邮件已发 GPT 收件箱：`ltzyz2181@gmail.com`，`message_id=msg_pvcFo7uVzLAWkJApYGqvHIuO1A09akmNNGtdEaL726Phfg`，`created_at=2026-11-11T09:57:46Z`，发件 `qingqizhu6502@agent.qq.com`，已从 sent 目录回读确认。
- 遗留 1：首次验收尝试连接级 `fetch failed`（10.6 s 无响应），是否计费未知，台账 `unrecorded_uncertainty` 记上界 0.0298 USD，未扣减。
- 遗留 2：席位尚未登记进 `config/ai-providers.json`，待 GPT 决策席裁决是否并入既有 provider 体系。
- 遗留 3：桌面机 `github.com` 不可达，桌面本地仓库停留在旧提交 `b7981fd0`（基于 `6d3430b1`），内容与远端一致但 git 历史落后；后续同步需在云主机侧 fetch/rebase 或重新 clone。
- 遗留 4：本次验收的 `calls/`、`refusals/` 证据文件只存在于桌面机，未随本次 push 上传（避免凭记忆重写证据）。
