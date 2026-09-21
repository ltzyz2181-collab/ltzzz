# LTZZZ OS 部署（R2 + Cron + Snapshot）

代码已进 main。现网打开仍要两步（人类按钮）：

1. Actions → **Memory OS State** → Run workflow  
   写出 `memory/state/STATE-YYYYMMDD.md` + `CURRENT.json`

2. Actions → **Deploy Memory OS (R2 + Daily cron + Engine)** → Run workflow  
   需 GitHub Secrets：`CLOUDFLARE_API_TOKEN` · `CLOUDFLARE_ACCOUNT_ID`  
   可选 R2 上传：`R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` · `R2_BUCKET=ltzzz-memory`

或本机：

```bash
npx wrangler r2 bucket create ltzzz-memory
npx wrangler deploy -c wrangler.memory-gateway.toml
npx wrangler deploy -c wrangler.memory-engine.toml
npx wrangler deploy -c wrangler.daily.toml
```

验证：

- Gateway `/health` 应出现 `r2_bound: true`
- Engine `/health` · `/snapshot` 应带 `memory_id`
- Daily `/health` 仍可 `dry_run:true`（无 Key 时不假装写稿）
