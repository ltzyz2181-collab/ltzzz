# 裁决回执跟踪（2026-11-17 起，每日必跑）

## 为什么要这一步

2026-11-17 那一轮暴露出一个真实的误判：GPT 已在 2026-11-16 19:51Z / 19:54Z 回复了 Phase1 六项安全裁决（`return_for_revision` + 补丁级补充禁令），另外 10:45Z、10:47Z、11:05Z 三批也给出了席位定位与 Wallet 两案的 `conditional_approve`。但 `collect-mail-backlog.mjs` 只按 subject+snippet 打状态标签，把 GPT 的回信统一归为 `unknown`（`read=false`），日回执又只读 `status` 字段，于是当天把 6 条**已经裁决完成**的事项写成「待 GPT 裁决」，等于对已答复的问题再次发问。

结论：**「有没有裁决」「裁决到没到」必须单独成账，不能从邮件状态标签里猜。**

## 每天怎么做

在「一、采集」之后、写日回执之前跑：

```bash
node scripts/track-gpt-rulings.mjs --limit 50 --window-days 14 --write
```

产出 `knowledge/results/deep-superagent/ruling-tracker/latest.json`，字段口径：

| 字段 | 含义 |
| --- | --- |
| `counts.answered` | 有回信且回信晚于最后一次发问的线程数 |
| `counts.pending_no_reply` | 发问了但没有回信的线程数 |
| `counts.answered_but_unread` | 有回信但正文没被读过的线程数，**当日必须消费** |
| `counts.pending_over_24h` | 超过 24 小时没回信的线程数 |
| `consume_gate` | 48 小时内到达但未读的裁决，逐条列出 |
| `items[].status` | `answered` / `pending_no_reply` / `answered_before_last_ask` |

配对规则：回信优先按 `in_reply_to` 挂到被回复的那封发件；挂不上就按主题归一（去掉 `Re:`/`Fwd:` 与 `[标签]`）配对。裁决席固定为 `ltzyz2181@gmail.com`。

## 写进日回执

`daily-<YYYY-MM-DD>.json` 必带 `ruling_tracker` 段：

```json
"ruling_tracker": {"path": ".../ruling-tracker/latest.json", "generated_at": "...",
                   "counts": {...}, "pending_over_24h": 20, "note": "..."}
```

路由复核必须按这个账本重判，不许沿用 `status=unknown`：

- 线程已有回信 → 不得再写 `needs_gpt_decision`；改写 `decided_pending_execution` 并带 `decision_id` + 回信 `message_id`。
- 回信到了但没读 → 先 `message +read` 读正文，再判定；未读就下判断视为未核实。
- 超过 24 小时没回信 → 保留在待裁决里，但必须在每日邮件**顶部**提醒，不得每天原样重发长文。

## 写进每日邮件

在四段之前加一行「裁决回执跟踪」：

```
裁决回执跟踪：在途 59 线程，已回 38，未回 21，其中超 24h 未回 20；48h 内到达但未读 0。
```

超过 24h 未回的线程按等待时长从长到短列前 5 条（线程名 + 等待小时数），不做全文重发。

## 纪律

- 本脚本只做证据核对，不改邮件状态、不代签、不代表已读即已执行。
- 回信内容不等于批准落地：`return_for_revision` 要按阻断项修代码，`conditional_approve` 要按边界提独立 PR，都不得写成「已完成」。
- 跟踪结果进仓库时只放线程名、时间、状态与 message_id，不落邮件正文、金额与凭据。
