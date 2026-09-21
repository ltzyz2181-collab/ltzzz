# LTZZZ 部署核查

最后核查：2026-09-21

## 1. GitHub / Pages

- 仓库：`ltzyz2181-collab/ltzzz`
- 入口：https://ltzzz.com/lab.html 、https://ltzzz.com/daily-patrol.html

## 2. Memory Gateway

- URL：https://ltzzz-memory-gateway.ltzyz2181.workers.dev/health
- 现网：`ok:true`，`r2_bound:false`，`sources:[github]`
- `/file` 可读 `ltzzz-memory/README.md`
- T020 标完成。无需再 wrangler deploy Gateway。

## 3. 豆包 Worker

- https://ltzzz-doubao-proxy.ltzyz2181.workers.dev/health
- 2026-09-21：`ok:true`，`has_key:true`，`model_configured:true`
- 本次未打真对话请求。

## 4. Daily Scheduler

- 代码入库：`ltzzz-daily-automation-worker.js` + `wrangler.daily.toml`
- 线上 Worker：https://ltzzz-daily-automation.ltzyz2181.workers.dev/health · **dry_run=true**
- GitHub 巡查：`.github/workflows/patrol-memory.yml` 写 patrol + **summary**（T022）
- 真模型调用：未开

## 5. 未部署

- R2 绑定
- Daily 真 AI 调用
- 支付 / 私钥 / 自动发片
