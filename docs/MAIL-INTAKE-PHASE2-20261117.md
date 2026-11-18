# Gmail 摄入 Phase 2（2026-11-17）

> **后续状态（2026-11-18）**：本文是 2026-11-17 当时的记录。此后按 Owner“给出最小证据集与回退方案后启用”的指令，工作流已拆成 `contract`（无 secret、只读）与 `intake`（定时或手动 read-only，两个 Gmail secret）两个 job，并新增每日定时与策略测试。启用方式、最小证据集与回退 R1–R6 见 `docs/2026-11-18-gmail-intake-定时启用-最小证据与回退.md` 与 `ops/deploy-receipts/DR-20261118-wallet-p1-3-and-mail-schedule.json`。下文“未启用定时/无 secrets”等句子只描述当时状态，不代表现在。

任务：`LTZZZ-GMAIL-INTAKE-HYGIENE-20261117-02`，第二裁决 `GPT-LTZZZ-AUTONOMY-RULING-20261117-01`。

**当前状态**：代码完成、专项测试通过、独立分支待 PR；**未合并 main、未部署、未启用每日定时、未自动发送任何邮件**。Phase 1 仍为 `BLOCKED_EVIDENCE`（本机无凭据，见 §2）。

本文件只描述已实际写进仓库的内容；平台接受、CI 通过、合并、部署是四个不同状态，不在此互相代替。

## 1. commit `4dad3e87` 核对结论

- 以 `origin/main = 78cc369e` 为基线。
- GitHub API `GET /repos/ltzyz2181-collab/ltzzz/commits/4dad3e87` 返回 **422 `No commit found for SHA: 4dad3e87`**：该提交从未推送到 GitHub。
- 本地 `feat/gmail-intake-hygiene-20261117` 分支的 tip 是它，parent 为 `59dd5583`；直接合并会用旧树覆盖 main 后来加入的白名单、裁决对照表等改动，因此**不整体合并**。
- 只取它的两处可移植性修复：
  - `scripts/check-gpt-ruling-mail.mjs`：`agently-cli` 不再写死 `/home/user/.npm-global/bin/...`，改为「显式配置 → 已知安装位置 → PATH」。
  - `scripts/run-mail-intake.mjs`：仓库根目录由脚本位置推导（`REPO_ROOT` / `resolvePaths()`），支持 `LTZZZ_ROOT` 覆盖。
- 本工单**不推 main**；所有改动在 `fix/gmail-intake-phase2-20261117` 独立分支。

## 2. Phase 1：保持 BLOCKED_EVIDENCE

| 项目 | 本机（桌面） | 云主机 |
| --- | --- | --- |
| 凭据文件 | 不存在 | 存在，600 |
| 真实 IMAP 登录回执 | **无** | 有（`ops/mail-receipts/MR-20261117-gmail-imap.json`） |
| 状态 | `BLOCKED_EVIDENCE` | 已采集，但**不能替代本机回执** |

本机回执：`ops/mail-receipts/MR-20261117-desktop-gmail-credential-check.json`（`status=file_missing`，`values_printed=false`）。
状态文件：`knowledge/results/deep-superagent/mail-intake/phase1-status.json`。

按工单 §四：密码只由 Owner 在本机自行配置；AI 不索要、不代填、不写入仓库或日志。解除阻塞需要 Owner 本机依次完成：

```
node scripts/check-gmail-credentials.mjs          # 期望 status=ready
python3 scripts/collect-gmail-imap.py             # 保留真实退出码与产物
```

然后把以下七项回填 `phase1-status.json` 并把状态改为 `DONE`：登录成败、30 天窗口条数与是否截断、全箱总数与未读、实际采集数、去重结果、脱敏结果、失败真实退出码。

`scripts/check-gmail-credentials.mjs` 只报告文件是否存在、权限是否为 600、键名是否齐全；**不输出任何值**，并在环境变量已注入时直接判 ready、不读文件。

自定义凭据路径用 `--credentials-file <path>`。**不要用 `--env-file`**：Node 22 会把它当成 Node 自己的选项，在脚本运行前就吞掉（报 `node: <path>: not found`、退出码 9）。该问题由 CI 首次运行时捕获，已改为 `--credentials-file` 并补了真实 CLI 调用测试。

## 3. Phase 2 实现

### 3.1 三层去重（`scripts/mail/dedupe.mjs`）

- 三层并列：`message_id`、`thread_id`、原始 Task ID；任一命中即同一簇，三层之间可传递（union-find）。
- Task ID 只认日期锚定格式（`...-YYYYMMDD...`），**完全相等**才合并，不做前缀或模糊匹配。
- 只合并不删除：重复项写入 `duplicates`，全部成员按到达顺序写入 `history`，`history_preserved: true`。
- 状态 fail-closed：簇内任一封 `open`/`unknown`，整簇不得判 `closed`。
- 输出顺序与输入顺序无关；输入对象不被修改。

### 3.2 历史裁决继承

- `scripts/track-gpt-rulings.mjs`：同一线程保留**全部**回复与全部 `rulings`，不再只留最后一封；输出 `decision_ids`、`last_reply_id`、未读提醒（`consume_gate`）。
- `scripts/run-mail-intake.mjs` 的 `attachTrackerRulings()` 按主题键与 Task ID 并集把裁决挂到邮件项，去重后按时间排序。
- 同一簇出现多个不同 `decision_id` → `ruling_status='conflict'`、`decision_id=null`、`requires_review=true`，并进入 `dedupe.conflicts`；**不擅自挑一个当结论**。

### 3.3 六条误判修正（append-only 账本）

账本：`ops/deep-superagent/corrections/2026-11-17-task-state.jsonl`（6 行，JSONL，`prev_sha256` 串链）。
生成/核验：`node scripts/record-task-state-correction.mjs --seed|--verify`。

| correction_id | task_ref | 原状态 | 修正后 | decision_id |
| --- | --- | --- | --- | --- |
| CORR-20261117-001 | 0c44d7ce5b18a34e | needs_owner_decision | decided_pending_execution | GPT-RULING-20261116-18 |
| CORR-20261117-002 | cad495cb967efd7c | needs_gpt_decision | decided_pending_execution | GPT-WALLET-P1-20261116-01 |
| CORR-20261117-003 | 6a5c732286808bf3 | needs_gpt_decision | decided_pending_execution | GPT-WALLET-V1-20261116-01 |
| CORR-20261117-004 | adad792d0ef16422 | needs_gpt_decision | decided_pending_execution | GPT-HIRE-PHASE1-20261116-01 |
| CORR-20261117-005 | 5556bddb2622ff00 | needs_gpt_decision | decided_pending_execution | GPT-HIRE-PHASE1-SECURITY-20261116-01 |
| CORR-20261117-006 | 8d9a5f45ab685bbb | needs_gpt_decision | decided_pending_execution | GPT-HIRE-PHASE1-SECURITY-20261116-01-ADDENDUM-01 |

每条记录都带：

- `original_state`：原 `route`、`seat_route`、标题、来源文件、**原始记录哈希**；
- `corrected_state`：修正后状态、`decision_id`、裁决 `message_id`、裁决时间、verdict；
- `basis`：依据文件路径与文件哈希、裁决席地址；
- `preserves_original: true` 与 `entry_sha256`。

`--verify` 同时校验哈希链与「来源日回执里的原始记录仍与记账时一致」；账本被改、条目被删、来源被改都会失败。重复执行 `--seed` 幂等，不重复记账、不改已有行。

### 3.4 正文按需读取（`scripts/collect-gmail-imap.py`）

顺序与边界：

1. 先只批量取头：`BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID REFERENCES IN-REPLY-TO)] FLAGS`；
2. 只有「发件人命中项目白名单」且「主题命中项目语义或含 decision_id」的邮件才逐封读正文；
3. 正文用 `BODY.PEEK[TEXT]`，**不标已读、不删除、不移动、不 COPY**；
4. 读取上限 `GMAIL_MAX_BODY_READS=50`、`GMAIL_MAX_BYTES=65536`，超出记 `not_selected_cap` / `body_truncated`；
5. 只派生 `body_sha256`、`body_bytes`、`body_chars`、`body_task_ids`、`body_decision_ids`、`body_verdicts`；**正文原文不返回、不落盘**；
6. 单封失败只记 `body_status=fetch_failed` + `error_class`，不影响其他邮件；
7. 写盘前 `assert_privacy()`：出现 >320 字符、换行或 `body/text/raw/html/snippet` 键直接拒绝。

标题仍按 `PROJECT_DOMAINS` + 精确 `PROJECT_SENDERS` 白名单落盘；非项目邮件只计数（`project_unrelated_count`）。

### 3.5 并发、重复触发与失败

- 运行锁：`knowledge/results/deep-superagent/mail-intake/.run-lock`，`wx` 创建 + token；过期回收前**重新读取比对 token**，不按旧观察删新锁；抢锁失败输出 `status=skipped_locked`、退出码 4，不覆盖上一次产物。
- 幂等：`run_key = UTC 日期 + ':' + input_sha256 前 16 位`；同输入重复触发 `replay=true`。
- 记账：`runs.jsonl` 按 `run_key` 去重，每行带 `prev_sha256` / `entry_sha256`。
- 失败：单通道失败记 `partial`，全失败记 `failed`；超时记录 `ETIMEDOUT`/`SIGTERM`；`stderr_tail` 原样保留（截断 200 字符）。裁决跟踪读不到 → `unknown`，不是 0。

## 4. 测试

命令与原始输出见 PR 描述。测试文件：

- `scripts/tests/mail-dedupe.test.mjs`：三层去重、传递合并、重复邮件、同线程多封回复、裁决冲突、fail-closed、顺序无关、无副作用。
- `scripts/tests/mail-intake-pipeline.test.mjs`：状态推导、replay、网络失败、超时、部分失败、运行锁、记账幂等、凭据加载、隐私字段。
- `scripts/tests/ruling-tracker.test.mjs`：问答配对、多回复保留、未读提醒、非裁决席过滤、读取失败。
- `scripts/tests/task-state-correction.test.mjs`：六条修正、原始记录保留、幂等、哈希链、篡改检测、缺依据拒改。
- `scripts/tests/gmail-body-peek.test.mjs` + `test_gmail_imap_body.py`：BODY.PEEK、按需筛选、派生字段、隐私自检、单封失败隔离、源文件纪律。
- `scripts/tests/gmail-credentials.test.mjs`：凭据检查不泄漏值、权限与缺键判定。
- `scripts/tests/mail-workflow-policy.test.mjs`：工作流无 schedule、无 secrets、不写仓库。

## 5. CI

`.github/workflows/mail-intake-phase2.yml`：仅 `pull_request` + `workflow_dispatch`，`permissions: contents: read`，**无 schedule、无 secrets、无写仓库步骤**。CI 不连邮箱；真实 IMAP 回执只由 Owner 本机产生。

## 6. 剩余风险与待复核

1. **Phase 1 无本机回执**：状态保持 `BLOCKED_EVIDENCE`，不得标 DONE；需要 Owner 本机执行。
2. 正文读取尚未在真实邮箱上跑过（本机无凭据）；Python 单测覆盖逻辑与命令面，但真实 Gmail FLAGS/References 形态仍需一次实跑确认。
3. `thread_id` 由 References/In-Reply-To 哈希推导，跨客户端（Gmail 网页 vs 第三方客户端）可能不同；三层里的 Task ID 与 message_id 作为兜底。
4. 裁决冲突只做 `requires_review` 标记，不自动裁决；这与第二裁决「邮件不构成授权」一致。
5. 账本记录的是日回执中已存在的 `ruling` 字段；若裁决原件本身被质疑，需要回到邮箱原文核对，不由本账本自证。
6. 桌面开发席自测**不能替代**豆包/千问/AI 部署席的独立审查与 GPT 最终验收。

## 7. 回滚

本分支未合并、未部署、未启用定时；关闭 PR 即回滚。账本是新增文件，删除不影响既有日回执；`latest.json` 等产物未被本 PR 改写。
