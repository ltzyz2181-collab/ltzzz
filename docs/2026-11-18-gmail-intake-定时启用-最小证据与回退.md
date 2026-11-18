# Gmail Intake 每日只读定时：最小证据集与回退方案

- 变更编号：`DR-20261118-gmail-intake-schedule`
- 依据：`GPT-LTZZZ-AUTONOMY-RULING-20261117-01` §二、§六（deploy_seat 负责定时触发、并发锁、失败告警与回执闭环）；
  Owner 2026-11-17 指令「Gmail 给出最小证据集与回退方案后启用」。
- 机读策略：`config/email-authority-20261117.json`（`gmail_intake.read_only=true`，`forbidden_mutations` 不变）。
- 变更文件：`.github/workflows/mail-intake-phase2.yml`、`scripts/tests/mail-workflow-policy.test.mjs`。
- 状态口径：本文件写「已写进代码 / 已过测试 / 已合并 / 已启用 / 已有真实定时回执」中的哪一个，必须逐项分开，不得合并成「已完成」。

## 1. 这次到底改了什么

工作流拆成两个 job，权限不互相借用：

| job | 触发 | 权限 | 是否读邮箱 | 是否写仓库 |
| --- | --- | --- | --- | --- |
| `contract` | `pull_request`、手动默认模式 | `contents: read` | 否 | 否 |
| `intake` | `schedule`（每天 00:23 UTC / 北京 08:23）、手动 `read-only-intake` | `contents: write` | 是，只读 | 只提交脱敏结果到固定路径 |

`intake` 的行为边界：

1. 只调用既有 `scripts/run-mail-intake.mjs`，不新增读取通道，不新增外发。
2. `GMAIL_IMAP_USER` / `GMAIL_IMAP_APP_PASSWORD` 只从 GitHub Actions secrets 注入，不落盘、不打印；
   `check-gmail-credentials.mjs` 在环境变量已注入时直接判 `ready`，输出 `values_printed=false`。
3. 缺任一 secret：立即 `exit 1`，错误信息为 `no mailbox read attempted`，不尝试登录。
4. 采集仍是 `SELECT readonly` + `BODY.PEEK`，不标已读、不删除、不移动，正文不落盘。
5. 只有 `status=ok|partial` 才提交结果；`failed` / `creds_missing` 只留 artifact 与红色 run，不覆盖上一次可核验结果。
6. 提交走 `tools/push-receipt-commit.mjs`（fetch + rebase + push），不强推；提交信息带 `[skip ci]`。
7. 并发：workflow 级按 ref 串行，job 级 `mail-intake-daily` 不取消；脚本自身还有 `.run-lock`。
8. 告警：`partial` 出 `::warning::`，`failed` 出 `::error::` 并让 run 变红。

## 2. 最小证据集（每次定时 run 必须能拿出这些）

按 run 取，字段名与产物一一对应，不接受口头描述：

| # | 证据 | 来源 | 判定 |
| --- | --- | --- | --- |
| 1 | run URL / run_id / attempt / event=`schedule` / conclusion | GitHub Actions | 缺一不可 |
| 2 | 凭据检查 `status=ready`、`source=environment`、`values_printed=false` | `check-gmail-credentials.mjs --json` 日志 | 不得出现密码值 |
| 3 | `status`、`gmail_fullbox.status`、`read_only=true`、`bodies_persisted=false` | `mail-intake/latest.json` | Gmail 通道必须是真实 ok/失败原因，不得写「读过」 |
| 4 | `count`、`open_count`、`window_since`、`window_truncated`、`full_box_total`、`full_box_unseen` | 同上 + `mail-fullbox/latest.json` | 窗口截断必须显式 true |
| 5 | 去重计数 `counts.unified / open_or_dispatch / duplicates_removed / ruling_conflicts` | 同上 | 冲突不得自动挑一个 |
| 6 | 脱敏自检通过（`assert_privacy` 未抛错）、无正文键 | 采集脚本 + 产物 | 出现正文即整次作废 |
| 7 | 结果提交 commit SHA（仅 ok/partial） | git log | 失败态不得有提交 |
| 8 | artifact 名称 / 大小 / sha256 | `actions/upload-artifact@v4` | 保留 30 天 |

一次性启用验收（本轮要做的）：

- 手动触发 `mode=read-only-intake` 一次真实 run，拿到上面 1–8 项；
- 下一次自然 `schedule` run 与手动 run 的证据结构一致；
- 两次都不出现任何正文、密码、完整标题（非项目域标题只计数）。

## 3. 回退方案（按影响面从小到大）

| 级别 | 动作 | 生效时间 | 验证 |
| --- | --- | --- | --- |
| R1 停调度 | 删除 `on.schedule` 块并提交；或在 GitHub UI / API 禁用该 workflow | 下一次 cron 起不再触发 | `schedule` 不再产生新 run |
| R2 停采集但留契约测试 | 把 `intake` job 的 `if` 改为 `false`，保留 `contract` | 立即 | 手动 `read-only-intake` 也不跑 |
| R3 撤凭据 | 删除仓库 secrets `GMAIL_IMAP_USER`、`GMAIL_IMAP_APP_PASSWORD` | 立即 | 下一次 run 在凭据检查步骤 fail-closed，`no mailbox read attempted` |
| R4 作废应用专用密码 | Google 账号 → 安全性 → 应用专用密码，撤销该条 | 立即 | 本机三处与 CI 同时失效，需重新签发后更新 |
| R5 回滚代码 | `git revert` 引入 `intake` job 的提交（数据提交不必回滚） | 下一个 push | `mail-workflow-policy.test.mjs` 仍通过旧版断言 |
| R6 恢复上次结果 | 以 `mail-fullbox/last-ok.json` 为准核对 `latest.json`；必要时回滚对应数据提交 | 立即 | `status` 不得从 ok 变成无法解释的 failed |

回退顺序建议：先 R1/R2 止损，再 R3/R4 处理凭据，最后 R5/R6 处理代码与数据。
任何一级回退都要在 `ops/deploy-receipts/DR-20261118-gmail-intake-schedule.json` 追加实际执行记录，不得只写计划。

## 4. 明确不做

- 不自动发送任何邮件（本变更只读）。
- 不标记已读、不删除、不移动邮件。
- 不把正文、附件、私人邮件标题写入仓库、日志或 artifact。
- 不因 Gmail 采集失败暂停无关任务（裁决 §四）。
- 不触碰付款、退款、签名、五签 Safe、生产部署等 L3 动作。

## 5. 与旧策略的差异（避免继续引用失效规则）

旧版 `mail-workflow-policy.test.mjs` 断言「工作流不得出现 schedule / secrets / git commit」。该断言对应 Phase 2「只提契约测试」阶段，已被本变更取代：

- `contract` 仍保持旧约束（无 secrets、无写仓库）；
- `intake` 是经 Owner 指令与裁决 §六启用的生产定时任务，允许读两个 Gmail secrets、允许提交脱敏结果；
- 新增回归断言：只允许这两个 secret、只允许固定结果路径、缺 secret 必须 fail-closed、不得强推、不得合并 PR、不得部署。
