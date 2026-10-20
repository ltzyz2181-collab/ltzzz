/**
 * LTZZZ 云端任务中枢（Cloud Hub）— 云端豆包席位的统一入口网关
 *
 * 职责：
 *  - 任务 CRUD（KV 持久化；状态机 queued→running→success/failed/waiting_approval/cancelled）
 *  - /video/submit：把云端豆包「本机已产出的成片」(allowlisted video_url 或 multipart mp4)
 *    转发进 R2 队列，由 video-scheduler 的 cron 发布到 YouTube 并公开核验
 *  - /video/status：本地回执 + 实时对账调度器
 *  - scheduled：定时兜底触发调度器 /queue/run 并落最新摘要（独立于 GitHub Actions 的第二排空）
 *
 * 明确边界（不在本 Worker 内做，避免伪造）：
 *  - Worker 不生成、不渲染视频；成片由生产者（Actions 渲染器或云端豆包本机）产出后提交
 *  - Worker 不调用模型、不烧模型额度；不自动付款
 *  - TikTok 平台应用未过审，platforms.tiktok=false，不伪造发布
 *
 * 鉴权：所有写接口 Bearer ACCESS_TOKEN（Cloudflare Secret，部署时复用 LTZZZ_AGENT_TOKEN）；
 * 未配置 secret 时 fail-closed（401），不允许匿名写。
 */

const TASK_ID_PREFIX = 'LTZZZ-';
const SCHEDULER_DEFAULT = 'https://ltzzz-video-scheduler.ltzyz2181.workers.dev';
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_VIDEO_HOSTS = new Set([
  'videos.ltzzz.com',
  'raw.githubusercontent.com',
  'ltzyz2181-collab.github.io',
]);

function json(obj, status = 200, headers = {}) {
  return Response.json(obj, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function genId(domain) {
  const n = Date.now().toString(36).toUpperCase().slice(-6);
  return `${TASK_ID_PREFIX}${(domain || 'TASK').toUpperCase()}-${n}`;
}

// 落日志/结果前脱敏：私钥、长 token/key 一律掩码，绝不写入 KV 或仓库。
function redact(value) {
  let s = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  s = s.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');
  s = s.replace(/\b(sk|rk|AKIA|ghp|gho|ghs|xox[baprs]-)[A-Za-z0-9_\-]{8,}\b/g, '[REDACTED_TOKEN]');
  return s;
}

function bearer(request, env) {
  const want = env.ACCESS_TOKEN || env.LTZZZ_AGENT_TOKEN || '';
  if (!want) return false;
  const got = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  return got === want;
}

async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function schedulerBase(env) {
  return env.SCHEDULER_URL || SCHEDULER_DEFAULT;
}
function schedulerToken(env) {
  return env.SCHEDULER_TOKEN || env.ACCESS_TOKEN || env.LTZZZ_AGENT_TOKEN || '';
}

// ---------- 任务 CRUD ----------

async function taskCreate(env, body) {
  const id = genId(body.domain);
  const task = {
    task_id: id,
    from: body.from || 'unknown',
    to: body.to || 'doubao',
    type: body.type || 'task',
    payload: body.payload || {},
    status: 'queued',
    retry: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    result: null,
    log: [],
  };
  await env.KV?.put('task:' + id, JSON.stringify(task));
  return json({ ok: true, task_id: id, status: task.status });
}

async function taskStatus(env, body) {
  if (!body.task_id) return json({ ok: false, error: 'task_id required' }, 400);
  const raw = await env.KV?.get('task:' + body.task_id);
  if (!raw) return json({ ok: false, error: 'task not found' }, 404);
  return json({ ok: true, task: JSON.parse(raw) });
}

async function taskList(env) {
  // KV 无通配查询；这里只回最近一次落库的摘要，完整列表建议 D1。
  const last = (await env.KV?.get('last:task:list')) || '{}';
  return json({ ok: true, note: '完整列表建议使用 D1 存储', sample: JSON.parse(last) });
}

async function taskCancel(env, body) {
  if (!body.task_id) return json({ ok: false, error: 'task_id required' }, 400);
  const raw = await env.KV?.get('task:' + body.task_id);
  if (!raw) return json({ ok: false, error: 'task not found' }, 404);
  const task = JSON.parse(raw);
  if (task.status === 'queued') {
    task.status = 'cancelled';
    task.updated_at = new Date().toISOString();
    await env.KV?.put('task:' + task.task_id, JSON.stringify(task));
  }
  return json({ ok: true, task_id: task.task_id, status: task.status });
}

async function taskResult(env, body) {
  if (!body.task_id) return json({ ok: false, error: 'task_id required' }, 400);
  const raw = await env.KV?.get('task:' + body.task_id);
  if (!raw) return json({ ok: false, error: 'task not found' }, 404);
  const task = JSON.parse(raw);
  task.status = body.status || 'success';
  task.result = body.result || null;
  if (body.retry === true && task.retry < 2) {
    task.retry += 1;
    task.status = 'queued';
  }
  task.updated_at = new Date().toISOString();
  task.log.push({ at: task.updated_at, step: body.step || 'result', note: redact(body.note || '') });
  await env.KV?.put('task:' + task.task_id, JSON.stringify(task));
  return json({ ok: true, task_id: task.task_id, status: task.status });
}

// ---------- 视频提交网关 ----------

async function submitVideo(request, env) {
  let requestedName;
  let bytes;
  let meta = {};
  const ctype = request.headers.get('Content-Type') || '';

  if (ctype.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('video');
    if (!file || !(file.arrayBuffer) || file.size === 0) return json({ ok: false, error: 'video_missing' }, 400);
    if (file.size > MAX_BYTES) return json({ ok: false, error: 'video_exceeds_25MB' }, 413);
    bytes = await file.arrayBuffer();
    try { meta = JSON.parse(String(form.get('meta') || '{}')); } catch { return json({ ok: false, error: 'invalid_metadata' }, 400); }
  } else {
    const body = await request.json().catch(() => ({}));
    let source;
    try { source = new URL(body.video_url); } catch { return json({ ok: false, error: 'missing_or_invalid_video_url' }, 400); }
    if (source.protocol !== 'https:' || !ALLOWED_VIDEO_HOSTS.has(source.hostname)) {
      return json({ ok: false, error: 'video_source_not_allowed' }, 400);
    }
    if (source.hostname === 'raw.githubusercontent.com' && !source.pathname.startsWith('/ltzyz2181-collab/ltzzz/')) {
      return json({ ok: false, error: 'video_source_not_in_project' }, 400);
    }
    const upstream = await fetch(source, { signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (!upstream.ok) return json({ ok: false, error: 'video_source_unavailable', http: upstream.status }, 502);
    bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return json({ ok: false, error: 'video_exceeds_25MB' }, 413);
    meta = { title: body.title, description: body.description || '' };
    requestedName = body.name;
  }

  const hash = await sha256(bytes);
  let name = meta.name || requestedName || ('cloud-' + hash.slice(0, 16));
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(name)) return json({ ok: false, error: 'invalid_name' }, 400);

  // 转发进 R2 队列（调度器负责上传 + 公开核验）。
  const form = new FormData();
  form.set('video', new Blob([bytes], { type: 'video/mp4' }), name + '.mp4');
  form.set('meta', JSON.stringify({ ...meta, video_sha256: hash }));
  const up = await fetch(schedulerBase(env) + '/queue/upload/' + name, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + schedulerToken(env) },
    body: form,
    signal: AbortSignal.timeout(240000),
  });
  const upData = await up.json().catch(() => ({ ok: false, error: 'scheduler_non_json' }));

  const receipt = {
    state: upData.ok ? 'submitted' : 'submit_failed',
    name,
    sha256: hash,
    bytes: bytes.byteLength,
    at: new Date().toISOString(),
    queue_response: upData,
  };
  await env.KV?.put('video:' + hash, JSON.stringify(receipt));
  return json({ ok: !!upData.ok, state: receipt.state, name, sha256: hash, queue_response: upData }, upData.ok ? 200 : 502);
}

async function videoStatus(env, sha) {
  if (!/^[a-f0-9]{64}$/.test(sha || '')) return json({ ok: false, error: 'invalid_hash' }, 400);
  const localRaw = await env.KV?.get('video:' + sha);
  const local = localRaw ? JSON.parse(localRaw) : null;
  let remote = null;
  try {
    const r = await fetch(schedulerBase(env) + '/queue/status?sha256=' + sha, {
      headers: schedulerToken(env) ? { Authorization: 'Bearer ' + schedulerToken(env) } : {},
      signal: AbortSignal.timeout(30000),
    });
    remote = await r.json().catch(() => null);
  } catch { remote = { error: 'remote_status_unreachable' }; }
  return json({ ok: true, local, remote });
}

// ---------- 定时兜底排空 ----------

async function drain(env) {
  let summary;
  try {
    const r = await fetch(schedulerBase(env) + '/queue/run', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + schedulerToken(env), 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(180000),
    });
    const data = await r.json().catch(() => ({ ok: false }));
    summary = {
      at: new Date().toISOString(),
      ok: !!data.ok,
      scanned: data.scanned ?? null,
      new_upload_attempts: data.new_upload_attempts ?? null,
      results: data.results ?? [],
    };
  } catch (e) {
    summary = { at: new Date().toISOString(), ok: false, error: String(e.message).slice(0, 200) };
  }
  await env.KV?.put('video:latest-run', JSON.stringify(summary));
  return summary;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');

    if (request.method === 'GET' && path === '/health') {
      return json({
        ok: true,
        engine: 'cloud-hub',
        kv: !!env.KV,
        scheduler_configured: !!env.SCHEDULER_URL || true,
        platforms: { youtube: true, tiktok: false },
        boundary: 'worker does not render video or call models; submit a produced mp4',
      });
    }

    // 写接口一律鉴权；/video/status 读取也携带回执，一并鉴权。
    const protectedWrite = ['/task/create', '/task/status', '/task/list', '/task/cancel', '/task/result', '/video/submit'];
    const protectedRead = ['/video/status'];
    if (protectedWrite.includes(path) || protectedRead.includes(path)) {
      if (!bearer(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
    }

    try {
      if (path === '/task/create' && request.method === 'POST') return taskCreate(env, await request.json().catch(() => ({})));
      if (path === '/task/status' && request.method === 'POST') return taskStatus(env, await request.json().catch(() => ({})));
      if (path === '/task/list' && request.method === 'POST') return taskList(env);
      if (path === '/task/cancel' && request.method === 'POST') return taskCancel(env, await request.json().catch(() => ({})));
      if (path === '/task/result' && request.method === 'POST') return taskResult(env, await request.json().catch(() => ({})));
      if (path === '/video/submit' && request.method === 'POST') return submitVideo(request, env);
      if (path === '/video/status' && request.method === 'GET') return videoStatus(env, url.searchParams.get('sha256'));
      return json({ ok: false, error: 'not_found' }, 404);
    } catch (e) {
      return json({ ok: false, error: 'cloud_hub_failed', detail: String(e.message).slice(0, 200) }, 500);
    }
  },
  async scheduled(_event, env, _ctx) {
    await drain(env);
  },
};
