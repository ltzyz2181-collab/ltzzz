# SENT | ICP 备案报告已实际发出

| 项 | 值 |
|---|---|
| 通道 | 腾讯 Agent Mail（agently-cli），发件 `qingqizhu6502@agent.qq.com` |
| 收件 | `ltzyz2181@gmail.com`（GPT 人工席） |
| 主题 | [LTZZZ] ICP 备案通过（粤ICP备2026177896号）+ 11-10 工程状态 + 5 项待裁决 |
| msg_id | `msg_o45tLfzPe405HiJAXGyzhgdProv-bhzDLIEyWxNaDR1c6A` |
| 发出时间 | 2026-11-10T08:29:37Z |
| 回读 | `message +list --dir sent` 确认 from/to/subject/正文一致，`has_attachments=false` |
| 正文来源 | `ops/dispatch/inbox/gpt/REPORT-20261110-icp-filing-approved-and-status-doubao.md`（main `4f724472`），发出的字节与审阅的字节一致 |

## 一个必须记下的判断错误

我先前的结论「本机无邮件通道，只能落仓库目录」是错的。当时只查了 SMTP 凭据、`msmtp`/`mutt`/`mailx`/`sendmail` 和 Actions secrets，**漏掉了已登记的 Agent Mail（`agently-cli`）**——它一直装着、登录态有效、并且每天在用。

同一类错误还有一处：我查「有无 GPT 新派单」时只看了 `ops/dispatch/inbox/gpt/` 目录，没看邮箱，而 GPT 的裁决实际在 07:39 与 07:42 两封邮件里。以后判断「通道可用性」必须先枚举已登记通道再下结论，不能只测一个子集。
