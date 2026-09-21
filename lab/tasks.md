# LTZZZ 任务池

---

## 进行中

| ID | 任务 | 备注 |
|----|------|------|
| T022 | Gateway 通后再接 Scheduler 写 daily 摘要 | 不要颠倒。先巡查 dry-run（EXP-005），再写摘要 |
| T010 | 凭证制度 | Secret 只在 CF |

## 待办

| ID | 任务 | 备注 |
|----|------|------|
| T021 | 可选：R2 绑定 + Actions 上传 | Gateway 已用 GitHub raw；不必现配 |
| T023 | Daily Worker wrangler deploy | 主人 `npx wrangler deploy -c wrangler.daily.toml` |
| T012 | 支付宝权限恢复后小额测 | 等官方 |

## 完成

| ID | 任务 | 结果 |
|----|------|------|
| T020 | Memory Gateway 线上 | `/health` ok；r2_bound=false；`/file` 可读。EXP-004 |
| T019 | Memory Gateway + manifest 同步链路（代码） | worker + workflow + manifest 已进 main |
| T008 | 资金池架构文档 | finance/ |
| T005 | 首页实验室入口 | lab.html |
| T003 | 豆包 Worker | 2026-09-21 复测 `/health` ok=true has_key=true |
