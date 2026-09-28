# LTZZZ 每日报告 · 2026-09-28（部署日 + 本地 dry-run）

## 本次做了什么

- 落地 JSON 持久化系统：`data/memory/`（6 个 AI 记忆文件）+ `data/tasks/daily-tasks.json` + `data/results/` + `data/sales/leads.json` + `data/assets/balances.json` + `data/reports/latest.md`。
- 新增 `scripts/run-daily-tasks.mjs` 与 6 个调用脚本（openai / doubao / deepseek / grok / claude / microsoft 占位）。
- 新增 GitHub Actions 工作流 `.github/workflows/daily-agent-tasks.yml`（每日 UTC 00:00 = 北京 08:00 + 手动触发）；密钥只走 GitHub Secrets，不写入代码、不发给任何 AI。
- 新增展示页 `dashboard.html`（记忆 / 任务 / 结果 / 销售 / 资产 / 报告；GitHub Pages 只展示，不承担计算）。
- 修复 Pages 构建断点：补回 `scripts/build-daily-data.js`（此前缺失导致 pages.yml 每次 push 失败）；前端日期保持 09-22 不变。
- 微软席按用户指示**不部署**（results 记 skipped，等待确认执行方案）。

## 各 AI 状态（本地 dry-run，无 Key 时的诚实记录）

| AI | 状态 | 产出预览 |
|---|---|---|
| gpt | not_configured | 无 API Key，未调用（dry-run） |
| doubao | not_configured | 无 API Key，未调用（dry-run） |
| grok | not_configured | 无 API Key，未调用（dry-run） |
| claude | not_configured | 无 API Key，未调用（dry-run） |
| deepseek | not_configured | 无 API Key，未调用（dry-run） |
| microsoft | skipped | 按用户指示暂不部署（Copilot API 面向企业 M365） |

> 首次真实调用待 GitHub Secrets 配置后在 Actions 手动/定时触发；届时本报告由 `run-daily-tasks.mjs` 自动覆盖为真实结果。

## 需要用户操作

- [ ] 确认 GitHub Actions Secrets：`OPENAI_API_KEY` / `DOUBAO_API_KEY` / `DEEPSEEK_API_KEY` / `XAI_API_KEY` / `ANTHROPIC_API_KEY`（豆包用 Agent Plan Key，模型 doubao-seed-evolving）
- [ ] 确认微软席执行方案：A. 委托 GPT/Claude 执行（results 标注 executed_by）；B. 申请 Microsoft 365 Copilot API
- [ ] 确认销售系统定义：卖什么 / 线索来源 / 展示指标
- [ ] 确认资产系统定义：钱包 USDT（链上 or 手动）/ 域名 / 成本

## 下一步

- 在 Actions 页手动触发一次 `Daily Agent Tasks` 验证六通道（不含微软）真实调用与结果落盘。
- 前端日期如需更新：`node scripts/build-daily-data.js` 会按最新 results/daily 重生成。
