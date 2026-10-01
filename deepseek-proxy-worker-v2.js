// LTZZZ · DeepSeek API proxy — Cloudflare Worker（v2，补齐健康检查）
// 槽位：did:ltzzz:deepseek（研究席 · 记忆与内容研究主力）
// v1→v2 变更：新增 GET /health（部署可验证性，对齐千问/Kimi 槽位规范）；
//   新增 DEEPSEEK_MODEL / DEEPSEEK_BASE_URL 可配；CORS 允许 GET。
// Key 只放 Worker Secret（wrangler secret put DEEPSEEK_API_KEY），浏览器与仓库都不接触 Key。
//
// Secrets / Variables：
//   DEEPSEEK_API_KEY   必填 — DeepSeek 官方 API Key（sk- 开头）
//   DEEPSEEK_MODEL     可选 — 默认 deepseek-chat
//   DEEPSEEK_BASE_URL  可选 — 默认官方 Chat Completions 地址
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
        service: 'ltzzz-deepseek-proxy',
        did: 'did:ltzzz:deepseek',
        has_key: Boolean(env.DEEPSEEK_API_KEY),
        model_configured: Boolean(env.DEEPSEEK_MODEL),
        time: new Date().toISOString()
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only', hint: 'Use GET /health to test deployment.' }, 405);
    }
    if (!env.DEEPSEEK_API_KEY) {
      return json({ error: 'Missing DEEPSEEK_API_KEY secret', stage: 'worker_config' }, 500);
    }

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!messages.length) {
        return json({ error: 'messages is required', stage: 'request_validation' }, 400);
      }

      const model = body.model || env.DEEPSEEK_MODEL || 'deepseek-chat';

      const upstreamUrl =
        env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/chat/completions';

      const upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: typeof body.temperature === 'number' ? body.temperature : 0.4,
          max_tokens: Number.isInteger(body.max_tokens) ? body.max_tokens : 1200,
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
