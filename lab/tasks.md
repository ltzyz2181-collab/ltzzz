# LTZZZ 任务池

---

## 进行中

| ID | 任务 | 备注 |
|----|------|------|
| T010 | 凭证制度 | Secret 只在 CF |

## 待办

| ID | 任务 | 备注 |
|----|------|------|
| T021 | 可选：R2 绑定 + Actions 上传 | 不必现配 |
| T012 | 支付宝权限恢复后小额测 | 等官方 |

## 完成

| ID | 任务 | 结果 |
|----|------|------|
| T022 | Gateway 通后再接 Scheduler 写 daily 摘要 | dry-run：patrol 读 Gateway/Daily `/health`+`/manifest`，写 `memory/daily/summary-YYYY-MM-DD.md`。不塞 Key、不调模型、不配 R2 |
| T023 | Daily Worker wrangler deploy | https://ltzzz-daily-automation.ltzyz2181.workers.dev/health · dry_run=true · EXP-005 |
| T020 | Memory Gateway 线上 | `/health` ok；r2_bound=false。EXP-004 |
| T019 | Memory Gateway + manifest 同步链路（代码） | 已进 main |
| T008 | 资金池架构文档 | finance/ |
| T005 | 首页实验室入口 | lab.html |
| T003 | 豆包 Worker | `/health` ok |
