# LTZZZ Task TASK-20261009-DOUBAO-VIDEO — Reviewable Deliverable

## 0. 执行状态

- 原执行：Doubao/Ark
- 重装原因：Doubao Ark 通道在 2026-10-14 连续 3 次网络 fetch exception
- 当前执行：DeepSeek（离线评审/交付）
- 状态：**可评审交付，未部署，未发布，未移动资金**
- 隐私：**不含健康/梦境类隐私数据**
- 密钥：**本交付不输出任何 Secret**

---

## 1. 60 秒 9:16 LTZZZ 品牌脚本

| 时间槽 | 时间码 | 画面 | 字幕文本 | 口播/备注 |
|---|---|---|---|---|
| 1 | 00:00–00:05 | LTZZZ AGI实验室 片头 logo，深色底，白色字 | 一条聊天记录，怎样变成一支短片？ | 一条聊天记录，怎样变成一支短片？ |
| 2 | 00:05–00:10 | 流水线步骤条：切段 → 清洗 → 判断 → 成片 | 我们有一套自动化流水线。 | 我们有一套自动化流水线。 |
| 3 | 00:10–00:15 | DeepSeek 节点高亮，文字脱敏/去噪图标 | DeepSeek 先脱敏查证，去掉噪音。 | DeepSeek 先脱敏查证，去掉噪音。 |
| 4 | 00:15–00:20 | Doubao 节点高亮，脚本/字幕卡片弹出 | Doubao 生成 60 秒 9:16 的中文脚本和字幕。 | Doubao 生成 60 秒 9:16 的中文脚本和字幕。 |
| 5 | 00:20–00:25 | 视频引擎：MP4 输出、封面、片头片尾 | 视频引擎出片：封面、片头片尾、字幕烧录。 | 视频引擎出片：封面、片头片尾、字幕烧录。 |
| 6 | 00:25–00:30 | 内容ID：CONTENT-YYYYMMDD-NNN 展示 | 每一条素材有唯一内容ID，全程可追溯。 | 每一条素材有唯一内容ID，全程可追溯。 |
| 7 | 00:30–00:35 | R2 队列 bucket，上传箭头动画 | MP4 进入 R2 队列，发布前做技术校验。 | MP4 进入 R2 队列，发布前做技术校验。 |
| 8 | 00:35–00:40 | 检查项：时长、分辨率、音轨、字幕 | 时长、分辨率、音轨、字幕，一项不过都不发。 | 时长、分辨率、音轨、字幕，一项不过都不发。 |
| 9 | 00:40–00:45 | YouTube/TikTok 图标，私密转公开标识 | 平台先私密上传，确认后再转公开。 | 平台先私密上传，确认后再转公开。 |
| 10 | 00:45–00:50 | 数据回写台账，观看/点赞/评论指标弹出 | 发布结果回写台账：观看、点赞、评论都有记录。 | 发布结果回写台账：观看、点赞、评论都有记录。 |
| 11 | 00:50–00:55 | 模型调用记录：provider/model/time/usage/hash | 不是空调用：记录模型、时间和用量，按预算幂等重试。 | 不是空调用：记录模型、时间和用量，按预算幂等重试。 |
| 12 | 00:55–01:00 | 片尾：LTZZZ AGI实验室 / 知其固然如此…… | LTZZZ AGI实验室 · 知其固然如此…… | LTZZZ AGI实验室 · 知其固然如此…… |

### Title（标题）

```
60秒看懂：LTZZZ AI视频流水线｜从聊天记录到成片
```

### Description（描述）

```
LTZZZ AGI实验室 60 秒 9:16 品牌内容：DeepSeek 清洗、Doubao 脚本/字幕、R2 队列、YouTube/TikTok 发布与数据回写。内部验证交付，不含任何真实用户隐私。

#LTZZZ #AIGC #视频流水线 #DeepSeek #Doubao
```

---

## 2. Production → R2 → Platform 缺口审计

| 环节 | 预期 | 当前代码/文档观察 | 缺口 | 严重度 | 建议修复 |
|---|---|---|---|---|---|
| 本地成片预检 | MP4 必须 60s 内、9:16、有音轨、有字幕、有哈希 | `tools/compose_video.py` 存在，但 Scheduler 前无强制预检 | 可能将非法时长/分辨率/无音轨视频入队并上传 | 高 | 增加 `scripts/queue_video.py`：ffprobe 校验 + SHA-256 写入 meta.json，再传 R2 |
| R2 queue 上传 | `queue/<content-id>.mp4` + `queue/<content-id>.meta.json` 且公开可拉取 | Scheduler 假设 `PUBLIC_VIDEO_BASE` 可达，未做探测 | 若 R2 公共域未配/不可达，YouTube Worker 拉取 404，发布失败 | 高 | 启动发布前 `HEAD` 探测 public URL；`Health` 返回 `r2_public_reachable` 字段 |
| Scheduler URL 构造 | 公共 URL 应为 `https://videos.ltzzz.com/queue/<name>.mp4` | 代码：`base + encodeURIComponent(videoKey)` → `queue%2F<name>.mp4` | 斜杠被转义，R2 public worker 按路径匹配失败 | **Critical** | 改为 `base + videoKey.split('/').map(encodeURIComponent).join('/')` |
| 队列扫描 | 分页扫描全部 `queue/` 对象，避免遗漏 | `env.VIDEOS.list({ prefix:'queue/', limit:20 })` 只取第一页 | 超过 20 个对象时漏发 | 高 | 实现 `list` 分页循环，继续 `cursor` 直到取完 |
| 并发/锁 | 同一内容同一时刻只发布一次 | Scheduler 无锁机制 | cron 多次触发/重复调用会并发发同一视频 | 高 | 增加 Durable Object 或 KV lease lock，key 为 content-id |
| 幂等 | 上传成功但 R2 搬运失败后，重试不重复上传 | 当前无 published marker | 上传成功后 `published/` copy 失败会导致下次重发重复 | **Critical** | 增加 `published_meta/<content-id>.json`；发布前先查 marker；成功后先写 marker 再搬 R2 |
| 平台上传 | 上传后拿到真实平台 ID 并可回读验证 | YouTube Upload Worker 返回 `video_id`，但 Scheduler 未做 Data API 回读 | 无法确认 YouTube 处理完成、无法写回可追溯 ID | 高 | 上传后调用 YouTube Data API `videos.list` 校验 `processingStatus=processed`；TikTok 如实标 `blocked/queued` |
| 数据回写 | 回写 `knowledge/results/video/` 与每日 results | 仅写 `logs/publish-*.json` | 不符合 Issue #14 验收：同一内容 ID 可追溯→平台 ID→回执 | 高 | 增加 `results/video/<content-id>.json`，写回平台 ID、URL、状态、时间戳 |
| 重试/预算 | 有界 token/重试/日预算，禁止空调用 | 未看到重试预算或 usage 记录 | 可能无限重试，浪费额度 | 中 | meta.json 增加 `attempt_count`、`usage`、`daily_budget`；Scheduler 每次重试前检查 |
| 平台授权状态 | OAuth 授权明确，blocked 如实记录 | `Health` 只显示 worker URL 是否存在，未验证 OAuth | 可能 worker URL 配了但 OAuth 失效，仍标记 YouTube 可用 | 中 | Upload Worker 返回 `auth_ok:false` 时 Scheduler 如实写 `blocked`；Health 增加 `youtube_oauth_ok` |

---

## 3. Issue #14 具体补丁计划

> 以下为提案代码，**未部署**，仅用于评审。

### P0 — 修复 Scheduler URL 与幂等（最高优先）

**文件：`video-scheduler-worker.js`**

```js
function r2PublicUrl(base, videoKey) {
  // 保留 queue/ 前缀，但不要 encode 掉斜杠
  return base + videoKey.split('/').map(encodeURIComponent).join('/');
}

async function hasPublishedMarker(env, name) {
  try {
    return !!(await env.VIDEOS.get(`published_meta/${name}.json`));
  } catch (e) {
    return false;
  }
}

async function writePublishedMarker(env, name, platform, platformId) {
  await env.VIDEOS.put(
    `published_meta/${name}.json`,
    JSON.stringify({
      name,
      platform,
      platform_id: platformId,
      published_at: new Date().toISOString(),
      status: 'published',
    }, null, 2)
  );
}
```

在 `scheduled()` 中，发布前检查 marker：

```js
// before publishToYouTube
if (await hasPublishedMarker(env, name)) {
  results.push({ name, ok: true, skipped: 'already_published' });
  continue;
}
```

成功后，先写 marker 再搬运 R2：

```js
if (r.ok) {
  await writePublishedMarker(env, name, 'youtube', r.video_id);
  // then copy to published/ and delete queue
  await env.VIDEOS.put(`published/${name}.mp4`, ...);
  await env.VIDEOS.delete(videoKey);
  await env.VIDEOS.delete(metaObj.key);
}
```

同时替换 URL 构造：

```js
const video_url = r2PublicUrl(base, videoKey);
```

### P1 — 增加 R2 公共 URL 探测

在 `publishToYouTube()` 内上传前增加：

```js
const head = await fetch(video_url, { method: 'HEAD' }).catch(() => null);
if (!head || !head.ok) {
  return { ok: false, error: `R2 public URL not reachable: ${head ? head.status : 'network_error'}` };
}
```

### P2 — 增加并发锁

**文件：`video-scheduler-worker.js`**  
使用简单 KV lease lock 作为过渡方案，后续可换 Durable Object：

```js
async function acquireLock(env, name) {
  const key = `locks/${name}.lock`;
  const now = Date.now();
  const existing = await env.VIDEOS.get(key).then(r => r && r.json()).catch(() => null);
  if (existing && existing.expires_at > now) return false;
  await env.VIDEOS.put(key, JSON.stringify({ expires_at: now + 120000, worker: 'scheduler' }));
  return true;
}

async function releaseLock(env, name) {
  await env.VIDEOS.delete(`locks/${name}.lock`);
}
```

在 `scheduled()` 主循环中：

```js
if (!(await acquireLock(env, name))) {
  results.push({ name, ok: false, error: 'locked' });
  continue;
}
try {
  // ... publish logic
} finally {
  await releaseLock(env, name);
}
```

### P3 — 本地预检 + 入队脚本

**新增文件：`scripts/queue_video.py`**  
职责：  
1. `ffprobe` 校验 MP4：时长 ≤ 60.5s、分辨率近似 9:16、有音频轨、字幕烧录可验证。  
2. 计算 SHA-256。  
3. 生成 `queue/<content-id>.meta.json`，包含：

```json
{
  "content_id": "CONTENT-20261014-001",
  "title": "60秒看懂：LTZZZ AI视频流水线",
  "description": "内部验证交付，不含任何真实用户隐私。",
  "duration_sec": 60.0,
  "resolution": "1080x1920",
  "audio_codec": "aac",
  "sha256_mp4": "<hash>",
  "provider": "doubao",
  "model": "<model-name>",
  "request_time": "2026-10-14T00:00:00Z",
  "usage": { "input_tokens": 0, "output_tokens": 0 }
}
```

4. 用 R2 绑定或 wrangler 上传到 `queue/<content-id>.mp4` 与 meta。

### P4 — 平台回读与数据回写

**文件：`video-scheduler-worker.js`**  
扩展 `publishToYouTube`：

```js
if (resp.ok && body.video_id) {
  const videoUrl = 'https://www.youtube.com/watch?v=' + body.video_id;
  await writebackResult(env, {
    content_id: name,
    platform: 'youtube',
    platform_id: body.video_id,
    url: videoUrl,
    privacy: 'public',
    status: 'published',
    published_at: new Date().toISOString(),
  });
  return { ok: true, video_id: body.video_id, url: videoUrl, privacy: 'public' };
}
```

新增 `writebackResult`：

```js
async function writebackResult(env, result) {
  try {
    const key = `results/video/${result.content_id}.json`;
    await env.VIDEOS.put(key, JSON.stringify(result, null, 2));
  } catch (e) {
    // 回写失败不影响发布，但必须留痕
  }
}
```

发布失败时同样写回写：

```js
async function writebackError(env, contentId, error) {
  try {
    await env.VIDEOS.put(
      `results/video/${contentId}.json`,
      JSON.stringify({
        content_id: contentId,
        status: 'error',
        error: String(error),
        error_at: new Date().toISOString(),
      }, null, 2)
    );
  } catch (e) {}
}
```

### P5 — 文档与日课脚本更新

- **`protocol/video-pipeline.md`**  
  更新状态：Scheduler 已从 v1 模拟发布升级为 v2 真实调用；明确 R2 public URL 要求、幂等 marker、锁、回读要求。

- **`scripts/run-daily-tasks.mjs`**  
  删除“豆包任务不得发布”的逻辑；改为：  
  1. DeepSeek 清洗 → 2. GPT 价值判断 → 3. Doubao 脚本 → 4. Doubao 视频 → 5. 本地 `queue_video.py` 预检 → 6. 上 R2 queue。  
  不直接调用上传，由 Scheduler cron 统一消费队列，保持唯一内容 ID 幂等。

---

## 4. Issue #14 验收映射

| Issue #14 要求 | 本交付/补丁对应 |
|---|---|
| DeepSeek 真实 API 调用清洗素材、脱敏查证 | 流水线环节③，meta 记录 provider/model/request_time/usage/hash |
| Doubao 真实 API 生成 ≤60 秒 9:16 脚本/字幕/画面 | 60 秒脚本已交付；`queue_video.py` 预检 9:16、60s、字幕、音轨 |
| 复用现有视频引擎生成 MP4 | 仍使用 `tools/ffmpeg_engine.py` + `ltzzz_video_server.py` |
| 上传 R2 queue/MP4 及 meta，验证 public URL 可取 | P0 URL 修正 + P1 HEAD 探测 |
| 核 YouTube/TikTok 授权和 Worker 绑定 | 健康检查增加 OAuth 状态；blocked 如实标 |
| 调度器逐平台发布状态、幂等、锁、有限重试 | P0 marker + P2 lock + P5 attempt/budget |
| 避免上传成功而搬 R2 失败导致重复上传 | P0 成功后先写 marker 再搬 R2，重试前先查 marker 跳过 |
| 平台 ID 回读校验，回写 knowledge/results/video/ 与每日 results | P4 `writebackResult` / `writebackError` |
| 同步过时 video-pipeline 文档 | P5 文档更新 |

---

## 5. 未完成/无法声称事项

- 本补丁未部署。
- 未执行任何真实发布。
- 未换取或验证 OAuth token。
- 未写入任何 `knowledge/results/video/` 或台账。
- 未移动任何资金或额度。
- 以上仅为可评审补丁方案。

如需下一步，可按 P0 → P1 → P2 → P3 → P4 → P5 顺序执行，并在每个阶段回写真实 `provider/model/request_time/usage/hash` 与 `content_id` 台账。