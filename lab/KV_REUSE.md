# KV 方案 B

复用已有命名空间 `63c6bb670cfc42b18b4d232605d5bcad`（YouTube/TikTok 同一个）。

| binding | 前缀 | Worker |
|---------|------|--------|
| LTZZZ_ASSETS_KV | `asset:` | ltzzz-t026-video-assets |
| LTZZZ_SETTLEMENT_KV | `withdraw:` | ltzzz-auto-withdraw |

出金 `AUTO_TEST_MODE=true`，不真打款。

验收：

```bash
curl -sS https://ltzzz-t026-video-assets.ltzyz2181.workers.dev/health
curl -sS https://ltzzz-auto-withdraw.ltzyz2181.workers.dev/health
```
