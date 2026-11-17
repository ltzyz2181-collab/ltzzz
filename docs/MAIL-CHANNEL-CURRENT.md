# 邮件通道当前口径（2026-11-17）

本文件是**唯一当前口径**，取代此前"不自动发邮件"与"只能读 Agent Mail"两条旧表述。

## 一、owner 2026-11-17 拍板

1. **汇总邮件必须发**：每日巡检汇总邮件属必发项，不再由"不自动发邮件"覆盖。审计 prompt 若仍写"不自动发邮件"，按本文件判为过期口径，不判违规。
2. **Gmail 要读全箱**：`ltzyz2181@gmail.com` 必须整箱读取（含非 Agent Mail 来源），不是只读 Agent Mail。

## 二、发信（已具备能力）

- 通道：腾讯 Agent Mail `agently-cli`，发件 `qingqizhu6502@agent.qq.com` → 收件 `ltzyz2181@gmail.com`。
- 两段式确认：第二步带 `confirmation_token`；发后从发件箱回读 `message_id`。
- 正文纯文本；不写金额、凭据、邮件原文。

## 三、收信（能力缺口，已落码待凭据）

- 收信现状：只有 Agent Mail 的收件箱可读（`agently-cli message +list --dir inbox`）。
- 目标：Gmail 全箱。实现 `scripts/collect-gmail-fullbox.mjs`（Gmail REST，只读元数据，不落正文）。
- 现状判定：**凭据缺失 → fail-closed**，输出 `status=creds_missing`、`count=0`，绝不把"未读到"写成"读完了"。
- 解除条件：提供 `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN`（或改用 IMAP 应用专用密码）。
- 写入：`knowledge/results/deep-superagent/mail-fullbox/latest.json`（仅 id/thread/日期/发件域/短标题/片段哈希/标签）。

## 四、审计怎么读

- 每日汇总邮件缺失 = 真违规（必须发）。
- `mail-fullbox` 回执 `creds_missing` = 能力缺口，不是"读过全箱"；必须如实写进日回执。
