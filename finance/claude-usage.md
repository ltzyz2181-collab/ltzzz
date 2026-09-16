# Claude 使用与支付记录模块

> 状态：规范已定；CLAUDE_API_KEY 待配置（只进 Cloudflare Secret）。

## 记录字段

| 字段 | 说明 |
|---|---|
| 任务ID | 关联任务（LTZZZ-*） |
| 时间 | UTC ISO |
| 模型 | claude-*（以官方实际可用模型为准） |
| 输入/输出 tokens | 用量 |
| 成本 | 按官方定价估算（USD） |
| 状态 | ok / failed / quota / timeout |
| PAY-ID | 如产生费用则关联 |

## 存储

- 账本：`finance/ledger/claude-usage.jsonl`（每行一条 JSON，不含 Key）。
- 汇总：Claude 余额/用量/成本/调用次数（每次调用后更新）。

## 预算

- 第一阶段：单笔 ≤ 1 USDT / 日 ≤ 2 USDT（与 Payment Gateway 一致）。
- 超额自动停止。

## 安全

- 银行卡信息/支付密码不写入任何代码或仓库。
- CLAUDE_API_KEY 只进服务器 Secret；日志掩码（保留前后 3 位）。
- 准备的小额测试任务：`LTZZZ 视频选题价值判断`（1 次调用，预计 <0.01 USD）。

## 待办

- [ ] 用户配置 CLAUDE_API_KEY（Cloudflare Secret）
- [ ] 部署 ltzzz-claude-proxy Worker（沿用现有 proxy 框架）
- [ ] 执行小额测试任务并记录
