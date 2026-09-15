/**
 * LTZZZ Seedance 视频生成代理 Worker
 * 功能：把豆包对话模型生成的 Seedance prompt 提交给火山方舟视频生成 API
 *   POST /api/v3/contents/generations/tasks（异步：提交 → 轮询 → 返回视频 URL）
 *
 * 需要环境变量（Secret）：
 *   ARK_API_KEY   = 火山方舟 API Key
 *   SEEDANCE_MODEL = 已开通的 Seedance 模型 ID（如 doubao-seedance-2-5-260628）
 *
 * API 用法（均 POST）：
 *   POST /            { model, prompt, duration? }            → 提交任务，返回 { task_id }
 *   POST /status      { task_id }                             → 查询任务状态
 *   POST /poll        { task_id, wait? }                      → 轮询直到完成/失败（wait=秒，默认 90）
 *   POST /generate    { prompt, duration?, wait? }            → 提交并轮询到完成，直接返回视频 URL
 *
 * 安全：Key 只在 Worker Secret 中，绝不写入 HTML / GitHub。
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }
    if (!env.ARK_API_KEY) return json({ error: 'Missing ARK_API_KEY secret' }, 500);
    if (!env.SEEDANCE_MODEL) return json({ error: 'Missing SEEDANCE_MODEL variable' }, 500);

    const ARK = 'https://ark.cn-beijing.volces.com/api/v3';
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const path = url.pathname.replace(/\/+$/, '');
    try {
      switch (path) {
        case '':
        case '/':
          return json(await submitTask(env, body, ARK));
        case '/status':
          return json(await queryTask(env, body, ARK));
        case '/poll':
          return json(await pollTask(env, body, ARK, ctx));
        case '/generate':
          return json(await generate(env, body, ARK, ctx));
        default:
          return json({ error: 'Unknown path: ' + path }, 404);
      }
    } catch (e) {
      return json({ error: e.message || String(e) }, e.status || 502);
    }
  },
};

async function submitTask(env, body, ARK) {
  const prompt = (body.prompt || '').trim();
  if (!prompt) throw Object.assign(new Error('Missing prompt'), { status: 400 });
  const duration = body.duration && Number(body.duration) >= 5 && Number(body.duration) <= 30
    ? Number(body.duration) : 8;

  const payload = {
    model: env.SEEDANCE_MODEL,
    content: [
      { type: 'text', text: prompt },
    ],
  };
  if (body.aspect_ratio) payload.aspect_ratio = body.aspect_ratio; // e.g. "16:9","9:16"
  if (body.resolution) payload.resolution = body.resolution;

  const r = await fetch(ARK + '/contents/generations/tasks', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.ARK_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw Object.assign(new Error('Ark submit failed: ' + (data.error?.code || r.status) + ' ' + (data.error?.message || JSON.stringify(data))), { status: r.status });
  }
  // 火山方舟返回 { id: task_id }
  const taskId = data.id || data.task_id;
  if (!taskId) throw Object.assign(new Error('No task id in response: ' + JSON.stringify(data)), { status: 502 });
  return { ok: true, task_id: taskId, duration, model: env.SEEDANCE_MODEL };
}

async function queryTask(env, body, ARK) {
  const taskId = (body.task_id || '').trim();
  if (!taskId) throw Object.assign(new Error('Missing task_id'), { status: 400 });
  const r = await fetch(ARK + '/contents/generations/tasks/' + encodeURIComponent(taskId), {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + env.ARK_API_KEY },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw Object.assign(new Error('Ark status failed: ' + (data.error?.code || r.status) + ' ' + (data.error?.message || JSON.stringify(data))), { status: r.status });
  }
  return normalizeTask(data);
}

async function pollTask(env, body, ARK, ctx) {
  const taskId = (body.task_id || '').trim();
  if (!taskId) throw Object.assign(new Error('Missing task_id'), { status: 400 });
  const maxWait = Math.min(Number(body.wait) || 90, 300);
  const deadline = Date.now() + maxWait * 1000;
  let last = null;
  while (Date.now() < deadline) {
    last = await queryTask(env, { task_id: taskId }, ARK);
    if (last.status === 'succeeded' || last.status === 'failed' || last.status === 'cancelled') return last;
    await sleep(5000, ctx);
  }
  return Object.assign({ status: 'pending', polled_until: 'timeout', timeout_seconds: maxWait }, last || { task_id: taskId });
}

async function generate(env, body, ARK, ctx) {
  const sub = await submitTask(env, body, ARK);
  const maxWait = Math.min(Number(body.wait) || 180, 600);
  const deadline = Date.now() + maxWait * 1000;
  let last = null;
  while (Date.now() < deadline) {
    last = await queryTask(env, { task_id: sub.task_id }, ARK);
    if (last.status === 'succeeded') {
      return Object.assign({ ok: true }, last, sub);
    }
    if (last.status === 'failed' || last.status === 'cancelled') {
      return Object.assign({ ok: false }, last, sub);
    }
    await sleep(6000, ctx);
  }
  return Object.assign({ ok: false, status: 'pending', task_id: sub.task_id, timeout: true, timeout_seconds: maxWait }, sub);
}

// 归一化火山方舟任务响应
function normalizeTask(data) {
  const statusMap = {
    queued: 'queued', running: 'running', succeeded: 'succeeded', failed: 'failed', cancelled: 'cancelled',
  };
  const status = statusMap[data.status] || data.status || 'unknown';
  let videoUrl = null;
  // 结果在 content.video_url 或 content 数组中
  const c = data.content;
  if (c) {
    if (typeof c === 'string') videoUrl = c;
    else if (Array.isArray(c)) {
      const v = c.find((x) => x && (x.video_url || x.url));
      if (v) videoUrl = v.video_url || v.url;
    } else if (c.video_url) videoUrl = c.video_url;
  }
  if (!videoUrl && data.video_url) videoUrl = data.video_url;
  return {
    task_id: data.id || data.task_id,
    status,
    video_url: videoUrl,
    error: data.error ? (data.error.message || data.error.code || String(data.error)) : null,
    raw: data,
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function sleep(ms, ctx) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (ctx) ctx.waitUntil?.(Promise.resolve(t).then(() => clearTimeout(t)));
    else t.unref?.();
  });
}
