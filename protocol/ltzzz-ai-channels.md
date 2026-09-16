# LTZZZ AI 通道 · GPT + DeepSeek

> 状态：接口规范与 Worker 代码已就绪；API Key 与部署待人工授权。
> 重要：ChatGPT 网页订阅与 OpenAI API 是**独立计费体系**，网页会员不能当 API 用，必须单独申请 OpenAI API Key（或兼容网关 Key）。

## 1. GPT 通道

- Worker：`ltzzz-gpt-proxy`（代码 ltzzz-gpt-proxy-worker.js）
- 接口：
  | 接口 | 方法 | 说明 |
  |---|---|---|
  | /chat | POST | {model, messages, max_tokens?} → 返回回复 |
  | /status | POST | 通道状态（Key 已配置/未配置、余额模式） |
  | /health | GET | 存活 |
- 密钥：OPENAI_API_KEY（或 OPENAI_BASE_URL + OPENAI_API_KEY）只放 Cloudflare Secret，不入仓库/前端/日志。
- 用量：每次调用回写用量日志（model/tokens/费用估算/时间/task_id）。

## 2. DeepSeek 通道

- Worker：`ltzzz-deepseek-proxy`（代码 deepseek-proxy-worker.js，沿用仓库现有框架）
- 接口：/chat /status /health（同 GPT）
- 密钥：DEEPSEEK_API_KEY 只放 Cloudflare Secret。
- 优先使用官方最新 API（DeepSeek-V3 等官方可用模型）；不以"Flash"为假设，以官方文档实际模型名为准。
- 独立预算：见 finance/budgets.md（DEEPSEEK-BUDGET = 20 RMB）。

## 3. 预算与用量（任务五）

- DOUBAO-BUDGET = 20 RMB（豆包）
- DEEPSEEK-BUDGET = 20 RMB（DeepSeek）
- 测试阶段任何自动付款不得超过预设金额；超额自动停止并 waiting_approval。
- 每笔调用记录：时间/模型/输入tokens/输出tokens/估算费用/累计/剩余。

## 4. 安全红线

- API Key 只进服务器 Secret / 密钥管理系统。
- 不写入：网页、GitHub、日志明文、聊天记录、AI 上下文。
- 日志对 Key 一律掩码（保留前后 3 位）。
