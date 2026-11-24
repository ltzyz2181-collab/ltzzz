# 邮件通道当前口径（2026-11-17）

本文件是**唯一当前口径**，取代此前"不自动发邮件"与"只能读 Agent Mail"两条旧表述。

> **当前生效结论（2026-11-17 实测，已覆盖第三、五节的旧判断）**
> Gmail 全箱**已经打通并读到**，走的是 IMAP 993 + 应用专用密码，不是 Gmail REST：
> - 云主机：`imap.gmail.com:993` TLS 正常 → `scripts/collect-gmail-imap.py` 实跑 `status=ok`，
>   窗口 30 天 `count=1338`（`window_truncated=false`），全箱 `full_box_total=4670`、`full_box_unseen=3847`、标题含派单语义词 118 封。
> - 云主机到 Google 的 HTTPS（`oauth2.googleapis.com` / `gmail.googleapis.com` / `mail.google.com`）仍是 000，因此 `scripts/collect-gmail-fullbox.mjs`（OAuth REST 版）在云主机**不可用**，保留但不再是主路径。
> - 凭据位置：`~/.config/ltzzz/gmail-imap.env`（`chmod 600`，仓库外，不进仓库、不进 CI）。
> - 产物：`knowledge/results/deep-superagent/mail-fullbox/latest.json`（只读元数据，正文不落盘）。

## 一、owner 2026-11-17 拍板

1. **汇总邮件必须发**：每日巡检汇总邮件属必发项，不再由"不自动发邮件"覆盖。审计 prompt 若仍写"不自动发邮件"，按本文件判为过期口径，不判违规。
2. **Gmail 要读全箱**：`ltzyz2181@gmail.com` 必须整箱读取（含非 Agent Mail 来源），不是只读 Agent Mail。

## 二、发信（已具备能力）

- 通道：腾讯 Agent Mail `agently-cli`，发件 `qingqizhu6502@agent.qq.com` → 收件 `ltzyz2181@gmail.com`。
- 两段式确认：第二步带 `confirmation_token`；发后从发件箱回读 `message_id`。
- 正文纯文本；不写金额、凭据、邮件原文。

### 2.1 桌面席位（2026-11-17 实测可用）：owner QQ 邮箱 SMTP

- 通道：`smtp.qq.com:465` SSL，发件 `306122054@qq.com`（owner 本人 QQ 邮箱）→ `ltzyz2181@gmail.com`。
- 凭据：`~/.config/ltzzz/qq-smtp.env`（仓库外，ACL 仅当前用户；**不进 git、不打印、不写进回执**）。
- 为什么不用 Gmail SMTP：本机 `smtp.gmail.com:465/587` 均超时（`smtp.qq.com:465` 正常，属 Gmail SMTP 被阻断）；`imap.gmail.com:993` 可读，用于投递回读。
- 投递回读：Gmail IMAP 993 只读、`BODY.PEEK`，按 `SINCE` + 主题/MESSAGE-ID 核对。QQ 会重写 `Message-ID`，回执同时记录生成值与投递值。
- 已用此通道发送：`MR-20261117-pr410-deploy-report`（2026-11-17T09:13:40Z）。

## 三、收信（历史记录：2026-11-17 上半日的能力缺口，下半日已解除，见文首结论）

- 收信现状：只有 Agent Mail 的收件箱可读（`agently-cli message +list --dir inbox`）。
- 目标：Gmail 全箱。实现 `scripts/collect-gmail-fullbox.mjs`（Gmail REST，只读元数据，不落正文）。
- 现状判定：**凭据缺失 → fail-closed**，输出 `status=creds_missing`、`count=0`，绝不把"未读到"写成"读完了"。
- 解除条件：提供 `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN`（或改用 IMAP 应用专用密码）。
- 写入：`knowledge/results/deep-superagent/mail-fullbox/latest.json`（仅 id/thread/日期/发件域/短标题/片段哈希/标签）。

## 四、审计怎么读

- 每日汇总邮件缺失 = 真违规（必须发）。
- `mail-fullbox` 回执 `creds_missing` = 能力缺口，不是"读过全箱"；必须如实写进日回执。

## 5. 网络可达性实测（2026-11-17 上午，**已被当日下午实测推翻，仅作历史记录**）

| 端点 | 云主机 | 桌面（世章） |
| --- | --- | --- |
| `oauth2.googleapis.com` | 000（不通） | 未测（浏览器打开 Gmail 停在起始页，页面未加载） |
| `gmail.googleapis.com` | 000（不通） | 同上 |
| `mail.google.com` | 000（不通） | 不可达 |
| `accounts.google.com` | 000（不通） | 不可达 |

结论：Gmail 全箱读取当前**不只是缺凭据，两端都到不了 Google**。因此：

1. 凭据到手也无法在云主机直接调 Gmail REST —— `scripts/collect-gmail-fullbox.mjs` 会停在 `token_exchange_failed`。
2. 可行路径是把读取放进有 Google 出网的 Cloudflare Worker（现成的 `ltzzz-youtube-upload` 已具备 Google OAuth + KV refresh_token 机制），由它代读、云主机只取脱敏元数据。
3. 该路径仍需一次**新的 Gmail 只读 scope 同意**，而同意页需要能访问 Google 的浏览器；桌面当前出口到不了 Google，故这一步仍卡在网络上。
4. 在拿到出网能力之前，Agent Mail 仍是唯一可读收件渠道，Gmail 项按 `blocked_external` 记录，不得写成"已读取"。

### 5.1 当日下午复测（现行有效）

| 端点 | 云主机 | 桌面（世章） |
| --- | --- | --- |
| `www.google.com` HTTPS | 000 | 200 |
| `oauth2.googleapis.com` / `gmail.googleapis.com` HTTPS | 000 | 404 / 401（真实响应） |
| `imap.gmail.com:993` | TCP 可连、TLS1.3 握手证书校验 OK | TcpTestSucceeded=True |
| `smtp.gmail.com:465` | 未测 | TcpTestSucceeded=True |

结论：**桌面能到 Google，云主机只能走 IMAP、走不了 Google HTTP API**。因此 Gmail 全箱的主路径定为 IMAP，
`blocked_external` 的判断作废，不得再据此把 Gmail 项记成外部阻塞。

## 6. Gmail 全箱读取（现行做法）

- 脚本：`scripts/collect-gmail-imap.py`（仅标准库 imaplib，只读 `SELECT readonly` + `BODY.PEEK`，不标已读、不删信）。
- 凭据：环境变量 `GMAIL_IMAP_USER` / `GMAIL_IMAP_APP_PASSWORD`，本机取自 `~/.config/ltzzz/gmail-imap.env`（600）。
- 隐私：只落 `ref`（Message-ID 哈希）、日期、发件域、短标题（≤60 字，金额与长 token 打码）、标题哈希、未读标记；正文永不落盘。
- 失败语义：缺凭据写 `creds_missing`；登录失败重试三次（30s/90s 退避）后写 `imap_login_failed` 并带 `retries`；
  任何非 ok 结果写盘前会把上一次 ok 另存 `last-ok.json`，避免把可核验结果覆盖成废态。
- 已知限制：单次约 2.5 分钟（1400 封量级），偶发云主机到 993 的 TCP 握手超时（重试可过）。

## 7. 每日流水线的唯一入口

- 命令：`node scripts/run-mail-intake.mjs`（先 Agent Mail，再 Gmail 全箱，最后合并）。
- 产物：`knowledge/results/deep-superagent/mail-intake/latest.json`（`schema=ltzzz.mail-intake.v1`）。
- 语义：`status` 只由两条通道的真实结果推导（ok / partial / failed）；任一通道失败都不许写成读过。
- 校验：`scripts/tests/mail-intake.test.mjs` 在 CI 里校验结构、状态推导与脱敏约束，不重跑采集。

## 8. 2026-11-17 六项验收实跑回执（勿再重复问、勿再要密码）

结论：六项**全部有真实输出**，凭据**本来就在**云主机，不需要 owner 再写文件、也不需要向 owner 索要密码。

- 凭据位置（唯一一份）：云主机 `/home/user/.config/ltzzz/gmail-imap.env`，`600`，77 字节，2026-11-17 12:11 落盘；
  两个键 `GMAIL_IMAP_USER`（19 字符）/ `GMAIL_IMAP_APP_PASSWORD`（16 字符）。脚本自己读文件，值不进对话、不进仓库、不进 Actions 日志。
- 实跑口径（`node scripts/run-mail-intake.mjs`，2026-11-17T07:33:04Z）：

| 验收项 | 真实结果 | 依据字段 |
|---|---|---|
| IMAP 真实登录 | ok（TLS 993 + LOGIN + readonly SELECT） | `provider=gmail_imap`、`read_only=true` |
| 30 天窗口条数 | **1366 封**，未截断 | `window_since=18-Oct-2026`、`window_truncated=false`（上限 2500） |
| 全箱总数 / 未读 | **4698 / 3875** | `full_box_total`、`full_box_unseen` |
| 采集条数 | Gmail 1366 + Agent Mail 38 = **合并 1404** | `counts.unified=1404` |
| 去重结果 | 1404 → 过滤已闭环已读 → **143 条待办**，去重后唯一 ref 143/143 | `counts.open_or_dispatch=143` |
| 脱敏结果 | **0 条残留**；`<amount>` 命中 18、`<token>` 命中 24；正文未落盘 | 全量 1366 条复查 + `bodies_persisted=false` |

- 回执文件：`ops/mail-receipts/MR-20261117-gmail-imap.json`。
- **本轮修掉一个真实缺口**：`AMOUNT` 只认「数字在前」的写法，`¥9.90` 这类符号在前的金额没被打码（首轮只有 8 条命中）。
  已补 `AMOUNT_SYMBOL`（`¥/$/€/£`），重跑后命中 8→18；回归测试 `scripts/tests/gmail-redact.test.mjs`（5 例，与 `mail-intake.test.mjs` 合跑 9/9）。
- **换机器必读**：凭据只在云主机这一台。别的机器/别的席位跑同一脚本会 fail-closed 写 `creds_missing`——这是**预期行为**，
  不是「凭据缺失待补」，也不得据此报「六项无回执」。要复跑就在云主机跑。


## 9. QQ 邮箱 306122054 凭据的归属（2026-11-17 修正）

- **归属：桌面 GPT 席与桌面 Claude 席的通道，不是云主机/豆包席的通道。** 该账号的 16 位授权码由 owner 交给桌面两席使用（桌面侧 `~/.config/ltzzz/qq-smtp.env`，见本文 §2.1）。
- 2026-17:31 云主机侧曾按 owner 转发的同一授权码落过一份 `~/.config/ltzzz/qq-mail.env`，实测 `imap.qq.com:993 LOGIN OK / INBOX 3045`（只读，未取正文）。owner 澄清"发错了，是桌面 GPT 和桌面 Claude 用的"后，**云主机副本已 `shred` 删除，不保留**。
- 记录口径：本条只记归属与所在机器，不记值、不留副本；云主机侧任何脚本读该邮箱都应 fail-closed (`creds_missing`)，不得据此推断通道不可用。
- 若以后云主机确实需要 QQ 收信，应让 owner 单独为该机器签发新授权码，不复用桌面两席那一份。

## 10. 每日合并与发信接线（2026-11-18）

- **读**：`scripts/run-mail-intake.mjs` 新增 `gmail_rulings` 元数据块：只按 `from_domain=gmail.com` +
  主题命中裁决词筛选，输出 `today_count/window_count/latest_subject_short/decision_ids`，
  `bodies_read=false`、`bodies_persisted=false`。读不到时 `status=unknown`，不写成「没有裁决」。
- **合并**：`scripts/daily-ops-summary.mjs` 只读公开回执，生成
  `knowledge/results/deep-superagent/daily-merge/<date>.json`、`email-<date>.txt`、`email-<date>.meta.json`，
  并把需要 GPT 裁决的项写成 append-only 的 `ops/deep-superagent/ruling-requests/RREQ-*.json`
  （`status=awaiting_gpt`、`decision_authority=gpt_or_owner_only`）。
- **发**：`scripts/send-mail.py`（Python 标准库 `smtplib`，`smtp.qq.com:465` SSL）。
  - CI 凭据：secret `MAIL_SMTP_USER` / `MAIL_SMTP_PASSWORD`；变量 `MAIL_SMTP_HOST`、`AUTOLOOP_MAIL_TO`、
    `AUTOLOOP_SEND_MAIL`。脚本也接受 `MAIL_SMTP_AUTH_CODE` 作为授权码别名。
  - 回执：`knowledge/results/deep-superagent/daily-merge/send-<date>.json`，只落主题/正文哈希、
    收件人数量与域、SMTP 响应码和 `Message-ID`；不落正文、完整收件地址或授权码。
  - 语义：缺凭据 `creds_missing`（exit 3）；开关关闭 `skipped_by_switch`；SMTP 失败 `failed`；
    部分收件人被拒 `refused`（exit 3，回执记 `refused_count`）；全部接收才是 `sent`。
    任何失败都不会被写成已发送。
  - 2026-11-19 实测缺陷与修正：`smtplib.SMTP.send_message()` 返回「被拒收件人字典」，不是
    `(code, detail)`。旧代码 `code, detail = conn.send_message(message)` 在全部接收时对空字典解包，
    抛 `ValueError: not enough values to unpack (expected 2, got 0)`（run 44452335061 / 44453187521）。
    现在按返回值判定 `sent`/`refused`，再发一次 `NOOP` 取可见会话码，回执写
    `smtp_code_source=noop_after_send`；消息级接收由 smtplib 内部校验 DATA 响应保证
    （非 250 抛 `SMTPDataError`）。
- **定时与触发**：`.github/workflows/daily-ops-report.yml`
  - `workflow_run` 跟进「Mail intake phase 2」与「Deep Superagent daily evidence supervision」；
  - 01:07 UTC 定时兜底；也可 `workflow_dispatch` 指定日期；
  - 依赖未齐时（队列/日监督/邮件摄入任一缺当天回执）先 defer，不伪造完整日报；
  - 同一天已有 `status=sent` 的回执则跳过重发，避免 workflow_run 重复发信。

如实边界：邮件成功只证明 SMTP 接收（`250`）并记录了 `Message-ID`；不等于收件人已读，
也不等于任何业务验收或部署完成。

## 11. 2026-11-19 AI 互发邮件与全自动收发

- owner 指令：邮件收、读、发全部自动；各 AI 能相互发邮件；各通道放开限制。
- 允许名单：`config/mail-allowlist-20261119.json`，登记真实存在的三个地址（owner Gmail、共享 QQ 邮箱、Agent Mail）；每次最多 8 个收件人。
- 席位路由：发给共享邮箱时主题带 `[seat:<seat>]`；收信侧按前缀归属，不丢信、不伪造席位。
- 代码：`scripts/deep-autonomy.mjs` 的 `mail.to` 从「只能 1 个且必须等于 `AUTOLOOP_MAIL_TO`」改为「1–8 个、全部命中合并允许名单」；`scripts/run-deep-superagent-queue.mjs` 的 `mailAllowlist()` 合并环境变量与配置文件。
- 未变：SMTP `250` 仍只代表服务器接受投递，不等于已读；回执仍不落正文、完整地址或授权码。

## 12. 2026-11-20 席位邮箱登记与 token 注入边界

owner 2026-11-20 指令：Gmail+QQ 专用密码由各席位**自行从仓库找到配置**；告知豆包与 WorkBuddy 的 Agent 邮箱；先测 Meta 通不通；WorkBuddy 本地席与 Meta 需要 `GITHUB_TOKEN`/`GH_TOKEN` 注入通道。

> 硬边界：本仓库是 **public**。密码、授权码、PAT、私钥一律不入库、不进回执、不进邮件正文。
> 席位"自行到仓库找"的是**凭据名称和位置**，不是凭据值。

### 12.1 登记表

- `config/seat-mail-registry.json`：席位地址、传输方式、凭据引用（只写 env 名称）。
- `config/mail-allowlist-20261119.json`：实际允许收发的地址集合（已补 xai / relay-gpt / relay-claude / desktop-claude / desktop-gpt / meta）。

### 12.2 地址归属

| 席位 | 地址 | 传输 |
| --- | --- | --- |
| owner | `ltzyz2181@gmail.com` | SMTP / IMAP |
| 共享邮箱（deep / qianwen / kimi_cn / xai / relay_gpt / relay_claude / desktop_claude / desktop_gpt / meta） | `306122054@qq.com`，主题前缀 `[seat:<seat>]` | seat-mail relay / SMTP |
| 豆包 | `qingqizhu6502@agent.qq.com` | Agent Mail |
| WorkBuddy | `sgii7122@agent.qq.com`（owner 2026-11-20 确认） | Agent Mail |

WorkBuddy 地址已于 2026-11-20 由 owner 确认：`sgii7122@agent.qq.com`；此前口述的 `gii7122`（无 s）记为笔误。只保留一个地址，避免同一席位出现两个身份。

### 12.3 凭据在哪里（值不入库）

| 凭据 | 名称 | 位置 |
| --- | --- | --- |
| QQ SMTP | `MAIL_SMTP_HOST/USER/PASSWORD` | GitHub Actions Secrets；桌面 `~/.config/ltzzz/qq-mail.env`（600） |
| Gmail IMAP | `GMAIL_IMAP_USER/APP_PASSWORD` | GitHub Actions Secrets；桌面 `~/.config/ltzzz/gmail-imap.env`（600） |
| Agent Mail | `AGENTLY_CLI_SESSION` | 本机 agently-cli 登录态 |
| Meta hosted | `META_WORKER_TOKEN` | Worker secret；可由 `CLOUDFLARE_API_TOKEN` HMAC 派生 |

席位不需要各自持有 SMTP 密码：开一张 `label=mail:send` 的 Issue，`.github/workflows/seat-mail.yml` 每 30 分钟代发并回执（`.github/workflows/seat-mail.yml`、`scripts/seat-mail.mjs`）。

### 12.4 token 注入通道

- **Actions 席位**：平台自动注入 `GITHUB_TOKEN`，不需要 PAT。
- **本地 CLI 席位**：`scripts/seat-token-env.sh --exec <cmd>` / `scripts/seat-token-env.ps1 -Exec "<cmd line>"`，只在子进程注入 `GH_TOKEN`/`GITHUB_TOKEN`，不打印、不落盘，调用方环境在子进程退出后恢复。`--check` / `-Check` 只报 `has_token` 与来源。
  - 解析顺序：`GH_TOKEN` → `GITHUB_TOKEN` → `~/.config/ltzzz/github.env`（600，`GH_TOKEN=...`）→ `git credential fill`。
- **WorkBuddy（Web 应用）**：没有 env 注入面，只能走 `mail:send` Issue / 仓库任务；不要把 PAT 粘进对话或网页。
- **外部模型席位**（豆包 / 千问 / Kimi / XAI / 中转 GPT / 中转 Claude）：不持有 PAT；需要写库走 relay 或最小权限 fine-grained PAT。
- **Meta hosted**：只持有 `META_WORKER_TOKEN`，不向模型提供 GitHub PAT。

### 12.5 Meta 连通性探针

- 代码：`scripts/meta-connectivity-probe.mjs`；工作流：`.github/workflows/meta-connectivity-probe.yml`（`workflow_dispatch`）。
- 步骤：`GET /health` → `POST /auth-check` → `POST /task`（`kind=channel_probe`，32 位 hex nonce 原样回显）。
- 判定：`ok` / `network_unreachable` / `worker_not_found` / `auth_not_configured` / `deployed_auth_not_ready` / `deployed_inference_failed` / `probe_echo_mismatch`。
- 回执：`knowledge/results/meta/connectivity-<run_id>.json`，只含状态、主机名、延迟、回声匹配；不含任何凭据。
- 边界：一次 `channel_probe` 最多 1 次模型调用（`max_tokens=80`），不做业务推理、不碰资金、不签名。
- 桌面/本机到 `*.workers.dev` 出口不通时，curl 000 **不能**判为 Meta 不可用；以 Actions 探针结果为准。

### 12.6 Meta 的 Issue 写入通道（2026-11-20）

owner 决定：给 Meta 一个仅 Issue 权限的 fine-grained PAT，让它能自己开卡，而不是只能输出文本等人转抄。

- Worker 新增 `POST /issue`（与 `/task` 同一个 Bearer）：字段 `task_id` + `title` + `body` + `labels`；`dry_run=true` 只校验、不创建。
- 策略在 `scripts/lib/meta-issue-policy.mjs`，Worker 与测试共用同一份：仓库写死 `ltzyz2181-collab/ltzzz`（调用方给 `repo` 无效）；标题自动加 `[meta]`；标签只允许 `meta-proposal` / `meta-review` / `meta-report` / `idea-board`，最多 3 个；按 `task_id` 去重；正文出现凭据形态直接 422 拒绝。
- 令牌链路：仓库 secret `META_ISSUES_PAT` → 工作流 `Meta issue bridge` → Worker secret `GITHUB_ISSUES_TOKEN`。全程 `::add-mask::`，不写仓库、不进日志。
- 验收入口：`scripts/verify-meta-issue-route.mjs`（dry_run，回执 `created_issues=0`）。
- 仍未通：模型推理（Cloudflare 401/403）。在开通 Workers AI 之前，`/issue` 只能被外部调用，Meta 自己还产不出内容。

实测（2026-11-20，run `44700626476`）：

- `dry_run`：200，`issues_configured=true`。
- 真实创建：200，`status=created`，Issue **#520**（label `meta-report`）。
- 写入身份是 PAT 所属账号（GitHub 显示为 `ltzyz2181-collab`），不是字面上的 meta；所以每条都用 `[meta]` 前缀 + `source: did:ltzzz:meta` 标注来源。
- PAT 到期 **2027-02-18**。到期前必须换新并重跑 `Meta issue bridge`；过期后 `/issue` 返回 503 `issues_not_configured`，属 fail-closed，不会静默丢卡。

### 12.7 Meta 的 mail:send relay 限权（owner 2026-11-23）

owner 2026-11-23 指令：**同意开 mail:send relay 限权给 Meta，不给 PAT**。落点是把「发信」和「持有凭据」继续分开：

- 入口：Worker `POST /mail`（同一个 `META_WORKER_TOKEN` Bearer）。Meta 不拿 GitHub PAT，也不拿 SMTP 授权码。
- Worker 只做一件事：校验通过后用 Worker secret `GITHUB_ISSUES_TOKEN` 开一张 `label=mail:send` 的受限卡片，返回 `status=queued`、卡片号、`transport=seat-mail-relay`。真正的发送仍由 `.github/workflows/seat-mail.yml` 定时 relay 完成。
- 策略与 Worker/测试共用同一份：`scripts/lib/meta-mail-policy.mjs`。
  - 收件人只能是登记表里有地址的席位：`owner` / `doubao` / `workbuddy` / `deep` / `desktop_gpt` / `desktop_claude` / `relay_gpt` / `relay_claude` / `kimi_cn` / `xai`；给 `meta` 自己发信直接拒绝（`self_recipient_not_allowed`）。
  - `subject` 4–80 字符，正文 1–6000 字符；正文出现凭据形态（`gh*_`、`github_pat_`、`sk-`、`xox*`、`AKIA*`、私钥头）直接 422 `credential_like_content_rejected`。
  - 按 `mail_request_id` 去重，避免同一请求开多张卡。
- relay 侧二次校验：`scripts/seat-mail.mjs` 的 `evaluateRelayPermission` 读 `config/seat-mail-registry.json` 的 `relay_permissions.seats.meta`：
  - 白名单外的地址 → `recipient_not_allowed`，回 `[mail-blocked]` 并摘掉 `mail:send` 标签；
  - UTC 当日最多 10 封 → `daily_cap_reached`；
  - 正文最多 24576 字节 → `body_too_large`（6000 字符按 UTF-8 最坏 4 字节/字符约 24000 字节，留卡片头余量）。
- 其它席位没有显式条目，维持原行为；本段只给 Meta 增加上限，不收紧既有席位。
- 验收入口：`scripts/verify-meta-issue-route.mjs` 在 `/issue` dry-run 之后追加 `/mail` dry-run，回执写 `mail_dry_run`；`/health` 增加 `mail_relay_configured` 与 `mail_relay_transport=seat-mail-relay`。
- 边界：`queued` 只代表「卡片已排队」，不代表邮件已发出；是否真发出，以 `seat-mail` 回执里的 `[mail-sent]` / `status=sent` 和 `message_id` 为准。Meta 仍然拿不到 PAT，也拿不到 SMTP 凭据。

## 十三、2026-11-23 邮件摄入对账（LTZZZ-MAIL-INTAKE-RECONCILIATION-20261123-01）

本节只描述代码与产物语义，不声称定时工作流已验收。

1. **Agent Mail 缺失不再写进旧结果**：`scripts/mail/agently-cli.mjs` 统一解析 CLI（`env.AGENTLY_CLI` → npm 全局目录 → `PATH`）。`ENOENT` 归类为 `status=blocked` + `block_code=BLOCKED_EVIDENCE` + `error_class=ENOENT`，`collect-mail-backlog.mjs` 会写一份失败文档而不是保留旧 `latest.json`；上一次 `ok` 另存 `mail-backlog/last-ok.json`。`track-gpt-rulings.mjs` 与 `check-gpt-ruling-mail.mjs` 同样分类，退出码 2。
2. **Gmail 正文 50 封上限有持久续批**：`collect-gmail-imap.py` 新增 `mail-fullbox/body-queue.json`（schema `ltzzz.mail-body-queue.v1`）。候选按 `first_seen` FIFO 选批，`GMAIL_MAX_BODY_READS` 默认 50；成功/空正文标 `done` 且不再重读；失败 `attempts+1` 后 `retry`，达到上限 `failed`；本轮不在窗口内的项标 `not_in_window` 保留，重新出现会回到 `pending`；超过 30 天未完成标 `expired`，不伪造 `done`。队列写盘失败时 `body_queue.status=write_failed`，intake 将 Gmail 降为 `partial`，不把未读正文当已消费。
3. **已消费裁决账本真正生效**：`track-gpt-rulings.mjs` 读取 `knowledge/results/deep-superagent/rulings-consumed-*.json`。只有 `message_id` 精确命中才标 `consumed`，`thread_key` 仅作审计提示，避免同一线程的新回复被历史账本误杀。已消费的回复不再进入 `consume_gate`。
4. **提问识别覆盖 `Re: [GPT总控派单]`**：`isAskMessage` 接受裁决词、`[GPT…]`/`[LTZZZ…]` 标签或已提取的 decision_id，避免 GPT 已回信但账本里没有对应问题线程。
5. **仓库信号可并入统一待办**：`scripts/collect-repo-signals.mjs` 手工采集 open issues、open PR、窗口内失败 Actions、部署回执未决项与评论计数，输出 `knowledge/results/deep-superagent/repo-signals/latest.json`（只采元数据，评论正文不落盘）。`run-mail-intake.mjs` 将其映射为 `github_repo` / `github_pr` / `github_actions` / `deploy_receipt` 待办，并在 `counts` / `reconciliation` 中分别给出单通道计数与三层去重后的 `open_items_total`。**本采集器不接入定时工作流**：intake job 的 `permissions` 固定为 `contents: write`，无权读 issues/actions；按本任务边界不得改权限。
6. **回指同一轮运行**：intake 产物新增 `run.source_commit` / `workflow_run_id` / `workflow_run_attempt` / `event` / `ref`，`runs.jsonl` 同步记录 `source_commit`；`daily-ops-summary.mjs` 的 `mail` 块带 `run_id` / `run_key` / `source_commit` / `open_items_total` / `body_pending` / `body_queue_status`。
7. **状态语义**：`ok` 仅在 Gmail（含正文队列）、Agent Mail、裁决跟踪、仓库信号四路都可用时为真；任一失败至少 `partial`；全部不可用才 `failed`。通道各自保留 `source_status`、`block_code`、`error_class`、`install_hint`，不合并成一个 `ok`。
8. **测试**：`ruling-tracker.test.mjs`（Re: 派单、已消费抑制、thread_id 关联、ENOENT）、`mail-intake-pipeline.test.mjs`（Agent Mail blocked、正文队列写盘失败、仓库信号并入、缺失信号不零待办）、`repo-signals.test.mjs`（脱敏、窗口、缺 token）、`test_gmail_imap_body.py`（50 封续批、失败重试、done 不重读、not_in_window 保留、隐私）、`daily-ops-summary.test.mjs`（运行回指与正文积压）。

