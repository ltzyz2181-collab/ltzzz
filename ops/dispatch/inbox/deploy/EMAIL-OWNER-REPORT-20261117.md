# EMAIL-OWNER-REPORT-20261117

| 字段 | 值 |
|---|---|
| Task ID | `EMAIL-OWNER-REPORT-20261117` |
| decision_id | `GPT-LTZZZ-AUTONOMY-RULING-20261117-01` |
| 授权级别 | L2（信息通知 / 裁决派发），允许自动发送；不含任何 L3 动作 |
| 发件 | `qingqizhu6502@agent.qq.com`（已登记 Agent Mail；不得冒充 owner 或其他 AI） |
| 收件 | `ltzyz2181@gmail.com` |
| 主题 | `【LTZZZ】2026-11-17 部署汇总与待裁决清单（R1-R6）` |
| 正文 | `docs/2026-11-17-部署汇总与待裁决-邮件稿.md`（按纯文本发送，不作为附件） |

## 执行要求

1. 用现有 `agently-cli message +send` 两段式发送；若首次返回 `confirmation_token`，带 token 重发，不得盲发。
2. 发送后从 `sent` 目录回读，核对 `to`、`subject`、`message_id`、时间与结果。
3. 回执写到 `ops/mail-receipts/MR-20261117-owner-report.json`，至少含 `message_id`、`thread_id`（可得时）、`sent_at`、`result`、`body_sha256`。
4. 结果未知先查原线程，不重复发送；失败照实记 `failed_or_uncertain`，不得写成已送达。
5. 正文不得加入密码、应用专用密码、私钥、Secrets、客户敏感资料或 openid 明文。
6. 本任务只发邮件，不做生产部署、不改配置、不执行资金/签名动作。

## 验收

- `sent` 回读可见收件人 `ltzyz2181@gmail.com` 与上述主题；
- 回执文件落盘且字段完整；
- 若未发出，保留失败证据并在回执写明 `next_action`。
