# 实验：Daily cron 巡查 dry-run

- **ID：** EXP-005
- **日期：** 2026-09-21
- **状态：** 进行中

## 观（为什么做）

确认调度会响、日志诚实。不在无 Key 时假装六 AI 真在写稿。

## 行深（假设）

代码已在 `ltzzz-daily-automation-worker.js`。无 Key / 无 R2 时必须 `dry_run=true`。

## 实验（做了什么）

- 代码入库：`wrangler.daily.toml` 六条 UTC cron
- 静态说明页：`daily-patrol.html`
- GitHub Actions 巡查：`.github/workflows/patrol-memory.yml`（拉 Gateway，不调上游 AI）
- **Daily Worker 线上 wrangler deploy：仍需主人本机执行**

## 结果（可核对）

- 数据 / 链接：尚无 Daily Worker `/health`（等主人 deploy）
- 是否达预期：部分达标（文档+巡查页+工作流已入库；Worker 未标完成）

## 下一步

主人：

```bash
npx wrangler deploy -c wrangler.daily.toml
```

贴 `/health` 与 `/run?task=gpt-daily` 后把本卡改为「有结果」。

## 关联

- 任务 ID：T022（Gateway 已通后的下一步是接 Scheduler 写摘要，不是先上真 AI）
- 资产：daily-patrol.html
