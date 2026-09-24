# OAuth 端点（不要再改错）

主人 2026-09-22 已校准。AI 不得写回 `youtube-post` 或错误 callback。

## TikTok

| 项 | 值 |
|----|-----|
| Worker | `https://ltzzz-tiktok-post.ltzyz2181.workers.dev` |
| health | `GET /health` → has_key / has_secret / kv |
| 开始授权 | `POST /auth/start` （从创作实验室点，不要直打 callback） |
| 回调 | `GET /auth/callback` |
| 状态 | `POST /status` |
| 发布 | `POST /publish`（默认私密） |

## YouTube

| 项 | 值 |
|----|-----|
| Worker | **`https://ltzzz-youtube-upload.ltzyz2181.workers.dev`** |
| 错误名 | ~~ltzzz-youtube-post~~ 禁止再用 |
| 开始授权 | `GET /auth/youtube?return_to=` |
| 回调（Google Cloud 必填） | **`https://ltzzz-youtube-upload.ltzyz2181.workers.dev/oauth/youtube/callback`** |
| 错误回调 | ~~/auth/callback~~ 禁止 |
| 状态 | `GET /youtube/status` |
| 上传 | `POST /youtube/upload`（默认 private） |
| 断开 | `POST /youtube/disconnect` |

## 教训

1. 先查现网 Worker 名与路径，再改前端。
2. DEPLOYED ≠ VERIFIED；有 Secret ≠ OAuth 已成功。
3. 不要把另一个 Worker 的 path 套到这个 Worker 上。
