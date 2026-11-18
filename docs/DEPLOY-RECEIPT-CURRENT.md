# 部署回执（Deploy Receipt）机制

目的：每一次部署都留一张可回读的回执，下一次任何人（任何席位）裁决同一件事时先读回执，不再从零重来。

## 用法

```bash
node scripts/deploy-receipt.mjs record <draft.json>   # 校验草稿并落 ops/deploy-receipts/<receipt_id>.json（自动算代码哈希，已存在则拒绝覆盖）
node scripts/deploy-receipt.mjs verify <receipt_id>   # 回读回执 + 按仓库当前代码重算哈希，检出部署漂移
node scripts/deploy-receipt.mjs latest [target]       # 某目标最近一张回执（下次裁决先跑这条）
node scripts/deploy-receipt.mjs list                  # 全部回执摘要
```

## 回执硬字段

`schema`(ltzzz.deploy.receipt.v1) / `receipt_id`(DR-YYYYMMDD-slug) / `target` / `platform` / `env_id` / `code_commit` / `code_path` / `deployed_at`(带时区 ISO) / `verified`(非空，每条含 kind+result+evidence) / `blockers` / `next_action`。

规则：
- 有任一 `verified` 不是 `ok`，必须写 `blockers` 和 `next_action`，不允许“部署成功”这种无证据结论。
- `record` 会对 `code_path` 下所有文件（跳过 node_modules）算 sha256 存进回执；`verify` 重算并报差异——代码改过但没重新部署，会直接暴露成漂移。
- 一次部署事件一张回执；新部署换新 `receipt_id`，不覆盖旧回执。
- 回执落盘后必须按 `config/email-authority-20261117.json` 的 `deployment_completion_report` 发出汇总邮件：包含 `receipt_id`、状态分层（draft/tested/merged/deployed/submitted/platform_accepted）、待裁决项和明确的“下一步做什么”询问；同一回执只发一次。该邮件属 L1，不等于 L3 生产部署授权。

## 与“勿重复清单”的分工

- 回执回答“这次部署到底做了什么、证据在哪、还差什么”；
- `docs/2026-11-16-已闭环事项登记与勿重复清单.md` 回答“这件事还要不要再做一遍”。
每次回执落盘后，在同一清单里补一行指向 receipt_id。

## 当前回执

- `DR-20261117-order-deliver`：order-deliver 已部署到 `shizhang-pay-d0g1n58020acf6b5b`，GREEN（详情回读 + 冒烟调用 + 配置回读三条证据）。
- `DR-20261117-miniprogram-frontend`：小程序前端（订单页退款兜底）已上传开发版 0.1.9，绑 `ca0ad10b8`，GREEN；**published=false**。已被下面这张取代（0.1.9 低于当时线上 0.1.12，直接提审会被判降级）。
- `DR-20261117-miniprogram-trial-review`：0.1.13 已上传（run 44038005496，source `e2400548e`）→ 后台设为体验版 → 已提交审核（0.1.13 审核中，预计 1-7 天），GREEN；**published=false** 仍成立（线上 0.1.12 未变，审核通过后才可点发布）。
- `DR-20261117-dispatch-channel`：桌面 Claude 派单通道（PR #412）已合入默认分支 `63a3bf41`，issue 表单与协议文档生效，GREEN（模板回读 + 标签回读 + 无自动化监听三条证据）。**无运行时服务部署，故无线上 smoke**；Phase 1 仍为 `BLOCKED_EVIDENCE`。
- `DR-20261117-mail-intake-phase2`：Gmail 摄入 Phase 2（PR #409）已合入默认分支 `63933f4e`，三层去重 / 裁决继承 / 只读正文 / append-only 状态修正生效，GREEN（PR 合并回读 + main CI deploy/offline 双 success + 定向测试 33/33 + 无 schedule + 文件回读五条证据）。**只到仓库态 deployed；submitted 与 platform_accepted 未发生**，`mail-intake-phase2.yml` 仍只在 `pull_request` 与 `workflow_dispatch` 触发，未启用任何定时运行。
- `DR-20261118-deep-superagent-liveness`：Deep 超级代理队列容错修复（PR #420）已合入 `af53df22` 并部署到 Cloudflare Worker，GREEN（部署工作流 success + 生产 health/auth 回读 + 定向测试 158/158 + 中转裁决证据四条）。**只到运行时 deployed；部署后的真实队列 run（submitted）与 platform_accepted 未发生**；Gmail 每日定时按中转裁决 Q2 保持关闭。
