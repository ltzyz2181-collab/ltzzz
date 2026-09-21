# Webhook 部署

## 已经自动发生的

`main` 一有 push，`pages.yml` 就会发 GitHub Pages。这就是站点 webhook/CI 部署。

## 新增：外部触发

工作流：`.github/workflows/webhook-deploy.yml`

允许的 `action`：`ping` · `patrol` · `record-result` · `deploy-pages`  
禁止：`publish` · `pay` · `withdraw` · `transfer`

### 用 GitHub repository_dispatch（推荐）

仓库 Settings → Secrets → Actions → 建 `PERSONAL`/`PAT` 仅用于你本机 curl（不要提交）。

```bash
curl -sS -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer YOUR_PAT" \
  https://api.github.com/repos/ltzyz2181-collab/ltzzz/dispatches \
  -d '{"event_type":"ping","client_payload":{"action":"ping"}}'
```

或 Actions → **Webhook Deploy** → Run workflow。

跑成功后 `results/hooks/` 会出现一条日志。

### 可选：Cloudflare 接收端

```bash
npx wrangler deploy -c wrangler.webhook.toml
npx wrangler secret put WEBHOOK_SECRET -c wrangler.webhook.toml
```

然后：

```bash
curl -sS https://ltzzz-webhook.ltzyz2181.workers.dev/health
curl -sS -X POST https://ltzzz-webhook.ltzyz2181.workers.dev/hook \
  -H 'content-type: application/json' \
  -H 'x-ltzzz-secret: YOUR_SECRET' \
  -d '{"action":"ping"}'
```

该 Worker **不会**调 YouTube/TikTok，也**不会**转账。
