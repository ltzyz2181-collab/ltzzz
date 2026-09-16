# DeepSeek 使用记录与预算模块

> 状态：规范已定；DEEPSEEK_API_KEY 待配置（只进 Cloudflare Secret）。

## 记录字段

| 字段 | 说明 |
|---|---|
| 任务 | 关联任务（LTZZZ-*） |
| 时间 | UTC ISO |
| 模型 | 官方当前可用模型（以文档为准，不以名称假设） |
| 输入/输出 tokens | 用量 |
| 成本 | 按官方定价估算（RMB/USD） |
| 结果 | ok / failed / quota / timeout |

## 存储

- 账本：`finance/ledger/deepseek-usage.jsonl`
- 预算联动：`finance/budgets.md` 的 DEEPSEEK-BUDGET = 20 RMB；80% 预警、100% 停付。

## 安全

- DEEPSEEK_API_KEY 只进服务器 Secret；日志掩码。

## 待办

- [ ] 用户配置 DEEPSEEK_API_KEY（Cloudflare Secret）
- [ ] 部署/复用 ltzzz-deepseek-proxy Worker
- [ ] 首次调用记录（预算内）
