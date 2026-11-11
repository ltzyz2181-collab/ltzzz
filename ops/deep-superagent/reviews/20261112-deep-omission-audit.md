# Deep 邮件与回执缺口审计 2026-11-12

审计口径：只读仓库与邮箱，不回复、不改 Linear 状态。所有结论带文件或 run id。

## 一、Deep 读取/回复邮件做了什么

| 面 | 实测 | 证据 |
|---|---|---|
| 采集 | 每日只跑 backlog 采集，输出脱敏状态与短标题 | `knowledge/results/deep-superagent/mail-backlog/latest.json`（37 封、14 open、23 unknown，sha256 `7639dd6b…`） |
| 读正文 | 无记录；采集脚本明确 `contains_mail_body=false`，无 read 标记 | 同上 |
| 回复 | 自 2026-11-08 后无 Deep 发信留痕；最后一组回复是 11-08 的 rollup 三封 | `knowledge/results/deep-superagent/mail-deployment-closeout-20261108.json`、`ops/dispatch/inbox/doubao/ROLLUP-DISPOSITION-20261108.json` |
| 自动唤醒 | 未验证 | `config/deep-superagent.json` → `mail_bridge.status=new_mail_dispatch_chain_pending`、`automatic_gpt_email_wake_verified=false` |

结论：Deep 目前只做“邮件待办采集 + 本地判状态”，**没有逐封读正文、也没有回复**；对外回复实际由执行席代发。

## 二、仓库观测与派单回执缺口

| 缺口 | 实测 | 应有去处 |
|---|---|---|
| `status.json` 停在 11-08 | `updated_at_utc=2026-11-08T06:22:33Z`，最后提交 `8f8dd3b70`（11-08） | 应吸收 11-09～11-12 的回执 |
| 11-11 原生执行回执未入册 | `claude` 目录 200、生成 400 `credit balance is too low`；`gpt` 目录 200、生成 429 `billing_not_active`；run `42950528406`，key 均在 | 应写入 `status.reserved_native_APIs` 与 config 复测条件 |
| wep3 原始状态回执未对齐 | `results/wep3-reconcile-2026-11-11.json`：`ok=true`、`entries_today=0`、`credit_sum=12.874026`、`causal_receipts=31`；而 `knowledge/results/wep3/latest.json` 仍停在 2026-11-02 的 `41373998174` | 两个面需在 Deep 回执里区分“原始状态”与“最新快照” |
| 中转验收未入册 | `knowledge/results/relay-seat/acceptance-verdict.json` = `not_accepted`（1 PASS/5 FAIL/1 INSUFFICIENT） | 应进 `status.json` 的席位段 |
| 11-12 三轮回执未汇总 | `queue-43114926487`（invalid_deepseek_task）、`queue-43115331756`（kimi 失败）、`queue-43115837048`（qianwen ref 错位） | 应进每日回执并驱动次日拆批 |

## 三、Linear 面

- `LTZ-5`、`LTZ-7`、`LTZ-8`、`LTZ-10` 均为 In Progress，最后更新 2026-11-11 20:03–20:05；`LTZ-6` Done。
- 仓库有 `ops/dispatch/inbox/gpt/linear-board-latest.json`（11-11 18:27）与 `linear-readback-from-doubao-20261108.json`。
- 但 `config/deep-superagent.json` 的 `latest_linear_cross_client_handoff.consumer_native_access_verified=false`，Deep 没有输出过 Linear 与仓库状态的逐项对照回执。

## 四、结论

5 类缺口：邮件逐封未判、回复留痕缺失、status/config 回执未回填、wep3 原始状态与最新快照未区分、Linear 无对照回执。已写入 `DEEP-SUPERAGENT-20261112-AUDIT-1` 派给 Deep。

## 五、派单与回执（2026-11-12 当日实测）

| 卡 | run | 结果 | 席位回执 |
|---|---|---|---|
| `DEEP-SUPERAGENT-20261112-AUDIT-1` | `43120602908` | `needs_gpt_decision` | 规划 deepseek 正常；`qianwen` 4 项回填计划合规；`kimi` 4 项对照合规（含 `LTZ-5/7/8/10` 与仓库无关联证据、PR #287 待裁）；`doubao` 全部输出占位 ref（`M[object Object]1 undefined`），整批作废 |
| `DEEP-SUPERAGENT-20261112-AUDIT-2`（邮件前排重派，真实 14 条 ref） | `43120925546` | `blocked` / `native_generation_evidence_incomplete` | `model_calls=2`、`outputs=[]`，未判 |

邮件未读面：37 封中 21 封未读（`open` 14 封里 9 封未读、`unknown` 23 封里 12 封未读）。已读不等于已处理，仓库无逐封 read/reply 回执。

结论：回执回填与 Linear 对照两块已由 qianwen/kimi 出可复核草案；邮件逐封分流两块（AUDIT-1 的 doubao、AUDIT-2）均未产出可用判定，按纪律记为未判，次日拆小批重派，不以其他席位结果顶替。
