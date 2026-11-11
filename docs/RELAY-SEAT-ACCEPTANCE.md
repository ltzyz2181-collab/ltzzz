# 中转站验收标准（可执行版）

本文件把 owner 2026-11-11 的修正裁决落成机器可判定的验收口径。规格文件：`config/relay-seat-acceptance.json`。判定器：`scripts/lib/relay-seat-acceptance.mjs` + `scripts/relay-seat-acceptance.mjs`。

## 一、裁决口径（写死在策略里）

- 原厂 API 不是 GPT/Claude 执行席启用的必要条件；中转接口验收通过即可使用。
- GPT 决策席仍由 owner 通过 Codex、网页等承担，不需要原厂 API。
- GPT 执行席、Claude 执行席在验收通过后可生成执行席内容；Deep 拆单可用中转模型生成长文、对账草稿、异源复核文案；会员与文档任务可用中转模型辅助。
- Treasury、放款、资金操作、钱包、签名、Safe **不接入模型执行器**。
- 模型输出只能作为执行席产物；资金、签名、权限与生产部署仍由独立授权机制控制。

密钥边界（`config/relay-seat-policy.json` 的 `access_boundary`）：

- key 只存 LTZZZ 服务端 Secret，不进仓库、前端、PR、邮件、聊天窗口。
- 席位不直接持有中转商 key：执行器默认走 `LTZZZ_RELAY_PROXY_URL` 指向的 LTZZZ 代理/Worker。
- 单机调试确需直连时，必须显式 `--direct-key`，证据里会记 `key_transport=direct_station_key_dev_exception` 与 `boundary_exception=true`，不允许静默使用。
- 不再为打通原厂 GPT/Claude API 额外充值；原厂账务未通不是模型执行链的阻断条件。

## 二、通过验收的七项条件

| 判据 | 含义 | 判定方式 |
| --- | --- | --- |
| `real_call_success` | 真实调用成功并取得有效响应 | 证据里存在 HTTP 200、`finish_reason=stop`、输出 token > 0、成本 > 0 的调用 |
| `class_routing_verified` | 能区分 GPT 类与 Claude 类调用与实际路由 | 成功证据中 `claude` 与 `gpt` 两类各至少 1 次，模型取响应里的 `model` 字段而非请求体 |
| `request_identity_recorded` | 有真实 request id、模型名、时间、用量 | 每条成功证据要有 `request_id`（响应头或 body id）、`model_served`、时间戳、计费 token、耗时 |
| `failure_modes_verified` | 失败、余额不足、超时能正确返回 | 三类证据齐备：短请求在发 HTTP 前被拒、余额/floor 关席或站方余额不足响应、超时或网络失败 |
| `not_counted_as_business_task` | 不把模型调用误记成业务任务完成 | 每条成功证据 `effects.business_task_completed=false`、`authority_effect=none` |
| `no_funds_signature_production` | 不触发资金、签名或生产写操作 | 每条成功证据 `funds_or_signature_surface=false`、`production_write=false` |
| `key_boundary_respected` | 证据里没有密钥，且标注密钥通道 | 全文无 `sk-...` 形态；`key_transport` 已标注；调用证据 `official_provider_api=false` |

明确不算通过依据：仅 HTTP 200、请求体里回显的模型名、目录列表、其他席位的口头声明（无本地证据文件）。

## 三、判定语义与退出码

运行 `node scripts/relay-seat-acceptance.mjs`：

- 逐条输出 `PASS / FAIL / INSUFFICIENT`，任何一条 `FAIL` → 整体 `not_accepted`（退出码 5）；没有 `FAIL` 但有 `INSUFFICIENT` → `insufficient_evidence`（退出码 4）；全部 `PASS` → `accepted`（退出码 0）。
- 默认把结论写入 `knowledge/results/relay-seat/acceptance-verdict.json`，执行器读这个文件做生成闸门；`--no-write` 只打印不改状态。
- 证据目录为空不是"待定"，直接 7 条全 FAIL，不允许空数据白拿通过。

## 四、生成闸门

`scripts/relay-seat.mjs --call` 有两个用途：

- `--purpose acceptance_probe`（缺省之外的显式值）：允许在验收未通过时跑探测调用，证据标 `generation_output: false`。
- `--purpose generation`（默认）：必须先存在 `acceptance-verdict.json` 且 `verdict=accepted`，否则在发出 HTTP 之前以 `relay_acceptance_not_passed` 拒绝并落拒绝证据。

这样"验收探测"和"执行席产出"在证据层就分开了，不会用探测调用冒充执行席产能。

## 五、当前状态（不是结论口号）

- 本机（云主机）没有任何 `calls/`、`refusals/` 证据，判定为 `not_accepted`，7 条全 FAIL；这是正确结果，不是脚本坏。
- 桌面机的历史证据：有 1 条成功调用、1 条短请求拒绝、1 次网络失败。按新标准它仍**不够**：缺 `request_id`、缺 GPT 类成功调用、缺"余额不足/关席"证据、缺 `effects` 字段。旧邮件里"验收通过"的结论按新标准作废。
- 生成闸门已生效：在 `accepted` 落地之前，`--purpose generation` 一律被拒。

## 六、要补齐的四件事

1. 建 LTZZZ 代理/Worker（服务端注入中转 key），把 `LTZZZ_RELAY_PROXY_URL` 配到执行环境；否则只能用 `--direct-key` 调试，证据会标记边界例外。
2. 补一次 GPT 类长上下文调用（`gpt-6.1-sol`），让 `class_routing_verified` 成立。
3. 补"余额不足/关席"证据：可用临时台账把推算余额压到 floor 以下触发 `relay_balance_below_floor`，或用站方返回的余额不足错误。
4. 在桌面机重跑一次带 `--purpose acceptance_probe` 的验收调用，产生含 `request_id`、`model_served`、`effects` 的新证据，再回传仓库。
