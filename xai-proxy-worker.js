// LTZZZ · XAI (Grok) API proxy — Cloudflare Worker
// 槽位：did:ltzzz:grok（待 owner 提供 XAI_API_KEY 激活）
// Key 只放 Worker Secret（wrangler secret put XAI_API_KEY），不进代码/对话/回执。
//
// Secrets / Variables：
//   XAI_API_KEY   必填 — xAI API Key（xai- 开头）
//   XAI_MODEL     可选 — 默认 grok-3；可用 grok-3-mini 等
//   XAI_BASE_URL  可选 — 默认 https://api.x.ai/v1/chat/completions
//
// 健康检查：GET /health → {ok, service, did, has_key, model_configured}
// 调用：POST /  { messages, model?, temperature?, max_tokens? } → 透传上游，原样带状态码

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: cors() });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: 'xai-proxy',
        did: 'did:ltzzz:grok',
        has_key: Boolean(env.XAI_API_KEY),
        model_configured: Boolean(env.XAI_MODEL),
        time: new Date().toISOString()
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only', hint: 'Use GET /health to test deployment.' }, 405);
    }
    if (!env.XAI_API_KEY) {
      return json({ error: 'Missing XAI_API_KEY secret', stage: 'worker_config' }, 500);
    }

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!messages.length) {
        return json({ error: 'messages is required', stage: 'request_validation' }, 400);
      }

      const model = body.model || env.XAI_MODEL || 'grok-3';

      const upstreamUrl = env.XAI_BASE_URL || 'https://api.x.ai/v1/chat/completions';

      const upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.XAI_API_KEY}`,
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
