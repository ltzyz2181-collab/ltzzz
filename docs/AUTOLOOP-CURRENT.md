# 每日自动循环（autoloop）当前状态

更新时间：2026-11-19（Owner 放开执行限制）
任务：`TASK-HUB-AUTOCLAIM`
裁决依据：`config/owner-authority-20261119-open-execution.json`

## 它做什么

`.github/workflows/daily-autoloop.yml` 每天 01:10Z / 13:10Z（另可手动触发）跑一次：

过期租约 reap → 领取派单卡 → 跑登记过的执行器 → 自动开 PR → 判定能否合并 → 合并后回读部署
→ 写回执 → 读项目邮件头部 → 发汇总邮件。

回执落在 `knowledge/results/autoloop/run-<run_id>.json` 和 `digest.txt`。

## 现在的边界（2026-11-19 起）

只有下面这些仍归 GPT 决策席，其他一律自动执行：

资金、付款、放款、转账、退款终态、签名、私钥、助记词、钱包操作、五签 Safe、凭据与密钥。

这类卡片不会被执行：autoloop 评论 `[gpt-decision-request]` 并打 `gpt:decide` 标签，
等 GPT 给出 decision_id 后重新打标。其余卡片按标签直接执行、合并、部署。

## 为什么它不会乱跑

1. **Issue 正文永不执行。** 正文只是不可信输入，不参与命令构造。
2. **必须显式打标。** 卡片要带 `autoloop:exec:<executor-id>`，且该 id 必须在
   `ops/autoloop/executors.json` 登记；否则跳过。
3. **合并要有证据。** CI 任一检查失败即拒绝；分支完全无检查时，必须执行器自带
   `verify` 跑通才合并。没有任何证据的 PR 保持开启。
4. **部署要回读。** 合并后按 merge commit 的 `head_sha` 查 `deploy*` 工作流；
   没查到就记 `no_deploy_workflow_matched`，不写成已部署。
5. **中转可裁决。** `autoloop:adjudicate` 走 relay 席，非保留事项由它直接裁决；
   保留事项在进 relay 前就被拦下并转 GPT。
6. **否定句不误伤。** 「本卡不涉及资金、签名」这类免责句在扫描前剔除。
7. **邮件不是门禁。** 发信失败只记录状态，不阻断任务。

## 现有标签

| 标签 | 作用 |
|---|---|
| `dispatch` | 派单卡识别（沿用 task-hub 约定） |
| `autoloop:exec:task-hub-status` | 执行 `task-hub status` 快照，不自动合并 |
| `autoloop:exec:oversight-merge` | 重算 warning 归并快照，可自动合并 |
| `autoloop:adjudicate` | 转 relay 席裁决（非保留事项具约束力） |
| `gpt:decide` | 保留事项已上抛 GPT，等待裁决 |
| `mail:send` | 交给席位邮件中继代发，见 `scripts/seat-mail.mjs` |
| `no-autoloop` / `human-only` | 显式排除 / 强制上抛 GPT |
| `seat:<seat>` | 席位归属；无人指派时 autoloop 先补自己的席位标签再领取 |

## 席位互相发邮件

任何席位开一张带 `mail:send` 标签的卡，正文写：

```
seat: <发件席位>
to: <收件人>
subject: <主题>
---
<正文>
```

`.github/workflows/seat-mail.yml` 每 30 分钟发一次并回执 `[mail-sent]`，
成功后自动摘掉标签。席位不需要各自持有 SMTP 凭据。

## 已验证到哪一步

- run 44450688124：领取 #448 → PR #449 自动合并 → 回执落 main → 邮件 read=ok / send=sent。
- run 44450088196：PR #446 自动合并（执行器 verify 通过、分支无检查）。
- **未验证**：schedule 首次定时触发；合并后 deploy run 回读的真实结果。

## 已知边界

- 分支上多数工作流会停在 `action_required`，`check_runs` 经常为 0；这不是绿灯，
  只是静默，按第 3 条处理。
- 邮箱读取是 Gmail 全箱头部（`BODY.PEEK`，只读、不标记已读），按项目规则过滤后
  才计入回执；非项目邮件不取正文、不写项目记录。
- 生产部署放开的是「仓库内改动经合并后由既有 deploy 工作流执行」，不等于外部平台
  审核通过，也不等于缺少私钥的签名可以完成。
