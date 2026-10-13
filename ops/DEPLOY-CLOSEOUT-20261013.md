# WEP3 / AGI Pay 部署收尾

本次范围：使用现有 Cloudflare 账户与 GitHub Pages，保留现有 KV、Durable Object 与密钥，不更换金库、不签名或发送链上交易。

- [ ] WEP3 和 AGI Pay 按现有配置部署到 `ltzyz2181.workers.dev`，健康检查通过。
- [ ] 修正 `agi-pay.html` 的旧地址，并使受保护 POST 可携带用户临时输入的 Bearer token；不把 token 存入源码或本地存储。
- [ ] `wep3.html` 当前只读取站内回执，没有旧 Worker base URL，保持其现有证据展示。
- [ ] 带 `X-Lab-Pin` 给一个 Agent 增加 0.01 内部信用，并检查所有 Agent 的 `spendable`。
- [ ] 复用现有豆包交付物、重新执行真实 HTTP 验证与 GPT 独立审计，完成 open intent → quote → match → slice（交付含 ltzzz.com）→ seal，检查 ledger / reputation。
- [ ] 获取 `/market/catalog`，确认 skills 报价和支付 rails 配置状态；配置就绪不等于付款成功。
- [ ] 推送 `main`，等待 GitHub Pages 发布成功并验证公网页面。

实施方式：修补现有前端与验收脚本，通过现有部署工作流读取已经配置的 GitHub Secrets；只在手动部署时进行本次信用与成交验收。沿用既有页面样式、结构和品牌，不做视觉重设计。
