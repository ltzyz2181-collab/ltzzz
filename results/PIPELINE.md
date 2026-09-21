# LTZZZ 视频结果流水线

```
AI 生成视频
  ↓
保存视频资产  assets/video/{id}.mp4 + meta.json
  ↓
生成标题 / 简介 / 标签  results/video/{id}.md
  ↓
YouTube API  ──→  发布（默认 private + 人工确认）
TikTok API   ──→  发布（默认隐私 + 人工确认）
  ↓
记录 video_id / publish_id
  ↓
LTZZZ Results  results/video/registry.md
```

## 状态机

| 状态 | 含义 |
|------|------|
| drafted | 文案/元数据已写 |
| asset_saved | 仓库或 R2 有文件指针 |
| waiting_human | 等人点头才能调发布 API |
| yt_private | YouTube 已上传且 privacy=private |
| tt_private | TikTok 已发且隐私级非公开 |
| published_public | 主人明确改为公开 |
| failed | API / OAuth 失败 |
| blocked | 缺 Secret 或 OAuth |

## 现网代码（已在仓库，未当作自动发片开关）

| 通道 | 文件 | 默认 |
|------|------|------|
| YouTube | `youtube-upload-worker.js` | privacyStatus=`private` |
| TikTok | `tiktok-post-worker.js` | privacy=1 |
| Gemini/Veo 代理 | `ltzzz-gemini-video-proxy-worker.js` | 生成，不发布 |
| Seedance 代理 | `seedance-proxy-worker.js` | 生成，不发布 |

## 禁止

- 无人工确认调用 `/youtube/upload` 或 TikTok `/publish`
- 默认 public
- Key 进 Git / 静态页
- 把「Worker 文件存在」写成「已全网发布」
