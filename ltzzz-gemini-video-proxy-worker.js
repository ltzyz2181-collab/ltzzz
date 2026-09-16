/**
 * LTZZZ Gemini / Veo 视频生成代理 Worker
 * 用途：视频引擎 fallback 链的「第一优先」引擎。
 *   把 prompt 提交给 Google Gemini API（Veo 视频生成），异步轮询返回 MP4 直链。
 *   设计目标：不再依赖 Google Flow 网页；Gemini 可用时直接用 API 出片。
 *
 * 需要 Cloudflare Secret（绝不写入 HTML / GitHub / JS）：
 *   GEMINI_API_KEY       = Google AI Studio 的 API Key
 * 可选 Cloudflare Variable（Secret 也可）：
 *   GEMINI_VIDEO_MODEL   = 模型名，默认 veo-3.1-generate-preview（Gemini API 官方模型 ID）
 *
 * 路由：
 *   GET  /health   → 真实状态 { ok, service, version, gemini_key_configured, model }
 *                    仅报告 Key 是否已配置，绝不伪造「可用」。
 *   POST /generate → 提交长任务：
 *       body { prompt, duration?, aspect_ratio?, wait?, wait_seconds? }
 *       - 不带 wait：立即返回 { ok, operation_name, model }（异步）
 *       - 带 wait:true：在 Worker 内轮询到完成，返回 { ok, status, video_url?, error? }
 *   POST /status   → 轮询 { operation_name } → { status, video_url?, error? }
 *       status: queued | running | succeeded | failed
 *
 * 失败处理：Key 缺失 / 模型未开通 / API 报错，全部原样返回真实错误，
 * 由前端据此自动 fallback 到 Seedance / FFmpeg 本地合成。
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (request.method === 'GET' && path === '/health') {
        return json(await health(env));
      }
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed. Use GET /health or POST /generate|/status' }, 405);
      }
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

      switch (path) {
        case '/generate':
          return json(await generate(env, body, ctx));
        case '/status':
          return json(await status(env, body));
        default:
          return json({ error: 'Unknown path: ' + path }, 404);
      }
    } catch (e) {
      return json({ error: e.message || String(e), code: e.code || 'UNKNOWN' }, e.status || 502);
    }
  },
};

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

function model(env) {
  return (env.GEMINI_VIDEO_MODEL || 'veo-3.1-generate-preview').trim();
}

function health(env) {
  return {
    ok: true,
    service: 'ltzzz-gemini-video-proxy',
    version: '1.0.0',
    gemini_key_configured: !!(env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 0),
    model: model(env),
    time: new Date().toISOString(),
  };
}

async function submitTask(env, body) {
  if (!env.GEMINI_API_KEY) {
    throw Object.assign(new Error('Missing GEMINI_API_KEY secret'), { status: 500 });
  }
  const prompt = (body.prompt || '').trim();
  if (!prompt) throw Object.assign(new Error('Missing prompt'), { status: 400 });

  // Veo 官方只接受 4/6/8 秒；非法值就近取整（5→4/6，7→8），避免无谓 400
  const VEO_DURATIONS = [4, 6, 8];
  let duration = Math.round(Number(body.duration) || 8);
  if (!VEO_DURATIONS.includes(duration)) {
    duration = VEO_DURATIONS.reduce((a, b) => Math.abs(b - duration) < Math.abs(a - duration) ? b : a, VEO_DURATIONS[0]);
  }
  const aspectRatio = ['9:16', '16:9', '1:1', '21:9', '4:3', '3:4'].includes(body.aspect_ratio)
    ? body.aspect_ratio : '9:16';

  const payload = {
    instances: [{ prompt }],
    parameters: {
      aspectRatio,
      durationSeconds: duration,
      numberOfVideos: 1,
    },
  };
  // 竖屏 9:16 + 8 秒时请求 1080p → 精确 1080×1920；其余交给模型默认（720p），如实上报
  if (duration === 8 && !body.resolution) payload.parameters.resolution = '1080p';
  else if (['720p', '1080p', '4k'].includes(body.resolution)) payload.parameters.resolution = body.resolution;

  const r = await fetch(BASE + '/models/' + encodeURIComponent(model(env)) + ':predictLongRunning', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.GEMINI_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data.error?.message || data.error?.status || (r.status + ' ' + JSON.stringify(data));
    throw Object.assign(new Error('Gemini submit failed: ' + msg), {
      status: r.status,
      code: data.error?.code || r.status,
    });
  }
  const operationName = data.name;
  if (!operationName) {
    throw Object.assign(new Error('No operation name in response: ' + JSON.stringify(data)), { status: 502 });
  }
  return { operation_name: operationName, model: model(env), duration, aspect_ratio: aspectRatio };
}

async function queryOperation(env, operationName) {
  if (!operationName) throw Object.assign(new Error('Missing operation_name'), { status: 400 });
  if (!env.GEMINI_API_KEY) throw Object.assign(new Error('Missing GEMINI_API_KEY secret'), { status: 500 });
  const r = await fetch(BASE + '/' + encodeURIComponent(operationName), {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + env.GEMINI_API_KEY },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data.error?.message || data.error?.status || (r.status + ' ' + JSON.stringify(data));
    throw Object.assign(new Error('Gemini status failed: ' + msg), {
      status: r.status,
      code: data.error?.code || r.status,
    });
  }

  // 未完成：{ done:false, metadata:{ state: "PROCESSING" } }
  if (!data.done) {
    const state = data.metadata?.state || 'running';
    return { operation_name: operationName, status: state.toLowerCase().includes('queu') ? 'queued' : 'running', raw_state: state };
  }

  // 完成：response.generateVideoResponse.generatedSamples[0].video.uri（兼容 response.generatedSamples）
  const resp = data.response || {};
  const gvr = resp.generateVideoResponse || resp;
  const samples = Array.isArray(gvr.generatedSamples) ? gvr.generatedSamples : null;
  if (samples && samples.length) {
    const video = samples[0].video || {};
    if (video.uri) {
      return {
        operation_name: operationName,
        status: 'succeeded',
        video_url: video.uri,
        mime_type: video.mimeType || 'video/mp4',
      };
    }
    const errText = samples[0].error || samples[0].status || 'No video uri in generated sample';
    return { operation_name: operationName, status: 'failed', error: errText };
  }
  const errText = data.response?.error || data.error?.message || 'Operation done but no generated sample';
  return { operation_name: operationName, status: 'failed', error: typeof errText === 'string' ? errText : JSON.stringify(errText) };
}

async function generate(env, body, ctx) {
  const sub = await submitTask(env, body);
  if (!body.wait) return { ok: true, status: 'queued', ...sub };

  const maxWait = Math.min(Number(body.wait_seconds) || 240, 600);
  const deadline = Date.now() + maxWait * 1000;
  let last = null;
  while (Date.now() < deadline) {
    last = await queryOperation(env, sub.operation_name);
    if (last.status === 'succeeded') return { ok: true, ...sub, ...last };
    if (last.status === 'failed') return { ok: false, ...sub, ...last };
    await sleep(6000, ctx);
  }
  return { ok: false, status: 'pending', timeout: true, timeout_seconds: maxWait, ...sub, ...(last || {}) };
}

async function status(env, body) {
  const operationName = (body.operation_name || '').trim();
  if (!operationName) throw Object.assign(new Error('Missing operation_name'), { status: 400 });
  return queryOperation(env, operationName);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}

function sleep(ms, ctx) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (ctx) ctx.waitUntil?.(Promise.resolve(t).then(() => clearTimeout(t)));
    else t.unref?.();
  });
}
