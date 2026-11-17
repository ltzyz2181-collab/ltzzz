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

## 与“勿重复清单”的分工

- 回执回答“这次部署到底做了什么、证据在哪、还差什么”；
- `docs/2026-11-16-已闭环事项登记与勿重复清单.md` 回答“这件事还要不要再做一遍”。
每次回执落盘后，在同一清单里补一行指向 receipt_id。

## 当前回执

- `DR-20261117-order-deliver`：order-deliver 已部署到 `shizhang-pay-d0g1n58020acf6b5b`，GREEN（详情回读 + 冒烟调用 + 配置回读三条证据）。
