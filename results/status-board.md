# Status Board · 2026-09-22

| 模块 | 状态 | 说明 |
|------|------|------|
| TikTok /health | 🟢 VERIFIED | has_key/secret/kv true |
| TikTok OAuth | 🟠 BLOCKED→试连接 | 须从 creator-lab 走 /auth/start |
| YouTube 前端旧 URL | 🔴 FIXED | 曾指向错误的 `ltzzz-youtube-post` + `/auth/callback` |
| YouTube 正确 Worker | 🟡 DEPLOYED | `ltzzz-youtube-upload` · `/auth/youtube` · `/oauth/youtube/callback` |
| creator-lab 完整 UI | 🟠 BLOCKED | 误覆盖后暂用精简页；连接逻辑已可用 |

## Google Cloud 必改

Authorized redirect URI:

```
https://ltzzz-youtube-upload.ltzyz2181.workers.dev/oauth/youtube/callback
```

不要用 `ltzzz-youtube-post` 或 `/auth/callback`。
