// LTZZZ · Claude (Anthropic Messages API) proxy — Cloudflare Worker v2
// 槽位：did:ltzzz:claude（审计席）
// v1→v2 变更：新增 GET /health（部署可验证性，对齐千问/Kimi/DeepSeek 槽位规范）；
//   新增 ANTHROPIC_MODEL 可配；CORS 允许 GET。
// Key 只放 Worker Secret（wrangler secret put ANTHROPIC_API_KEY），浏览器与仓库都不接触 Key。
//
// Usage: POST { model, messages:[{role,content}], system?, max_tokens?, temperature? }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: cors() });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: 'ltzzz-claude-proxy',
        did: 'did:ltzzz:claude',
        has_key: Boolean(env.ANTHROPIC_API_KEY),
        model_configured: Boolean(env.ANTHROPIC_MODEL),
        time: new Date().toISOString()
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only', hint: 'Use GET /health to test deployment.' }, 405);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'Missing ANTHROPIC_API_KEY secret', stage: 'worker_config' }, 500);
    }

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!messages.length) return json({ error: 'messages is required', stage: 'request_validation' }, 400);

      const payload = {
        model: body.model || env.ANTHROPIC_MODEL || 'claude-sonnet-5',
        max_tokens: body.max_tokens || 1024,
        messages: messages.map(function (m) {
          return {
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content)
          };
        })
      };
      if (body.system) payload.system = String(body.system);
      if (typeof body.temperature === 'number') payload.temperature = body.temperature;

      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const text = await upstream.text();
      // 原样透传上游状态码，便于区分"余额不足(400 credit balance too low)"与"鉴权失败(401)"
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json; charset=utf-8' }
  });
}
