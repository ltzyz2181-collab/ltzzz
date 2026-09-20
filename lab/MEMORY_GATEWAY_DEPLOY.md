# Memory Gateway + 同步 · 部署清单

## 目标

```
GitHub (ltzzz-memory + lab 记忆文件)
        ↓  push / workflow 更新 manifest
Memory Gateway Worker（只读）
        ↓  /manifest /file /bundle
各 AI / 调度器读同一份记忆
```

可选：R2 作为副本（不配也能用 GitHub raw）。

## 已入库文件

| 文件 | 作用 |
|------|------|
| `memory-gateway-worker.js` | Gateway |
| `wrangler.memory-gateway.toml` | Wrangler 配置 |
| `tools/build-memory-manifest.mjs` | 生成 manifest |
| `ltzzz-memory/manifest.json` | 文件清单 + read_order |
| `.github/workflows/sync-memory.yml` | 自动刷新 manifest；可选 R2 |

## 你需要执行的一步（Worker 上线）

```bash
npx wrangler deploy memory-gateway-worker.js --name ltzzz-memory-gateway --compatibility-date 2026-09-16
```

成功后验收：

```text
https://ltzzz-memory-gateway.<你的子域>.workers.dev/health
https://ltzzz-memory-gateway.<你的子域>.workers.dev/manifest
https://ltzzz-memory-gateway.<你的子域>.workers.dev/file?path=ltzzz-memory/README.md
```

期望：`ok: true`；`/file` 返回 Markdown 正文。

## 可选 R2

1. Cloudflare 创建 R2 bucket（如 `ltzzz-memory`）
2. 创建 R2 API Token（读写该桶）
3. GitHub Secrets：`CLOUDFLARE_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`
4. `wrangler.memory-gateway.toml` 取消 `[[r2_buckets]]` 注释后重新 deploy
5. 再跑一次 workflow `Sync Memory Manifest`

## 状态语义

| 状态 | 含义 |
|------|------|
| 代码入库 | 本清单中的文件在 main |
| Gateway 在线 | `/health` 200 |
| 同步有效 | `/manifest` 含真实 files；`/file` 能读到内容 |
| R2 同步 | 仅当 Secrets 齐全且 workflow 绿 |
| 每日全员 AI 自动读 | **未包含**；需另接 Scheduler |

## 禁止

- 记忆文件写入私钥、支付 Secret
- 把 Gateway 当成可写的「AI 改资金」接口
