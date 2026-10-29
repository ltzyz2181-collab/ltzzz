# 原任务 YOUTUBE-AUTOMATION-20261013：WorkBuddy 新成片入队接力

步骤 NEW-VIDEO-HANDOFF；类型 assigned，不是已唤醒/已接单/已发布。

owner 提供的新成片标识为 `videos/ltzzz-daily-2026-10-29.mp4`、配套 `.meta.json`，脚本 `knowledge/video-scripts/2026-10-29.md` 已可在 Git 回读。MP4/meta 未进入当前 main，分享页在总控端取不到文件正文；请由实际持有原件的执行端处理，不重新渲染、不拿旧模板顶替。

使用既有安全环境注入的 LTZZZ_AGENT_TOKEN，不打印或传到聊天，不向 Git/R2 广泛索取权限。在已有仓库、Node 22+ 与 ffprobe 环境执行：

```sh
node scripts/queue-video-only.mjs --video videos/ltzzz-daily-2026-10-29.mp4 --meta videos/ltzzz-daily-2026-10-29.meta.json
```

该命令仅上传并读回既有共享队列，不调用模型、不触发新 cron。先按同名/同哈希对账；已有发布或未知上传不重发、不换名绕过。返回实际队列名、SHA256、长度、媒体探测、认证 R2 原字节回读和无敏感信息回执路径。无凭据就准确记 `LTZZZ_AGENT_TOKEN_missing`，不让 owner 在聊天发送 Key。

日期标签不替代 America/Tijuana 的实际发布时间。保留 AI 生成角标。实际 provider/model/run/复核元数据若工具取不到则 null，不靠模型显示名冒充已独立复核。已有队列调度负责后续发布；只在 Google 回读 video ID、LTZZZ channel、公有且 processed 后记 published=true。

owner 指定删除的旧视频 `6FZYG2_TLzE` 及其原哈希不得再次入队。不要删其他视频，不改资金、A2/A3/B 或信任根，不另启 Manus/WorkBuddy 付费发布定时。
