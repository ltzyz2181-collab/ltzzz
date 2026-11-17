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
