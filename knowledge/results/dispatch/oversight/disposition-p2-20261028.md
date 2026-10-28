# P2 处置 · 2026-10-28（schema 条件 / 模型状态维度 / 时间戳语义）

- 处置席：Doubao 总控 wrap-up；paid=false / tx_hash=null / 未签名 / 未广播
- 复核依据：千问监督报告（P205/206/208）+ 本席逐项仓内核证

## P2-05 千问 Schema 缺陷（QWEN-ANS2-SCHEMA-20261019）——属实，处置=派单修复

核证：`knowledge/results/qwen-dispatch/QWEN-ANS2-SCHEMA-20261019.json` 内嵌 draft-07 schema 中：
- `observed.items.follow_up_receipt` 的"action_taken==='none' 必须为 null"、`status` 的"action_taken==='none' 必须 open"**只写在 description 散文里**，无 `oneOf`/`if-then` 机器约束；
- 仅 `test_status` 有 `if/then`（run_id/sha256 随 actually_run 联动），且依赖支持 draft-07 条件关键字的 validator。
- 结论：跨字段条件约束未真正强制执行，属实。

处置：新建派单 `ops/dispatch/SCHEMA-ENFORCE-ANS2-20261028.md`（对象：有写权执行席）；验收=observed.items 用 oneOf/if-then 机器强制两对条件 + 最少 4 条正反用例测试 + 回执。台账已加行。

## P2-06 模型状态混淆（data/memory/qianwen.json）——属实，处置=修订 MODELCAT 卡拆维度

核证：千问多日把"Kimi 目录登记可用性"（catalogue 存在/已验证）与"生成结果失败"（10-10 空正文被驳）混成一个状态值；已派发的 `MODELCAT-KIMICN-20261022` 卡目标正是"catalogue_verified_no_generation → catalogue_verified_failed_generation"，即把两个独立维度压成一个字段。

处置：**不执行该混写**。已修订原卡：
- 维度 A（目录登记/可用性）：保持 `catalogue_verified_no_generation` 原值不覆盖，它是"已登记、已校验、无生成记录"，不是失败。
- 维度 B（最近生成结果）：在 provider-readiness 扫描产物**新增独立字段** `last_generation_outcome = failed_20261010_empty_response`（证据：项目历史 10-10(五)）。
- 回执须分别记录 A 未动、B 新增，两字段各自路径。

## P2-08 时间戳语义（daily-board/2026-10-20.json）——属实（语义未定义），数据不反转

核证：`seats.*.claim_receipt` 中 observed_at=00:53:56Z < claimed_at=00:56:45Z（00:53—00:59 窗口），被监督标为异常。

处置（语义定义，不改数据）：
- `observed_at` = 本轮 runner 首次观察到该席位任务（扫描/预留）的时间；
- `claimed_at` = 认领回执写入时间；
- 对首轮观察，**observed_at < claimed_at 是正常时序**（先观后认领）；真正异常是 claimed_at < observed_at（认领早于观察，同回执内倒挂）。
- 结论：本批次四条均为正常时序；监督规则应按此定义把"observed_at 早于 claimed_at"从异常规则中移除，保留"claimed_at < observed_at"为反转异常。本处置不改动任何 daily-board 数据。
