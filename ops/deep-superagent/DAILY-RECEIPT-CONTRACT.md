# Deep 每日巡检回执契约（2026-11-11 起）

本文件定义「Deep 每日接管巡检」每天必须产出的四段结构。任何一天的每日回执缺任一段，视为该日回执不完整，不得计为已交接。

## 为什么要有这四段

此前的每日回执只写「今天判了什么、谁要裁决」，读完仍不知道整体推进到哪一步。owner 明确要求补齐推进视图：**已完成的、待裁决的、马上要做的、后面要做的**，四者分开，不能混在一条时间线里叙述。

## 四段定义

### 第一段：已完成（done）

只写**本轮或近期已经闭环**的事项，每条必须带可核验的落地证据：commit、run id、回执路径、或状态字段的前后值。

禁止把「已判定」写成「已完成」。判定只是分流，不等于收尾。`coordinator_close_with_receipt` 只有在回执真的补写并推送后才进这一段。

### 第二段：待裁决（awaiting_decision）

区分两个裁决席位，不得混列：

- `needs_gpt_decision` —— 需要 GPT 决策席给口径的
- `needs_owner_decision` —— 只能由 owner 本人决定的（支付、资金、账号注册、多签、生物人实名）

每条写清：卡在哪、不给裁决会有什么后果、Deep 能否先做一部分而不越权。

### 受控 route 词表（2026-11-21 扩充）

固定集合新增 `execute_authorized`：**已有 Owner 或 GPT 书面授权**、且不涉及五类保留动作（资金、退款终态、签名、私钥/助记词/根密钥、钱包操作）的事项，直接执行，并在回执里写出授权来源（decision_id 或授权评论链接）。

- 它不是新的裁决席：只有真实资金动作、退款终态、签名、私钥/助记词/根密钥、钱包操作这五类必须先命中 `needs_gpt_decision`；普通工作流、配置、凭据配置/轮换与标准部署按既有门禁自动执行，Secret 值仍不得打印、提交或写入日志。
- 它不能替代验收：执行后仍按原卡要求交 PR、测试与回执，不得写成已完成。
### Issue 派单桥（2026-11-21 起）

Issue 驱动的任务此前没有卡，队列 attempts 恒为 0。现在只有一种入口：

1. Issue 打上 `deep:task` 标签（或手动 `workflow_dispatch` 指定编号）；
2. `scripts/dispatch-issue-card.mjs` 生成 `DEEP-SUPERAGENT-<日期>-ISSUE-<编号>.json`；
3. 工作流按每日卡同一条受信路径提交到 main，并显式派发队列；
4. 结果（含被拦原因）回写到该 Issue 评论。

四条硬闸，任一不过就不落卡：本仓 Issue、必须 open、必须带标签、正文不得含疑似凭据；
命中六个保留家族的 Issue 直接 `blocked_fiduciary`，不自动执行。
卡目录仍然 append-only：同名卡不覆盖，重试必须用 `-R1..R9` 新文件。

### 第三段：下一步马上做（next_immediate）

本席或 Deep 在**下一个工作日窗口内**就能自行推进、不需要等裁决的动作。每条要可执行、有明确完成判据。

这一段是自证「Deep 真的在干活」的地方。如果这一段连续多天为空，说明流水线在空转，必须在回执里如实写明原因。

### 第四段：后面做什么（later）

依赖裁决、依赖外部方、或本身工作量跨多轮的。写清依赖对象与前置条件，避免每天重复列入「马上做」。

## 第 0 段（2026-11-17 起强制）：邮件开头必须是两段白话

owner 明确要求：每日巡检邮件开头只写两段、编成 1.2.3，白话短句，先结果后明细。四段仍在，但排在白话之后。

固定形状：

```
【做了什么】
1. …（≤35 字，带数字或 commit/run）
2. …
3. …
【等你裁决】
1. …（≤35 字，写清不给裁决的后果）
2. …
```

硬规则：

1. 「做了什么」最多 3 条，「等你裁决」最多 3 条，超出的按影响排序只留前三条，其余写进四段明细，不得把明细挤回开头。
2. 每条只写结果，不写过程：不得出现「先读…又查…然后」的叙述。
3. 数字必须来自当日回执字段，不得取整、不得估算；没有可写的结果就写「今天没有产出」。
4. 「等你裁决」必须区分 GPT 与 owner 两类不可混列，并注明哪条是资金/签名类（那类永远不自动执行）。
5. 没有待裁决时写「无」，不得省略这一段——省略视为回执不完整。
6. 白话段之后必须接原有四段明细与该日 JSON 回执路径，否则视为只有摘要、没有账。

## 与队列派单的关系

四段结构是**回执侧**要求，不改变队列的 append-only 规则：一次 push 仍只新增一张卡（`DEEP-SUPERAGENT-<YYYYMMDD>-DAILY-<n>`），不得删改旧卡。四段内容写进 `knowledge/results/deep-superagent/daily-<YYYY-MM-DD>.json` 与汇总邮件，不进任务卡 prompt 的校验字段。

## 派单格式的两条硬约束（2026-11-11 实测）

1. 任务卡骨架**不得**携带 `needs_gpt_decision: true`。状态机见到该标志会直接升级到 GPT，跳过 worker 执行，表现为 `model_calls: 1`、`outputs: []`。
2. 原 prompt 必须按角色分别声明输出格式。`workers/deep-superagent/index.js` 第 183 行把 `original_request`（整段原 prompt）连同 `assigned_task` 一起传给 worker，写在原 prompt 里的 planner 骨架会被 worker 照抄，导致 worker 回放 plan 而不做判定。

证据：run `42918224651`（短路）、`42919106306`、`42919592533`（回放）、`42920132148`（按角色分格式后成功）。

## 纪律（不变）

不得合并 PR、不得做生产部署、不得改合约或支付语义、不得发起资金动作、不得改 `allowedAgents`、不得伪造任何 review receipt。`writes_performed` / `merges_performed` / `deploys_performed` 三个计数必须如实。

## 第五段（2026-11-17 起强制）：裁决回执跟踪（ruling_tracker）

四段之外另加一段，防止把「已裁决」写成「待裁决」。规则与脚本见 `ops/deep-superagent/RULING-TRACKING.md`。

- 每天采集之后必跑 `node scripts/track-gpt-rulings.mjs --limit 50 --window-days 14 --write`。
- 日回执必须带 `ruling_tracker` 字段（counts / pending_over_24h / 生成时间）。
- 路由复核以账本为准：有回信的线程不得再判 `needs_gpt_decision`，改写 `decided_pending_execution` 并附 `decision_id` 与回信 `message_id`。
- 超过 24h 未回信的线程，在每日邮件顶部单独提醒，不在四段里反复重发全文。
- 回信到达但未读时，必须先读正文再判定；未读即判定视为未核实。


## 第五段（2026-11-17 增补）：未收到 GPT 回信的催办清单（mail_awaiting_reply）

owner 2026-11-17 明确要求：每日巡检必须告诉他，有没有发了但没等到 GPT 回信的裁决请求。

- 每天读 `knowledge/results/deep-superagent/mail-intake/latest.json`：`agent_mail` 段是收到的信，`gmail_fullbox` 段是我方发出的信。以「我方发出的问询/请裁决类主题」去匹配「收件箱里同主题的 Re: 回信」，匹配不上的进本段。
- 字段固定为 `mail_awaiting_reply: {count, items:[{sent_at, subject_short, age_days, matched_reply:false}]}`，写进 `daily-<YYYY-MM-DD>.json` 并进汇总邮件，**不分日期**——每天都要出现这一段。
- 数量为零时写 `count: 0` 并注明"本窗口内所有请裁决邮件均有同主题回信"，不许省略整段。
- 匹配不上 ≠ GPT 没回。回信主题常被改写，所以措辞只写「未见到同主题回信」，不得写成「GPT 未回复」。
- 同一天若 `agent_mail.status` 非 ok（读不到收件箱），本段必须记 `unknown` 并说明原因，不得默认零。

## 第六段（2026-11-17 增补）：当日是否收到 GPT 裁决回信（gpt_ruling_received）

owner 2026-11-17 明确要求：每日巡检如果**没收到 GPT 回复的裁决邮件**，必须直接告诉他，不要等他来问。

- 每天在 Agent Mail 收件箱按 `from.email` 命中 GPT 席位（`ltzyz2181@gmail.com` / name `LTZZZ`）的信件里，判断当日窗口内是否存在**裁决类**回信（主题或正文含 ruling/裁决/decision/disposition/keep_blocked/approve 等，且非自动通知）。
- 字段固定为 `gpt_ruling_received: {received, last_received_at_utc, last_message_id, days_since_last_ruling, severity, note}`，写进 `daily-<YYYY-MM-DD>.json` 并在汇总邮件正文第一段之后单独一行提示，**每天都要出现**。
- `received=false` 且 `days_since_last_ruling>=1` 时：`severity='owner_attention'`，提示语固定为「今日未见 GPT 裁决回信，已连续 N 天」。
- `received=false` 但当天是休息日/无待裁决事项时，仍要写出来，`note` 说明「当日无待裁决项」，不得整段省略。
- 收件箱读不到（`agent_mail.status` 非 ok）：本段记 `received='unknown'`、`severity='unknown'`，并附失败原因，**不得**默认写成"没收到"。
- 只报事实与计数，不替 GPT 补裁决、不因缺回信自行推进 `keep_blocked` / `needs_decision` 项。
