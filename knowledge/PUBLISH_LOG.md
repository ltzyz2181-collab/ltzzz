# LTZZZ 视频发布记录

> 真实发布日志，不伪造状态。每次发布追加一条。

---

## 2026-09-16 · 首条测试视频（私密）

- **视频**：ltzzz-20260916-200750.mp4（1080×1920 · 9:16 · 30fps · H.264 · 18.04s）
- **内容**：LTZZZ 数字实验室品牌测试片（观 → 行深 → 实验 → 结果）
- **引擎**：FFmpeg 本地合成（SVG 设计稿 ×3 + 字幕，无配音）
- **发布平台与状态**：

| 平台 | 状态 | 可见范围 | 上传方式 | 备注 |
|---|---|---|---|---|
| YouTube | ✅ 已上传 | 私密（private） | 用户手机手动上传 | 验证上传链路 |
| TikTok | ✅ 已上传 | 私密 | 用户手机手动上传 | 验证上传链路 |

- **说明**：本次为链路验证（私密），未经用户确认不转为公开。
- **下一步**：确认两平台私密可见 → 决定是否转为公开/删除；自动化上传链路（OAuth 授权 + publish_now.py）待授权后启用。

---

## 2026-09-28 · 自动化链路首条真实发布（私密）

- **视频**：LTZZZ 2026-09-28（手机经 youtube.html → Worker OAuth 上传）
- **OAuth**：YouTube 已连接（channel: LTZZZ / UCnKqseQ7uivSc7FN38ccRUA）
- **发布平台与状态**：

| 平台 | 状态 | 可见范围 | 上传方式 | Video ID |
|---|---|---|---|---|
| YouTube | ✅ 已上传 | 私密（private） | youtube.html 上传 | HKhUA5CRPfc |

- **链接**：https://www.youtube.com/watch?v=HKhUA5CRPfc
- **记录文件**：data/records/youtube-publish-log.json（worker 自动写入；本条约由人工核实截图后回填）
- **说明**：私密待人工确认转公开；后续每次上传成功由 record worker 自动追加记录并 commit。

---

## 2026-09-29 · 已验证转公开（端到端核验）

- **视频**：HKhUA5CRPfc「LTZZZ 2026-09-28」由 set-privacy 转为 **public**
- **核验方式（无鉴权权威通道）**：YouTube 频道 RSS feed（只列公开视频）含 `videoId=HKhUA5CRPfc / title=LTZZZ 2026-09-28`；Worker `/youtube/status` 返回 connected:true（channel LTZZZ / UCnKqseQ7uivSc7FN38ccRUA）
- **结论**：视频真实公开，任何人可访问：https://www.youtube.com/watch?v=HKhUA5CRPfc
- **遗留**：Worker last_publish 仍为 null（发布成功记录未回填）；data/records/youtube-publish-log.json 未生成（record worker 自动落库待修复）；自动发布端到端（定时触发→生成真实视频→上传 public→记录）仍未打通，卡在真实视频文件 + 定时触发。
