# Cloud Hub 网关部署回执 · 2026-10-20

## 目标
给云端豆包席位一个统一的鉴权提交入口：把「本机已产出的成片」送进 R2 队列，由 video-scheduler 的 cron 发布到 YouTube 并公开核验。

## 本次交付（已推送 main，部署 run 39436499473 success）
- `ltzzz-cloud-hub-worker.js`：任务 CRUD（KV，状态机 queued→running→success/failed/waiting_approval/cancelled）+ `/video/submit`（allowlisted video_url 或 multipart mp4 转发入队）+ `/video/status`（本地回执 + 实时对账调度器）。
- `wrangler.cloud-hub.toml`：复用现有 KV 命名空间 `63c6bb…`（task:/video: 前缀，不与 yt: 键冲突）；Free 账户 cron 已达 5 上限，本 Worker 不挂 cron。
- `scripts/tests/cloud-hub.test.mjs`：6 用例全过（匿名 401、health 开放、任务往返+脱敏、allowlisted 入队、非白名单拒绝、对账）。
- `.github/workflows/deploy-cloud-hub.yml`：测试 → wrangler deploy → 注入 ACCESS_TOKEN → health 自检。

## 生产回读（2026-10-20）
- `GET https://ltzzz-cloud-hub.ltzyz2181.workers.dev/health` → `{ok:true,engine:cloud-hub,kv:true,platforms:{youtube:true,tiktok:false}}`。
- 匿名 `GET /video/status` → 401（写/读回执鉴权门生效）。
- 部署日志：`✨ Success! Uploaded secret ACCESS_TOKEN`，health 自检通过。

## 边界（未做，不伪造）
- Worker 不渲染/生成视频、不调用模型、不烧模型额度、不自动付款。
- TikTok 应用未过审，`platforms.tiktok=false`，未打通。
- 云端豆包要发片，仍需总控把 `LTZZZ_AGENT_TOKEN` 通过安全通道交给云端席位（不进聊天、不进仓库）。

## 仍待 owner/总控
- 把 `LTZZZ_AGENT_TOKEN` 安全交付给云端豆包席位（Secret，不进聊天/仓库）。
- 云端席位拿到 token 后即可 `POST /video/submit` 提交成片，调度器自动发布并公开核验。
