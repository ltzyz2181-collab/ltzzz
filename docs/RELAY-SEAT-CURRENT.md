# 中转席当前生效状态（2026-11-17）

本文件是**唯一当前口径**。历史文件（`knowledge/results/decisions/gpt-ruling-20261113-0855.json`、`knowledge/results/deep-superagent/open-rulings-20261113.json`、`docs/2026-11-13-裁决回读与执行清单.md`）保留原文不改，但其中"APIsRouter 不接入 / 不得调用中转席"的表述**已被后续 owner 授权取代**，不得再作为当前审计的 BLOCKED 依据。

## 一、生效事实

| 项 | 当前状态 | 证据 |
| --- | --- | --- |
| relay 执行席 | gpt / claude 均已启用（`relay_generation_enabled`） | 线上 `/health.relay_seats` |
| relay 传输 | Worker 只持有 scoped proxy token，站 key 不出 relay proxy | `wrangler.deep-superagent.toml` |
| relay 裁决 | 2026-11-17 起接线：`POST /v1/jobs/<task_id>/adjudication`，stage=`relay_adjudication` | `workers/deep-superagent/adjudicator.mjs`、部署回执 `deploy-44009939161-attempt-1.json` |
| 资金族 | 任何 relay 调用**之前**短路为 `needs_decision` 并升级到 gpt 决策席 | `fundShortCircuit()` + 单测 |
| 五签 Safe | 独立成族，升级到 `owner_multisig`，**不进** gpt 决策席，更不经 relay | `escalationTargetFor()` + 单测 |
| 裁决可执行性 | 裁决只出记录：`relay_attested=false`、`execution_authority=false`、不得声明 accepted/deployed/paid | `adjudicationRecord()` + 单测 |
| 失败语义 | provider 错误或 JSON 不合格记为 `undecided`，不重试、不用他席顶替 | 单测 case 9、case 并发/放弃租约 |

## 二、两个接口必须分开引用

`config/relay-seat-policy.json` 的 `adjudication_authority` 把历史口径和新接口分开，审计时不得互换：

| 接口 | 触发方式 | 产出语义 | 高风险处理 |
| --- | --- | --- | --- |
| 历史 advise-only 调用 | `scripts/relay-seat.mjs --call`（generation / acceptance_probe） | `advice_only_not_a_ruling` | 资金/退款/签名/生产部署/权限/Secrets/外部平台不可逆一律转 GPT 决策席 |
| 有界裁决 | Deep Superagent `POST /v1/jobs/<task_id>/adjudication` | `bounded_adjudication_record_not_gpt_ruling` | 资金仍归 GPT 决策席；五签仍归 owner/multisig；relay 不得批准 |

两者的共同底线：relay 输出都不是 GPT 裁决原文，也不是 owner 授权，不得被引用为二者。

## 三、有界裁决的八道安全闸门

| # | 闸门 | 实现 | 验证 |
| --- | --- | --- | --- |
| 1 | 权限口径分离 | `adjudication_authority` 区分 `legacy_advisory_calls` 与 `bounded_adjudication` | `relay-proxy-worker.test.mjs` + 本文件 |
| 2 | 完整预算保护 | relay proxy 的 `RelayBudget` Durable Object 在出站前原子预占，结算实际用量；单次 $0.05、每日 $0.50、项目累计 $10、余额底线 $3；未知余额拒绝 | `relay-proxy-worker.test.mjs` 预算组 |
| 3 | 调用审计 | 裁决记录 `audit`：prompt/completion tokens、estimated/actual cost、latency、balance_after、budget_reservation_id、upstream_http、request_id | `deep-superagent-adjudicator.test.mjs` 审计断言 |
| 4 | 输入隐私 | 只接受 `data_classification=public_distributable`，否则 403，且在预占前与事务内各校验一次 | 单测 `non-public input is refused before any relay egress` |
| 5 | 范围绑定 | `config/relay-adjudication-scopes.json` 注册表；`scope_ref` 必须存在且未过期，每个 `permitted_actions` 必须匹配该范围，且不得落入资金族 | 单测 `scope_ref must exist...` |
| 6 | 高风险分类 | 资金族补齐购买/订购/订阅/续费/充值/手续费等；生产写补齐发布/上线/上架/投产/灰度/切流/推全；五签单独成族 | 单测 `funds family is recognized...` |
| 7 | owner 升级痕迹 | `needs_decision.escalate_to` 只允许 `gpt_decision_seat`；`escalation()` 输出 `gpt_decision_queue`，不含 owner 邮箱、`email_sent=false` | 单测 `routine escalation names...` |
| 8 | 并发幂等 | Durable Object 存储内原子 claim + 180 秒租约；同 id 并发返回 202 `in_progress`；租约过期记 `undecided` 且不重放 | 单测 `concurrent adjudication calls...`、`abandoned claim...` |

预算闸门的账本是**唯一运行时权威**：CLI 席的 `scripts/lib/relay-seat-guard.mjs` 仍是调用前预检，但 Deep Worker 直连路径与 CLI 路径都经过 relay proxy，因此无法绕过每日/项目/底线限制。`--set-balance` 会同时写入本地账本和 proxy 的 `POST /v1/budget/confirm`；proxy 不可达时命令以非零码提示，不会留下两边基线不一致的静默状态。

## 四、授权链

1. owner 2026-11-13：原厂无法充值时 gpt/claude 两席一律走中转（`config/deep-superagent.json` → `relay_ruling.relay_continuity_owner_ruling`）。
2. owner 2026-11-17：除资金、放款这类重要事件外，由中转 GPT 裁决；先做 PR + 测试，绿了再部署，不碰资金（`config/seat-roles-20261116.json` → `OWNER-AUTH-20261117-RELAY-ADJUDICATION`）。
3. 资金裁决权仍在 GPT 决策席（5 签 Safe 除外），不因本次接线改变。
4. 常规内部人工决策进入 GPT 决策队列，不升级成 owner 逐项审批；五签事项只走 owner/multisig。

## 五、审计怎么读

- 读到历史"不接入"记录时：标注 `superseded_by: OWNER-AUTH-20261117-RELAY-ADJUDICATION`，不判 BLOCKED。
- 读到 `decision_authority=false` 的执行席 receipt：这是正确语义，不是缺陷。
- 读到 `relay_attested=false`：这是第三方中转的强制标注，不是缺证据。
- 读到 `decision_authority=bounded_adjudication_owner_delegated_except_funds_and_five_signature`：这是有界裁决记录，不是 GPT 裁决原文。
- 读到 `escalate_to=owner_multisig`：只可能是五签短路的确定性记录，此时 `relay_called=false`、`model_calls=0`。
- 读到 `proxy_budget_sync.ok=false` 或 `relay_budget_unavailable`：预算闸门未确认，按 fail closed 处理。
