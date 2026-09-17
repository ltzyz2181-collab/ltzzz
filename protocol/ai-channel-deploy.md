# LTZZZ AI 通道部署记录（2026-09-17）

| Worker | 域名 | Secret | 状态 |
|---|---|---|---|
| ltzzz-gpt-proxy | https://ltzzz-gpt-proxy.ltzyz2181.workers.dev | OPENAI_API_KEY | ✅ 已部署+已配置 |
| deepseek-proxy | https://deepseek-proxy.ltzyz2181.workers.dev | DEEPSEEK_API_KEY | ✅ 已部署+已配置 |
| claude-proxy | https://claude-proxy.ltzyz2181.workers.dev | ANTHROPIC_API_KEY | ✅ 已部署+已配置 |

接口约定（与 protocol/ltzzz-ai-channels.md 一致）：
- gpt-proxy：POST /chat、POST /status、GET /health
- deepseek-proxy / claude-proxy：POST 转发（model + messages），CORS 已开

密钥只存于 Cloudflare Secret，不落仓库/前端/日志。云 VM 无法直连 workers.dev 在线验证，部署与 Secret 均通过 Cloudflare API 确认（wrangler deploy / secret put 返回 Success）。
