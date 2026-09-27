# Muse 视频资产目录（LTZZZ 视频生成通道）

通道定位：Google Muse（Veo 3 底座）生成的成片，作为继豆包/Veo 之后的第二个高质量视频生成源，走 T026 视频资产流程：

```
Memory(选题/脚本) → 视频生成通道[豆包 / Veo / Muse] → 本目录
→ 审核(private首传) → 自动发布(YouTube/TikTok) → 结果回写 Memory
```

## 命名规范

```
assets/video/muse/YYYY-MM-DD-<id>.mp4            # 成片
assets/video/muse/YYYY-MM-DD-<id>.meta.json      # 元数据（必须与成片同名）
```

- `YYYY-MM-DD`：生成日期（UTC）
- `<id>`：短标识，如 `001`、`muse01`、`t026-1`；同一任务多片用 `-a`/`-b` 后缀
- 禁止提交超大二进制：成片可放外部存储（R2 / 网盘），本地只留 `file` 指向外部 URL

## meta.json 字段

```json
{
  "id": "2026-09-27-muse01",
  "source": "muse",
  "route": "A",
  "created_at": "2026-09-27T12:00:00Z",
  "file": "https://.../2026-09-27-muse01.mp4",
  "title": "视频标题（≤100字符）",
  "description": "简介（≤5000字符）",
  "tags": ["ltzzz", "muse", "t026"],
  "status": "drafted",
  "human_confirm": false,
  "youtube_video_id": null,
  "tiktok_publish_id": null,
  "generator": "muse-app | veo-api",
  "note": "可选备注"
}
```

### 状态机

| status | 含义 | 可否发布 |
|---|---|---|
| `drafted` | 刚入库，未审核 | 否 |
| `reviewed` | 人工确认通过（`human_confirm: true`） | 是（private 首传） |
| `published` | 已发布 | — |
| `rejected` | 人工否决 | 否 |

## 接入路线

- **路线 A（近期）**：Muse App/Web 人工生成成片 → 保存到本目录 + 写 meta.json → 跑 `node scripts/scan-muse-assets.js` 生成 manifest → 发布流程读取 manifest 中 `status=reviewed` 的条目
- **路线 B（远期）**：Google Veo API（Gemini API）程序化生成 → 直接写 meta.json → 全自动进资产库（需 Veo API Key）

## 发布前必检

1. `human_confirm: true` 且 `status: reviewed`，缺一不可
2. `youtube_video_id` / `tiktok_publish_id` 为空（未重复发布）
3. 发布默认 **private**，人工确认后才转公开
4. 发布成功后在 meta.json 回写平台 ID，并回写 Memory
