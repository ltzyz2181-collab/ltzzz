# 中转站席位策略（APIsRouter 付费泳道）

状态：草案已落码，单测 11 项通过，已 push 到 main；未做 CI 之外的额外部署动作。
策略文件：`config/relay-seat-policy.json`。守卫：`scripts/lib/relay-seat-guard.mjs`。执行器：`scripts/relay-seat.mjs`。

## 一、owner 两条硬口径

1. 余额低于 **3 USD** 自动关席；关席后任何调用一律拒绝，直到 owner 或 GPT 决策席写入一份达到底线的控制台确认余额。
2. 只有 **Claude 四档（opus-5-5 / opus-5 / sonnet-4-6 / haiku-5-5）+ gpt-6.1-sol** 允许走该站，且只接**长上下文**（估算输入 ≥ 4096 token）或**显式批处理**（`batch=true`）。短请求在任何 HTTP 发生之前就被拒。

## 二、余额为什么只能推算

该站没有可用 key 认证的余额接口：`GET /v1/dashboard/billing/subscription` 返回 404，`GET /api/user/self` 返回 `{"message":"无权进行此操作，access token 无效","success":false}`。因此守卫不做"实时查余额"，而是：

```
推算余额 = 最近一次控制台确认余额 − 台账内已记账调用成本
```

台账缺失、基线缺失或余额不可解析时一律 `relay_balance_unverified` 拒绝（fail-closed），不假设账户还有钱。确认余额写入时，上一周期流水折叠进 `prior_periods` 并保留 `recorded_cost_usd`，避免覆盖历史。

## 三、判定顺序与拒绝码

1. `closed` → `relay_seat_closed`
2. 状态不可读（非 `open`）→ `relay_seat_state_unverified`
3. 余额不可解析 → `relay_balance_unverified`
4. 模型不在白名单 → `relay_model_not_allowlisted`
5. 余额 < 3 USD → `relay_balance_below_floor`（`requires_close: true`，执行器立即落盘关席）
6. 非 batch 且估算输入 < 4096 → `relay_short_request_forbidden`

以上任一不过，返回体固定 `sent_http_request: false`，并写 `knowledge/results/relay-seat/refusals/` 证据后 `exit 2`。

## 四、白名单与排除项

白名单（价格照抄 `.secrets-local/apisrouter-pricing.json`，per 1M tokens）：

| 模型 | 输入 | 输出 | 实测延迟 |
| --- | --- | --- | --- |
| claude-opus-5-5 | 3 | 16 | 3.82 s |
| claude-opus-5 | 4 | 20 | 10.36 s |
| claude-sonnet-4-6 | 2.4 | 12 | 12.85 s |
| claude-haiku-5-5 | 0.08 | 0.4 | 18.46 s |
| gpt-6.1-sol | 1.5 | 8 | 13.99 s（一句 ping 计 1446 输入 token） |

排除项取自 `.secrets-local/apisrouter-model-matrix.txt` 的实测：`claude-sonnet-5`、`gpt-5.5`、`gpt-6-astra` 均 35 s 超时；`gpt-5.6-luna` / `gpt-5.6-sol` / `gpt-6-sol` 可用但对一句 ping 计 4387–4389 输入 token，短请求会被隐藏前缀吃掉，因此不进白名单。

## 五、执行器用法

```
node scripts/relay-seat.mjs --state
node scripts/relay-seat.mjs --set-balance --balance 13.00 --confirmed-by owner --basis "console dashboard"
node scripts/relay-seat.mjs --call --prompt-file <file> --model claude-opus-5-5 --requested-agent deepseek [--batch] [--max-tokens 160] [--attempts 2]
```

- 密钥优先级：`APISROUTER_API_KEY` 环境变量 → `.secrets-local/apisrouter-key.txt`；密钥不入证据，只记 `sha256:16` 指纹（按文件原始字节计算，与卡片 `ef66fcd3ab08c92f` 一致）。
- 证据里固定 `executed_by: apisrouter_relay`、`official_provider_api: false`、`station_kind: third_party_aggregator_relay`；`requested_agent` 是请求方席位，不等于执行方。
- 只在**没有收到任何 HTTP 响应**时才重试（最多 3 次）；已经到达站点的请求不复发，避免重复计费。

## 六、计费口径的一个坑

2026-11-11 验收调用里，站方对 Claude 返回 `usage.prompt_tokens = 0`，若照此扣费会把成本算成 0.004032 USD（真实输入约 8.6k token）。守卫因此改为 `billedPromptTokens(上报值, 估算值)`：上报值 > 0 才采信，否则按估算下限计费，并在证据里标注 `usage_source: estimated_floor`。这条已回填到当次台账 entry 的 `cost_correction`。

## 七、当前余额与已知缺口

- 台账基线 13.00 USD（2026-11-11T02:52Z 控制台读取，10 USD 充值 + 3 USD 首充赠送，订单 `ref_39673cd92bcbe5588df333e49e4c`）。
- 推算余额 **12.947201 USD**（扣 0.023 历史探测 + 0.029799 验收调用）。
- 缺口：首次验收尝试以连接级 `fetch failed` 结束（10.6 s，无 HTTP 响应），站方是否计费未知，已在台账 `unrecorded_uncertainty` 记录，上界 0.0298 USD，未从余额中扣。
- 该席位尚未登记进 `config/ai-providers.json`，是独立策略文件 + 独立执行器；接入既有 provider 体系时不要覆盖该文件里的既有登记。
