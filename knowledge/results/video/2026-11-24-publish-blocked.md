# 2026-11-24 每日视频：已成片、未入队（频道未连接阻断）

- 状态：`blocked_channel_not_connected`（视频已生成并入库，未进入 R2 queue，未发布）
- 视频文件：`videos/ltzzz-daily-2026-11-24.mp4`（720×1280 / 9:16 / 15.071995s / HEVC + 有音轨 / 587412B）
- 视频 sha256：`0fffccdba3fba6db2136f4825282221e96ae350116d738f9bd9d60dec30bb0dc`
- 主题：200 OK 不等于生成（验收要 finish reason / model_calls / artifact hash 三件实物）
- 源提交：`07d1aa3d2df76717533b6e3a377e3290f285f5ec`
- 预期 queue key（未写入）：`queue/ltzzz-daily-2026-11-24.mp4` + `queue/ltzzz-daily-2026-11-24.meta.json`

## 阻断点（按实测时间顺序）

| 通道 | 结果 | 证据 |
| --- | --- | --- |
| 本地 wrangler R2 put | 失败 | `r2 object get` 403 / Authentication error code 10000（token 无 R2 对象权限） |
| VM 直连 scheduler / uploader worker | 失败 | curl HTTP 000（出口不通；`/youtube/status` 20s 超时） |
| CI `youtube-upload-video.yml` | 失败 | run 45567425214：`{"error":"unauthorized"}`（worker 不接受 CI 中的 LTZZZ_AGENT_TOKEN） |
| CI `youtube-daily-publish.yml`（手动触发两次） | 失败 | run 45567588807、45567796142：`expected_LTZZZ_channel_not_connected` |

## 关键判断

`scripts/lib/video-queue-client.mjs` 在上传前先调 `UPLOADER/youtube/status`（公开读、无需 token），
若 `connected!==true` 或 `channel_id!==UCnKqseQ7uivSc7FN38ccRUA` 就抛
`expected_LTZZZ_channel_not_connected` 并中止。两次手动触发同一错误，说明是稳定的频道连接状态问题，
而非重试抖动（对比 2026-10-25 同类错误当日稍后重试成功，属可恢复抖动；今日不是）。

## 恢复条件（owner 侧，均非本执行手可代办）

1. 在 uploader worker 重新完成 YouTube OAuth，使 `/youtube/status` 返回
   `connected=true, channel_id=UCnKqseQ7uivSc7FN38ccRUA`；
2. 轮换 `LTZZZ_AGENT_TOKEN`（GitHub Secret 与 worker secret 两侧一致），解除 upload 端点 unauthorized。

两项就绪后，只需手动触发一次 `youtube-daily-publish.yml` 即可立即公开发布：
该工作流的 `prepare-ready-youtube-video.mjs` 已能在 2026-11-24 选中本文件并通过音轨/时长校验（本次已跑到该步），
标题与描述取自 `videos/ltzzz-daily-2026-11-24.meta.json`，无需重新渲染。

## 未做（红线）

- 未注册/登录任何账号，未改动 YouTube 频道设置，未上传替换任何技能包。
- 未触碰主钱包、无转出、`paid=false`、`tx_hash=null`。

## 解除（2026-11-25）

- 授权：owner 在 uploader worker 重新完成 YouTube OAuth（`/auth/youtube`），`/youtube/status` 恢复 `connected=true`。
- 鉴权：重新部署 `deploy-publish-workers.yml` 与 `deploy-video-scheduler.yml`，两侧 worker 的 `LTZZZ_AGENT_TOKEN` 由仓库 Secret 重新注入，与 CI 对齐（未轮换凭据值）。
- 发布：run `45747484441` 成功，`video_id=B6Xwi39VuRE`，`privacyStatus=public`，`uploadStatus=processed`，频道 `UCnKqseQ7uivSc7FN38ccRUA`。
- URL：https://www.youtube.com/watch?v=B6Xwi39VuRE
- 说明：成片与 2026-11-24 同源（sha256 `0fffccdba3fba6db2136f4825282221e96ae350116d738f9bd9d60dec30bb0dc`），仅发布位日期为 2026-11-25，未重渲染。
