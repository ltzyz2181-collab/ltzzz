# 中转席当前生效状态（2026-11-17）

本文件是**唯一当前口径**。历史文件（`knowledge/results/decisions/gpt-ruling-20261113-0855.json`、`knowledge/results/deep-superagent/open-rulings-20261113.json`、`docs/2026-11-13-裁决回读与执行清单.md`）保留原文不改，但其中"APIsRouter 不接入 / 不得调用中转席"的表述**已被后续 owner 授权取代**，不得再作为当前审计的 BLOCKED 依据。

## 一、生效事实

| 项 | 当前状态 | 证据 |
| --- | --- | --- |
| relay 执行席 | gpt / claude 均已启用（`relay_generation_enabled`） | 线上 `/health.relay_seats` |
| relay 传输 | Worker 只持有 scoped proxy token，站 key 不出 relay proxy | `wrangler.deep-superagent.toml` |
| relay 裁决 | 2026-11-17 起接线：`POST /v1/jobs/<task_id>/adjudication`，stage=`relay_adjudication` | `workers/deep-superagent/adjudicator.mjs`、部署回执 `deploy-44009939161-attempt-1.json` |
| 资金族 | 任何 relay 调用**之前**短路为 `needs_decision` 并升级到 gpt 决策席 | `fundShortCircuit()` + 单测 |
| 裁决可执行性 | 裁决只出记录：`relay_attested=false`、`execution_authority=false`、不得声明 accepted/deployed/paid | `adjudicationRecord()` + 单测 |
| 失败语义 | provider 错误或 JSON 不合格记为 `undecided`，不重试、不用他席顶替 | 单测 case 9 |

## 二、授权链

1. owner 2026-11-13：原厂无法充值时 gpt/claude 两席一律走中转（`config/deep-superagent.json` → `relay_ruling.relay_continuity_owner_ruling`）。
2. owner 2026-11-17：除资金、放款这类重要事件外，由中转 GPT 裁决；先做 PR + 测试，绿了再部署，不碰资金（`config/seat-roles-20261116.json` → `OWNER-AUTH-20261117-RELAY-ADJUDICATION`）。
3. 资金裁决权仍在 GPT 决策席（5 签 Safe 除外），不因本次接线改变。

## 三、审计怎么读

- 读到历史"不接入"记录时：标注 `superseded_by: OWNER-AUTH-20261117-RELAY-ADJUDICATION`，不判 BLOCKED。
- 读到 `decision_authority=false` 的执行席 receipt：这是正确语义，不是缺陷。
- 读到 `relay_attested=false`：这是第三方中转的强制标注，不是缺证据。
