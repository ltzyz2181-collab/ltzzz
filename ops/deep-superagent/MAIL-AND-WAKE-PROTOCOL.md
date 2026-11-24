# 邮件收发与部署唤醒协议（owner 2026-11-24 定）

> owner 原话要点：**必须邮件收发**；有部署任务，要**用邮件或其他方式唤醒其他 AI 协调部署**，不能老卡壳。
> 本文件是执行纪律，不是建议。与 `DAILY-RECEIPT-CONTRACT.md` 同级；冲突时以本文件对"发没发"的判定为准。

## 1. 收发是硬指标，不是可选项

- 业务日必须有**至少一封主通道外发**（Agent Mail `qingqizhu6502@agent.qq.com`）。旁路（Gmail SMTP 自寄、Issue 评论、站内消息）只能记为 `fallback_only`，**不得**写 `delivered`。
- 主通道当天未发出即视为当日交付失败：日回执 `email.status` 只能是 `failed` 或 `fallback_only`，并在邮件/回执里写明断点与影响。
- 收件同样是硬指标：`seat:` 前缀邮件到达后 **24 小时内**必须读正文并在同一线程回复 ACK 或结论；未读的席位邮件要进日回执 `mail_unhandled`，不能静默。

## 2. 部署任务必须有唤醒信封（wake envelope）

只要存在部署/发布/环境变更任务，发出方必须按以下字段唤起目标席位，缺字段视为未发出：

```
task_id:       原任务号（沿用，不新建）
commit_sha:    要部署的 source commit（不得只写分支名）
target_env:    prod / staging / worker 名
required_action: 需要对方做的唯一动作（deploy / smoke / sign / verify）
evidence_url:  可核验链接（run、PR、issue、bundle）
deadline_utc:  期望完成时间（必须给具体时刻）
fallback_channel: 主通道失败时的替代路径（issue 评论 / 站内 relay / owner 直连）
status_tag:    [NEEDS_DEPLOY] / [NEEDS_SMOKE] / [NEEDS_SIGN]
```

## 3. 唤醒通道优先级

1. 目标席位**项目邮箱**（Agent Mail 别名或 seat 地址）；
2. GitHub Issue 评论并 `@` 对应 seat 标签（保留 task_id）；
3. 站内 relay（仅在前两者不可达时，且要在回执标明降级）。

## 4. 不得静默等待（SLA）

- 部署类唤醒发出后 **2 小时**无回执：重发一次并在邮件里点名，同时写 `wake_retry_1`。
- **6 小时**仍无回执：升级 owner，并在 GitHub Issue 留 `[blocked-wake]` 证据。
- 对方席位不可用（relay 关闭、无邮箱、OAuth 失效）必须显式写 `unavailable`，并给替代路径；**不得**把"没发出去"写成"对方未响应"。

## 5. 判定口径（防自欺）

- "已判定" ≠ "已完成"；"已派单" ≠ "已执行"；"旁路成功" ≠ "主通道已发"。
- 任何"已部署"必须有同 source SHA 的线上回读（health / version / smoke）；没有则写 `DEPLOYED_BUT_NOT_SMOKE_VERIFIED`。
- 回执三计数 `writes_performed / merges_performed / deploys_performed` 必须与实际动作一一对应，禁止估值。

## 6. 每日常规检查（并入 06:45 巡检）

1. `agently-cli auth status` 是否 valid；invalid_grant → 立即走重授权并停用旁路冒充。
2. 发件箱是否有当日主通道邮件（无 → 当日判 failed，补发后改回）。
3. 是否存在未读 `seat:` 邮件超 24h（有 → 进 `mail_unhandled`）。
4. 是否存在部署任务未发唤醒信封（有 → 立即补齐并记录）。
