# Claude 按需审稿使用记录

owner 已澄清：退出五签不等于不能为 LTZZZ 工作。Claude 是外部工程/研究协作者，不恢复资金权限。

## 默认国内代执行

owner 随后选择使用 DeepSeek/豆包额度接管工作岗位；默认 Claude 登记模块现在是 scripts/call-claude-delegated.mjs。它不使用 ANTHROPIC_API_KEY，实际模型与费用属于国内提供者，不能记成 Anthropic 用量。详见 docs/DOMESTIC-GPT-CLAUDE-ROLES.md。下列原生通道只在另行手动选择时使用。

## 可选原生通道

GitHub Actions 使用既有 `ANTHROPIC_API_KEY` 调用官方 Anthropic API；不要求 Claude 网页通过云浏览器人机验证，不要求 Claude 自己持有 GitHub 写权限。执行器代存输出并记录实际模型。

历史原生 API 生成曾返回 `insufficient_api_credits`；模型目录 HTTP 200 只能证明认证/目录可访问，不能证明目前有生成额度。聊天订阅、API 余额、GitHub 权限分别核验，不把网页订阅当成免费 API 额度。

## 费用边界

- 默认 inspect：原生 `/v1/models` 目录查询，生成次数 0。
- owner 显式选择 review：同任务单号至多一次生成请求；输入最多 32000 字符、输出最多 1600 tokens，默认选目录中实际存在的 Haiku，再考虑 Sonnet。没有目录匹配的模型就阻塞，不猜模型名、不自动选 Opus。
- 先提交持久 claim，再调用；余额拒绝、限流、超时、截断均不自动重试购买。已存在任务必须保留，不能换单号来掩盖未知请求结果。
- 不自动充值、不新增付费 cron；本入口不改变日常 DeepSeek/豆包路由。
- 旧文件中的“单笔 1 USDT / 每日 2 USDT”没有在该原生 API 路线实现美元计价拦截，不能当作已生效保障。本入口实装的是次数和输入/输出上限；API 账单金额未独立读取时 `api_cost_usd=null`，不编造价格。
- API 算力费用、内部积分、链上工资分开。审稿回执始终记录无链上交易、无实际工资付款；生成请求可能消耗现有 API 余额。

## 记录和密钥

实际目录检查、任务 claim、模型与 token 用量、完整性状态及正文保存在 `knowledge/results/claude-review/`。只读目录检查不是一次真实 Claude 交付。

Key 由已有 GitHub Secret 注入，不打印任何 Key 片段，不要求 owner 发密码或验证码，不将旧公开 proxy 当作本入口。工作流不注入钱包、Safe、Cloudflare 部署或其他模型凭证。
