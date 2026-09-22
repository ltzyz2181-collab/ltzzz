# OAuth → 授权 → Token → 发布

```
OAuth 开始
  ↓
人工授权（浏览器）
  ↓
code 换 Token（Worker 服务端存 KV）
  ↓
真实发布 API
  ↓
默认 private / 隐私
  ↓
公开：另需人工确认（不自动 public）
```

## 现网 Worker

| 平台 | Worker | 授权 | 发布 |
|------|--------|------|------|
| YouTube | `ltzzz-youtube-upload` | `GET /auth/youtube` | `POST /youtube/upload` 默认 private |
| TikTok | `ltzzz-tiktok-post` | `POST /auth/start` → 跳转 | `POST /publish` 默认 privacy=1 |

Token **只存 Cloudflare KV**，不进 Git、不进 localStorage。

## Secrets（Dashboard 填，勿发聊）

**YouTube**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

**TikTok**
- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`

## 人工步骤

1. 开发者控制台配好回调 URL（与 Worker 一致）
2. 浏览器走授权，完成后 Token 进 KV
3. `GET .../youtube/status` 或 TikTok `/status` 确认 connected
4. 上传：仅 private；要 public 必须你明说「公开」
5. 记录 RESULT：video_id / publish_id

## CAND-20260922-OAUTH

已人工确认：允许 OAuth→Token→**私密级**真实发布；禁止无确认自动 public。
