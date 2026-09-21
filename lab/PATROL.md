# GitHub Actions 每日定时巡查

文件：`.github/workflows/patrol-memory.yml`

## 触发

| 方式 | 时间 |
|------|------|
| 定时 cron | 每日 UTC 00:00 = 北京 08:00 |
| 手动 | Actions → Patrol Memory Gateway → Run workflow |

## 做什么

- 拉 Memory Gateway `/health`、`/manifest`
- 拉豆包 `/health`
- 写入 `memory/daily/patrol-YYYY-MM-DD.md` 并提交
- **不** 调上游 AI，**不** 用 Key，**不** 上 R2

## 主人要确认一次

1. 仓库 Settings → Actions → General → Workflow permissions = **Read and write**
2. Actions 页能看到 **Patrol Memory Gateway**
3. 点 **Run workflow** 跑第一次（定时任务第一次推送后不会马上跑）

## 不是这个 workflow 的事

- Cloudflare Daily Worker cron：仍需 `npx wrangler deploy -c wrangler.daily.toml`
- `sync-memory.yml`：只在记忆文件 push 时刷 manifest，不是每日巡查
