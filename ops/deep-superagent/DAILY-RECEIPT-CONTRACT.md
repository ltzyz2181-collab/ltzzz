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

### 第三段：下一步马上做（next_immediate）

本席或 Deep 在**下一个工作日窗口内**就能自行推进、不需要等裁决的动作。每条要可执行、有明确完成判据。

这一段是自证「Deep 真的在干活」的地方。如果这一段连续多天为空，说明流水线在空转，必须在回执里如实写明原因。

### 第四段：后面做什么（later）

依赖裁决、依赖外部方、或本身工作量跨多轮的。写清依赖对象与前置条件，避免每天重复列入「马上做」。

## 与队列派单的关系

四段结构是**回执侧**要求，不改变队列的 append-only 规则：一次 push 仍只新增一张卡（`DEEP-SUPERAGENT-<YYYYMMDD>-DAILY-<n>`），不得删改旧卡。四段内容写进 `knowledge/results/deep-superagent/daily-<YYYY-MM-DD>.json` 与汇总邮件，不进任务卡 prompt 的校验字段。

## 派单格式的两条硬约束（2026-11-11 实测）

1. 任务卡骨架**不得**携带 `needs_gpt_decision: true`。状态机见到该标志会直接升级到 GPT，跳过 worker 执行，表现为 `model_calls: 1`、`outputs: []`。
2. 原 prompt 必须按角色分别声明输出格式。`workers/deep-superagent/index.js` 第 183 行把 `original_request`（整段原 prompt）连同 `assigned_task` 一起传给 worker，写在原 prompt 里的 planner 骨架会被 worker 照抄，导致 worker 回放 plan 而不做判定。

证据：run `42918224651`（短路）、`42919106306`、`42919592533`（回放）、`42920132148`（按角色分格式后成功）。

## 纪律（不变）

不得合并 PR、不得做生产部署、不得改合约或支付语义、不得发起资金动作、不得改 `allowedAgents`、不得伪造任何 review receipt。`writes_performed` / `merges_performed` / `deploys_performed` 三个计数必须如实。
