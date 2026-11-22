# 席位邮件线程化（P4）

Task ID: `AGENT-PROACTIVE-WAKE-20261121-01`
Issue: #529（P4 段）

## 解决的问题

此前 `mail:send` 卡片只能发一封孤立邮件：

- 回信不会接进原线程（缺 `In-Reply-To` / `References`）
- 没有 message_id 台账，无法证明「这封信到底发没发、发的是哪一封」
- 标签移除失败或重复触发时会重发同一封

## 现在怎么做

卡片在原有 `seat` / `to` / `subject` 之外，可再加三个可选字段：

```
seat: desktop-gpt
to: ltzyz2181@gmail.com
subject: Re: 裁决
in_reply_to: <179531103481.2448.10197323430082319077@qq.com>
references: <root@x> <parent@x>
dedupe_key: PAYOUT-SIGNER-DEPLOY-PLAN-20261121-01

---
正文
```

| 字段 | 作用 |
|---|---|
| `in_reply_to` | 写入 `In-Reply-To`，并自动补到 `References` 末尾 |
| `references` | 已有线程链，空格或逗号分隔 |
| `dedupe_key` | 24h 内同键不重发 |

## 台账

`knowledge/results/seat-mail/ledger.json`，schema `ltzzz.seat-mail.ledger.v1`：

```json
{
  "ts": "2026-11-21T01:30:00.000Z",
  "dedupe_key": "PAYOUT-SIGNER-DEPLOY-PLAN-20261121-01",
  "issue": 587,
  "seat": "desktop-gpt",
  "to": "ltzyz2181@gmail.com",
  "subject": "...",
  "smtp_message_id": "<179531103481.2448.10197323430082319077@qq.com>",
  "imap_message_id": null,
  "in_reply_to": null,
  "references": [],
  "body_sha256": "..."
}
```

- `smtp_message_id`：我方发送回执里的 Message-ID。
- `imap_message_id`：对方回信头里的 Message-ID，**单独记，不覆盖前一个**。
- 上限 500 条，超出丢最旧的。

## 去重规则（fail-closed 方向）

同一条目在 24h 内命中任一条件即视为重复，直接跳过并在卡上回 `[mail-skipped-duplicate]`：

1. 同一 `dedupe_key`
2. 同一收件人 + 同一主题 + 同一正文 sha256

第 2 条是为了兜住「信已发、标签没删掉」这种半失败状态。

## 读回

`scripts/autoloop-mail.py read` 一直用 `BODY.PEEK[HEADER.FIELDS ...]` 只读方式抓头，
不标记已读、不删除、不移动；本轮未改动该行为。

## 边界

- 本脚本只做运输，不做裁决。资金 / 退款终态 / 签名 / 私钥 / 钱包 / 凭据类内容仍由 GPT 决策席处理。
- 正文、收件人、主题都会进仓库台账（`knowledge/results/seat-mail/`），因此禁止在邮件正文里放密码、私钥、授权码。
