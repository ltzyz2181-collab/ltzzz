# LTZZZ 视频流水线（聊天记录 → 视频 → 发布 → 数据回写）

> 状态：流程规范已定；各环节 Worker/脚本逐步接入（任务九）。

## 流水线

```
聊天记录
  → ① 自动切段（按话题/对话边界）
  → ② 每段生成唯一内容ID（CONTENT-<日期>-<序号>）
  → ③ DeepSeek 清洗（脱敏、去噪、提取要点）
  → ④ GPT 判断内容价值（值得做/放弃/待定）
  → ⑤ 豆包生成中文文案（脚本/口播）
  → ⑥ 豆包视频制作（引擎：Gemini/Veo → Seedance → FFmpeg 本地，自动 fallback）
  → ⑦ 字幕（SRT 烧录）
  → ⑧ 封面（封面图，统一品牌）
  → ⑨ Logo 片头/片尾（LTZZZ AGI实验室 / 知其固然如此……）
  → ⑩ 发布（YouTube private / TikTok 私密，人工确认转公开）
  → ⑪ 数据回写（观看/点赞/评论 → LTZZZ 数据台账）
```

## 唯一内容ID

- 格式：`CONTENT-YYYYMMDD-NNN`
- 记录于 `knowledge/content-registry.md`：ID / 来源会话 / 主题 / 清洗稿 / 文案 / 视频文件 / 发布平台ID / 数据。

## 规则

- 每一段有效聊天记录作为一条独立视频素材（脱敏后使用）。
- 清洗在 DeepSeek 完成；价值判断在 GPT；制作与发布在豆包链路。
- 发布默认私密，转公开需授权。

## 已就绪组件

| 环节 | 组件 | 状态 |
|---|---|---|
| ① 切段 | 清洗脚本（待写） | 待接入 |
| ② ID | 本规范 | ✅ |
| ③ 清洗 | DeepSeek 通道（deepseek-proxy-worker.js） | 待 Key/部署 |
| ④ 判断 | GPT 通道（ltzzz-gpt-proxy-worker.js） | 待 Key/部署 |
| ⑤ 文案 | 豆包 | 可用 |
| ⑥ 制作 | FFmpeg 本地引擎（tools/ffmpeg_engine.py）+ ltzzz_video_server.py | ✅ |
| ⑦ 字幕 | ffmpeg drawtext/subtitles | ✅ |
| ⑧ 封面 | PIL/SVG（tools/ffmpeg_engine.py 可扩展） | ✅ |
| ⑨ 片头尾 | SVG 模板 | ✅ |
| ⑩ 发布 | publish_now.py / YouTube+TikTok Worker | 待 OAuth |
| ⑪ 回写 | knowledge/PUBLISH_LOG.md + 台账 | ✅ |
