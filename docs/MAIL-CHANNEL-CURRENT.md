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

