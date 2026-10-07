# 最小自动化闭环（部署说明）

目标：少人工、可 cron。

## 已有
- daily-automation worker（多通道，含 xia）
- x-lead-scan.mjs
- x.ltzzz.com poster（等 credits）
- economy worker 实验 POST

## 必须跑通的 3 条（豆包执行）
1. **每日 22:00 CST** `daily-3nums` 写入（空也写「未测」）
2. **每日 1 次** `node scripts/x-lead-scan.mjs` → `knowledge/results/YYYY-MM-DD-x-lead-scan.md`（0 条也落盘）
3. **每周一** `scripts/weekly-memory-digest.mjs`（见下）合并上周 results

## 人工仅保留
- owner 大额/个人 AAVE 授权
- X credits 绑卡（平台墙）
