# 合并巡检说明（2026-11-15 起，原 08:30 / 22:00 两条定时任务并入 6:45）

## 背景

豆包套餐只允许同时启用 1 条定时任务。owner 决定：保留 6:45「Deep 每日接管巡检」，08:30「LTZZZ 每日 AI 任务巡检」与 22:00「LTZZZ 三数日报」保持暂停、不再占用名额；两条任务的必要项并入 6:45 执行。

## 2026-11-28 变更（GPT 回信第 8 条 + owner 同日指令）

每日巡检**只保留团队工程调度**。以下并入项自本日起停用，不再执行、不再产出、不再出现在日报：

| 原项 | 状态 | 依据 |
| --- | --- | --- |
| 1 记忆库六份（含梦境数据库、文明研究） | 停用 | GPT 2026-11-28 第 8 条：移除记忆/梦境/文明研究 |
| 2 视频流水线 | 停用 | 同上：移除非工程巡检 |
| 3 ltzzz.com 可访问性 | 停用 | 同上：移除网站巡检 |
| 4 WorkBuddy skill 只读 | 停用 | 同上：移除 skill 巡检 |
| 5 微信公众平台只读 | 停用 | 同上：移除平台巡检 |
| 7 三数 | 保持 skipped | owner 2026-11-23 暂停，`status=skipped`，`reason=owner_paused_20261123` |

保留项：

- **6 日课补跑**：查当日（Asia/Shanghai）是否已有 `deep-superagent-daily.yml` 的 `event=schedule` run；没有就 `gh workflow run deep-superagent-daily.yml -r main` 补一次。幂等键含 readset + worker 源码哈希，晚到的自然 schedule 只回读、不重复计费。属巡检份内固定动作，不需要请示 owner。

停用项**不写入待裁决**，也不需要恢复确认；恢复须 owner 另行指示。

## 时序（2026-11-28 补记）

| 时间（Asia/Shanghai） | workflow | 是否写卡 |
| --- | --- | --- |
| 06:45 | `deep-mail-read.yml` | 否，只产出 `mail-imap-deep-<date>.json` |
| 08:15 | `deep-mail-watchdog.yml` | 否，仅当日文件缺失时补跑 |
| 08:17 | `deep-dispatch-daily.yml` | 是，生成 DAILY/OPS 卡并 dispatch |
| 08:30 | `deep-superagent-daily.yml` | 是，经 Task Hub 派 seat 卡并写 DAILY/OPS 卡 |

06:45 的邮件 JSON 是 08:17 / 08:30 写卡的输入；08:15 watchdog 是这一段的前置保障。

**已知待裁决**：08:17 与 08:30 两个 workflow 都会生成 DAILY/OPS 卡，存在重复写卡风险，边界尚未裁决（见 Issue #653）。

## 历史并入项原文（保留，便于追溯；已按上表停用）

1. 记忆库：读 ltzzz-memory 六份核心记忆（含梦境数据库.md、文明研究.md）与总控交接单，列出新增未处理事项（只列，不改记忆）。
2. 视频流水线：查最近一次视频流水线 run 的结论与产物路径，记录成功/失败。
3. ltzzz.com：做一次可访问性探测（HTTP 状态码），记录状态与耗时。
4. WorkBuddy（skill id `os_f8a49bc830defb02`）：只读巡检，记录可用状态；无凭据时记 unknown，不得伪造。
5. 微信公众平台（AppID `wx562bcb6057346fb2`）：只读巡检，记录状态；无凭据时记 unknown。
6. 日课补跑：查当日（Asia/Shanghai）是否已有 `deep-superagent-daily.yml` 的 `event=schedule` run；没有就立刻 `gh workflow run deep-superagent-daily.yml -r main` 补一次。日课幂等键含 readset+worker 源码哈希，晚到的自然 schedule 只会回读、不重复计费。补跑属巡检份内固定动作，不需要请示 owner。
7. 三数日报：把**前一日**的 YouTube / RUM / 进账三数追加到 `ltzzz-memory/daily-3nums.md`，每行标注 `data_date=<前一日>`；缺项写 null 与原因，不得用估算或当日值充当前一日。**（2026-11-23 owner 指令：三数暂停，不再采集与补记；本项改为记 `status=skipped` + reason=owner_paused_20261123，不列入待裁决，恢复须 owner 另行指示。）**

## 输出

- 保留项结果落盘 `knowledge/results/patrol/<YYYY-MM-DD>.json`，字段：日期、各项 status（ok / failed / unknown）、证据（命令或 run id）、耗时、失败原因。
- 停用项不产出条目；若当日无任何保留项动作，写 `skipped_all_patrol_items` 并注明停用日期。
- 并入项失败不阻断二至五节的主流水线；失败要在日汇总邮件与 `daily-<YYYY-MM-DD>.json` 的 patrol 段如实写清。
- 禁止为并入项动用资金、凭据写入、生产写或模型裁决。

## 不做

- 不恢复 08:30 / 22:00 两条定时任务本身（名额只有 1 条）。
- 不把前一日三数写成当日数据。
- 不在巡检里改记忆库、改 skill、改配置。
