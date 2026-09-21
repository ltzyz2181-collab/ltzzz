/**
 * LTZZZ 视频自动发布调度器 Worker
 * 功能：
 *   - 接收视频资产（从 webhook 或手动触发）
 *   - 自动发布到 YouTube（private → 确认后 public）
 *   - 自动发布到 TikTok
 *   - 发布状态回写 memory/daily/
 *
 * 需要 Cloudflare Secret：
 *   LTZZZ_AGENT_TOKEN
 *   YOUTUBE_UPLOAD_WORKER_URL  = YouTube 上传 Worker URL
 *   TIKTOK_UPLOAD_WORKER_URL   = TikTok 上传 Worker URL
 *   WEBHOOK_SECRET             = Webhook 校验密钥
 *
 * API 路由：
 *   GET  /health
 *   POST /schedule/publish     { video_url, title, description, platforms? }
 *   GET  /status?task_id=xxx
 *   POST /webhook/video-ready  (接收视频资产就绪通知)
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
          platforms: {
            youtube: !!env.YOUTUBE_UPLOAD_WORKER_URL,
            tiktok: !!env.TIKTOK_UPLOAD_WORKER_URL,
          }
        });
      }

      // 鉴权
      const auth = request.headers.get('Authorization') || '';
      const webhookSecret = request.headers.get('X-Webhook-Secret') || '';
      const authorized = auth === `Bearer ${env.LTZZZ_AGENT_TOKEN}` || webhookSecret === env.WEBHOOK_SECRET;

      if (!authorized && !url.pathname.includes('/health')) {
        return json({ ok: false, error: 'unauthorized' }, 401);
      }

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
  }
};

async function handleSchedulePublish(request, env) {
  const body = await request.json();
  const { video_url, title = '', description = '', platforms = ['youtube', 'tiktok'] } = body;

  if (!video_url) {
    return json({ ok: false, error: 'missing_video_url' }, 400);
  }

  const taskId = `pub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const task = {
    task_id: taskId,
    video_url,
    title,
    description,
    platforms,
    status: 'queued',
    created_at: new Date().toISOString(),
    results: {},
  };

  // 存 KV（如果有 KV 的话）
  // 先直接返回，后续再做异步发布

  // 模拟发布
  task.results = {
    youtube: {
      status: 'queued',
      privacy: 'private', // 先 private，确认后再 public
      note: '将调用 YouTube Worker 上传',
    },
    tiktok: {
      status: 'queued',
      note: '将调用 TikTok Worker 上传',
    },
  };

  return json({
    ok: true,
    task_id: taskId,
    ...task,
  });
}

async function handleStatus(request, env) {
  const url = new URL(request.url);
  const taskId = url.searchParams.get('task_id');

  if (!taskId) {
    return json({ ok: false, error: 'missing_task_id' }, 400);
  }

  // TODO: 从 KV 读取任务状态
  return json({
    ok: true,
    task_id: taskId,
    status: 'queued',
    note: '任务状态查询（KV 待接入）',
  });
}

async function handleVideoReadyWebhook(request, env) {
  const body = await request.json();
  const { video_url, title, description, source } = body;

  // 自动调度发布
  const scheduleResult = await handleSchedulePublish(
    new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_url, title, description }),
    }),
    env
  );

  const result = await scheduleResult.json();
  return json({
    ok: true,
    webhook_received: true,
    source: source || 'unknown',
    schedule_result: result,
  });
}
