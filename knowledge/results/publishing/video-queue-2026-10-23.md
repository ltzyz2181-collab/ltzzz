# 视频流水线回执 · 2026-10-23

| 项 | 内容 |
|---|---|
| 日期 | 2026-10-23 |
| 主题 | Forty-Two Stuck Tasks, Only Three Can Wake Up（fail-closed 复活闸门：42 blocked / 3 resumable / 39 context_missing；无证据不复活，内部积分不付款） |
| 渲染 | seedance_2.0_fast，15.07s，720x1280 9:16，含音轨，ffprobe 通过 |
| 产物 | `videos/ltzzz-daily-2026-10-23.mp4` + `.meta.json`，脚本 `knowledge/video-scripts/2026-10-23.md`，commit `33dabda0` 已推 main |
| queue key | **未入队**（见失败与限制） |
| 预计发布 | 无（未进 R2 queue，cron 不会发） |
| 失败与限制 | ① 本地无 LTZZZ_AGENT_TOKEN，不能直传 R2；② `queue-video-only.yml` 把 VIDEO_FILE 硬编码为 10-16 文件，dispatch 无输入参数；③ 本仓 git/gh 凭据均无 `workflow` scope，改不动 workflow 文件（OAuth 拒推），无法把 runner 指向今日文件；④ 未冒充成功、未编造 queue key；未注册账号、未动钱包。 |
| 解除阻塞所需 | 用带 `workflow` scope 的凭据把 queue-video-only.yml 参数化（inputs: video_file/meta），再 dispatch 指向今日文件即可上传。 |
