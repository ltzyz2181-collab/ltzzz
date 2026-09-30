// LTZZZ · Kimi（Moonshot AI）API proxy — Cloudflare Worker
// 槽位：did:ltzzz:kimi（总控挑战者，2026-09-30 起，接替 GPT 席位比拼）
// Key 只放 Worker Secret（wrangler secret put KIMI_API_KEY），浏览器与仓库都不接触 Key。
//
// Secrets / Variables：
//   KIMI_API_KEY   必填 — Moonshot 开放平台 API Key（sk- 开头）
//   KIMI_MODEL     可选 — 默认 moonshot-v1-32k；长上下文任务用 moonshot-v1-128k
//   KIMI_BASE_URL  可选 — 默认 OpenAI 兼容 Chat Completions 地址
//
// 健康检查：GET /health
// 调用：POST /  { messages, model?, temperature?, max_tokens? }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: cors() });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: 'ltzzz-kimi-proxy',
        did: 'did:ltzzz:kimi',
        has_key: Boolean(env.KIMI_API_KEY),
        model_configured: Boolean(env.KIMI_MODEL),
        time: new Date().toISOString()
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only', hint: 'Use GET /health to test deployment.' }, 405);
    }
    if (!env.KIMI_API_KEY) {
      return json({ error: 'Missing KIMI_API_KEY secret', stage: 'worker_config' }, 500);
    }

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!messages.length) {
        return json({ error: 'messages is required', stage: 'request_validation' }, 400);
      }

      const model = body.model || env.KIMI_MODEL || 'moonshot-v1-32k';

      const upstreamUrl =
        env.KIMI_BASE_URL ||
        'https://api.moonshot.cn/v1/chat/completions';

      const upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.KIMI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: typeof body.temperature === 'number' ? body.temperature : 0.4,
          max_tokens: Number.isInteger(body.max_tokens) ? body.max_tokens : 2000,
          stream: false
        })
      });

      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: {
          ...cors(),
          'Content-Type': 'application/json; charset=utf-8',
          'X-LTZZZ-Upstream-Status': String(upstream.status)
        }
      });
    } catch (e) {
      return json({ error: String(e?.message || e), stage: 'worker_runtime' }, 500);
    }
  }
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json; charset=utf-8' }
  });
}
