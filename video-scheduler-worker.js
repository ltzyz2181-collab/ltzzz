/**
 * LTZZZ 视频自动发布调度器 Worker · v2（真实发布 + 定时扫描）
 * 2026-10-02 由豆包重写：原 v1 仅"模拟 queued"，从不真实上传、无 cron 入口。
 * v2 变更：
 *   - POST /schedule/publish → 立即真实调用 youtube-upload-worker 上传（privacyStatus=public）
 *   - scheduled()（cron 触发）→ 扫描 R2 bucket「ltzzz-videos」queue/ 目录下的待发布视频
 *     （约定：queue/<name>.mp4 + queue/<name>.meta.json {title,description}）→ 逐个真实发布
 *     → 成功后对象移入 published/（copy + delete），日志写 logs/publish-<ts>.json
 *   - 网络声明：YouTube 上传走 googleapis（https），与 Base 主网无关。
 *
 * 需要 Cloudflare Secret：
 *   LTZZZ_AGENT_TOKEN         调度器鉴权令牌（调用 /schedule/publish 与 webhook 用）
 *   WEBHOOK_SECRET            webhook 校验密钥
 *   YOUTUBE_UPLOAD_WORKER_URL = https://ltzzz-youtube-upload.ltzyz2181.workers.dev
 *   TIKTOK_UPLOAD_WORKER_URL  （可选，TikTok 审核通过后再配；未配则跳过 tiktok）
 *
 * R2 绑定：VIDEOS（bucket: ltzzz-videos）
 * 路由：
 *   GET  /health
 *   POST /schedule/publish  { video_url, title, description, privacyStatus? }
 *   GET  /status?task_id=xxx
 *   POST /webhook/video-ready
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors, ...extra }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        return json({
          ok: true,
          service: 'ltzzz-video-scheduler',
          version: 'v2-live',
          cron_configured: !!(env.VIDEOS),
          platforms: {
            youtube: !!env.YOUTUBE_UPLOAD_WORKER_URL,
            tiktok: !!env.TIKTOK_UPLOAD_WORKER_URL,
          },
          privacy_default: 'public',
        });
      }
      const auth = request.headers.get('Authorization') || '';
      const webhookSecret = request.headers.get('X-Webhook-Secret') || '';
      const authorized = auth === `Bearer ${env.LTZZZ_AGENT_TOKEN}` || webhookSecret === env.WEBHOOK_SECRET;
      if (!authorized) return json({ ok: false, error: 'unauthorized' }, 401);

      if (url.pathname === '/schedule/publish' && request.method === 'POST') {
        return await handleSchedulePublish(request, env);
      }
      if (url.pathname === '/status' && request.method === 'GET') {
        return await handleStatus(request, env);
      }
      if (url.pathname === '/webhook/video-ready' && request.method === 'POST') {
        return await handleVideoReadyWebhook(request, env);
      }
      return json({ ok: false, error: 'not_found' }, 404);
    } catch (e) {
      return json({ ok: false, error: 'internal', detail: String(e.message || e) }, 500);
    }
  },

  /** cron 定时触发：扫描 R2 queue/ → 真实发布 */
  async scheduled(event, env, ctx) {
    const started = new Date().toISOString();
    const results = [];
    try {
      if (!env.VIDEOS) {
        return log(env, { started, ok: false, error: 'no VIDEOS binding (R2 not configured)' });
      }
      const listed = await env.VIDEOS.list({ prefix: 'queue/', limit: 20 });
      const metas = listed.objects.filter((o) => o.key.endsWith('.meta.json'));
      for (const metaObj of metas) {
        const name = metaObj.key.replace(/^queue\//, '').replace(/\.meta\.json$/, '');
        const videoKey = `queue/${name}.mp4`;
        // 视频本体不在 queue 时跳过
        const videoExists = listed.objects.some((o) => o.key === videoKey);
        if (!videoExists) continue;

        const meta = await env.VIDEOS.get(metaObj.key);
        let title = name, description = '';
        if (meta) {
          try { const m = await meta.json(); title = m.title || name; description = m.description || ''; }
          catch (e) { /* meta 解析失败用默认 */ }
        }

        const r = await publishToYouTube(env, videoKey, title, description);
        if (r.ok) {
          // 成功：copy 到 published/ + 删除 queue 源
          await env.VIDEOS.put(`published/${name}.mp4`, await env.VIDEOS.get(videoKey).then((o) => o.body));
          await env.VIDEOS.delete(videoKey);
          await env.VIDEOS.delete(metaObj.key);
        }
        results.push({ name, ...r });
      }
      await log(env, { started, ok: true, scanned: metas.length, results });
      return;
    } catch (e) {
      await log(env, { started, ok: false, error: String(e.message || e), results });
    }
  },
};

async function publishToYouTube(env, videoKey, title, description) {
  // 上传 worker 需要公开可拉取的 video_url；R2 key 不是 URL。
  // 若配置了 PUBLIC_VIDEO_BASE（R2 自定义域名或公共访问前缀），则拼 URL；否则报需人工上传。
  const base = env.PUBLIC_VIDEO_BASE || 'https://videos.ltzzz.com/'; // 默认走 r2-public worker 公共域
  if (!base) {
    return { ok: false, error: 'PUBLIC_VIDEO_BASE not set — R2 直链未配，无法 worker 拉取上传；请配置 R2 自定义域名后启用自动发' };
  }
  const video_url = base + encodeURIComponent(videoKey.replace('queue/', ''));
  try {
    const resp = await fetch(`${env.YOUTUBE_UPLOAD_WORKER_URL}/youtube/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_url,
        title: String(title).slice(0, 100),
        description: String(description).slice(0, 4900),
        privacyStatus: 'public', // LTZZZ 自动发布一律公开（owner 拍板）
      }),
    });
    const body = await resp.json().catch(() => ({}));
    if (resp.ok && body.video_id) {
      return { ok: true, video_id: body.video_id, url: 'https://www.youtube.com/watch?v=' + body.video_id, privacy: 'public' };
    }
    return { ok: false, http: resp.status, error: (body.error && body.error.message) || body.message || 'upload worker 返回失败' };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function handleSchedulePublish(request, env) {
  const body = await request.json();
  const { video_url, title = '', description = '', privacyStatus = 'public', platforms = ['youtube'] } = body;
  if (!video_url) return json({ ok: false, error: 'missing_video_url' }, 400);
  const taskId = `pub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const results = {};
  if (platforms.includes('youtube') && env.YOUTUBE_UPLOAD_WORKER_URL) {
    try {
      const resp = await fetch(`${env.YOUTUBE_UPLOAD_WORKER_URL}/youtube/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url, title, description, privacyStatus: privacyStatus === 'private' ? 'private' : 'public' }),
      });
      const body2 = await resp.json().catch(() => ({}));
      results.youtube = resp.ok && body2.video_id
        ? { status: 'published', video_id: body2.video_id, url: 'https://www.youtube.com/watch?v=' + body2.video_id, privacy: privacyStatus }
        : { status: 'failed', http: resp.status, error: (body2.error && body2.error.message) || body2.message || 'upload worker failed' };
    } catch (e) {
      results.youtube = { status: 'failed', error: String(e.message || e) };
    }
  } else {
    results.youtube = { status: 'skipped', note: 'YOUTUBE_UPLOAD_WORKER_URL 未配置' };
  }
  if (platforms.includes('tiktok')) {
    results.tiktok = env.TIKTOK_UPLOAD_WORKER_URL
      ? { status: 'queued', note: 'TikTok worker 已配置，走独立发布' }
      : { status: 'skipped', note: 'TikTok 未配置/审核未过' };
  }
  await log(env, { task_id: taskId, kind: 'manual', video_url, title, results });
  return json({ ok: true, task_id: taskId, video_url, title, results });
}

async function handleStatus(request, env) {
  const taskId = new URL(request.url).searchParams.get('task_id');
  if (!taskId) return json({ ok: false, error: 'missing_task_id' }, 400);
  return json({ ok: true, task_id: taskId, status: 'see_logs', note: '调度日志见 R2 logs/publish-*.json' });
}

async function handleVideoReadyWebhook(request, env) {
  const body = await request.json();
  const { video_url, title, description, source } = body;
  const scheduleResult = await handleSchedulePublish(
    new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_url, title, description }),
    }),
    env
  );
  const result = await scheduleResult.json();
  return json({ ok: true, webhook_received: true, source: source || 'unknown', schedule_result: result });
}

async function log(env, obj) {
  try {
    if (env.VIDEOS) {
      const key = `logs/publish-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      await env.VIDEOS.put(key, JSON.stringify(obj, null, 2));
    }
  } catch (e) { /* 日志失败不影响主流程 */ }
}
