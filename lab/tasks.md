# LTZZZ Tasks · 任务清单（Task Center 入口）

> 新任务先走 `lab/TASK_DISCOVERY.md` 防重复；任务完成条件：Result Center 出现真实结果并完成验证（见 `tasks/README.md`、`results/RESULT_CENTER.md`、`data/results/`）。

## 六通道每日任务（触发 = GitHub Actions cron + 各 AI API 脚本，不是 AI 自己每天来）

权威规则：`protocol/ltzzz-daily-automation.md`、`ltzzz-daily-automation-worker.js` 的 `TASK_TABLE`、`knowledge/daily/README.md`、`data/tasks/daily-tasks.json`、`.github/workflows/daily-agent-tasks.yml`。
落盘：`data/memory/<agent>.json`（当日 entry）+ `data/results/YYYY-MM-DD.json` + `data/reports/latest.md`；历史 markdown 见 `knowledge/daily/<channel>/`。

| 通道 | AI | 每日任务 | 触发 |
|---|---|---|---|
| gpt | GPT | 规划并记录一条任务；对记忆/任务模板做小修订 | OPENAI_API_KEY + 定时脚本 |
| doubao | 豆包 | 阅读仓库整理一次；产出一份视频脚本草稿 | DOUBAO_API_KEY（Agent Plan） + 定时脚本 |
| grok | XAI/Grok | 1 条「装备论 × 心理健康」作用；维护 App/Web3 代码 | XAI_API_KEY + 定时脚本 |
| claude | Claude | ≥50 字小说片段，逐日连载 | ANTHROPIC_API_KEY + 定时脚本 |
| deepseek | DeepSeek | 中华传统文化 × 装备论 异同 1 条 | DEEPSEEK_API_KEY + 定时脚本 |
| microsoft | Microsoft Copilot | 西方文化 × 装备论 异同 1 条 | **未部署**（Copilot API 面向企业 M365，等确认方案） |

## 进行中任务

- TASK-20260928-001（本轮部署）：落地 JSON 持久化系统（data/ 记忆/任务/结果/销售/资产/报告 + 6 调用脚本 + daily-agent-tasks 工作流 + dashboard）并部署 GitHub Pages —— 状态：done，见 `data/results/2026-09-28.json`。
- 六通道任务 —— 状态：deployed（微软 deferred），待 Secrets 配置后手动触发验证。

## 待办（来自 TODO-PENDING-AI.md）

1. YouTube 每日 9 点公开发布第一支视频（主题：AI时代普通人的尊严），先验证 OAuth Token 有效性并手动触发一次。
2. 微信小店认证通过后上架产品、打通视频号；TAOBAO_TOKEN 就绪后跑 `coze-taobao-sync.js` 同步 10 个产品到淘宝/抖店。
3. 所有 AI 引流链接统一指向 `https://ltzzz.com/products.html`。

## 历史

- `tasks/daily/2026-09-17.md`、`tasks/agent-payment-and-publish.md`、`tasks/xai-web3-polish-20260923.md`、`tasks/microsoft-review-2026-09-16.md`、`tasks/cloud-auto-queue-video-publish.md`
- 执行记录：`results/executions/`
