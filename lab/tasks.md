# LTZZZ 任务池

---

## 进行中

| ID | 任务 | 备注 |
|----|------|------|
| T010 | 凭证制度 | Secret 只在 CF |

## 待办

| ID | 任务 | 备注 |
|----|------|------|
| T026 | YouTube/TikTok OAuth + 人工确认后首条 private 上传 | 等主人授权，不默认 public |
| T021 | 可选：R2 绑定 + Actions 上传 | 视频大文件再配 |
| T012 | 支付宝权限恢复后小额测 | 等官方 |

## 完成

| ID | 任务 | 结果 |
|----|------|------|
| T027 | Webhook 部署入口 | webhook-deploy.yml + hooks/ 接收端；禁止发片/转账 |
| T025 | 视频结果流水线入库 | results/video；发布默认 waiting_human |
| T024 | wallet/ 账本 | 11 字段；出金须人工确认 |
| T022 | Gateway 通后再接 Scheduler 写 daily 摘要 | dry-run summary |
| T023 | Daily Worker wrangler deploy | dry_run=true · EXP-005 |
| T020 | Memory Gateway 线上 | r2_bound=false |
| T019 | Memory Gateway + manifest 同步链路（代码） | 已进 main |
| T008 | 资金池架构文档 | finance/ |
| T005 | 首页实验室入口 | lab.html |
| T003 | 豆包 Worker | `/health` ok |
