// LTZZZ · 豆包（火山方舟）API proxy — Cloudflare Worker
// 与 deepseek-proxy-worker.js 同款结构：Key 只放 Worker Secret，浏览器不接触 Key。
//
// Secrets（在 Cloudflare Dashboard 或 wrangler secret put）：
//   ARK_API_KEY          必填 — 方舟 API Key（或 Agent Plan 专属 Key）
//   DOUBAO_MODEL         可选 — 默认模型 ID，如 doubao-seed-1-6-250615 或 doubao-seed-evolving
//   DOUBAO_BASE_URL      可选 — 默认 OpenAI 兼容：
//                          https://ark.cn-beijing.volces.com/api/v3/chat/completions
//                        Agent Plan 可改为：
//                          https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions
//                        （以你控制台/文档当前路径为准）
//
// 浏览器 POST JSON：
//   { "messages": [{ "role": "user", "content": "..." }], "model": "可选", "temperature": 0.4, "max_tokens": 1200 }
//
// 部署示例：
//   npx wrangler deploy doubao-proxy-worker.js --name ltzzz-doubao-proxy
//   npx wrangler secret put ARK_API_KEY
//

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: cors() });
    }
    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405);
    }
    if (!env.ARK_API_KEY) {
      return json({ error: 'Missing ARK_API_KEY secret' }, 500);
    }

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!messages.length) return json({ error: 'messages is required' }, 400);

      const model =
        body.model ||
        env.DOUBAO_MODEL ||
        'doubao-seed-1-6-250615';

      const upstreamUrl =
        env.DOUBAO_BASE_URL ||
        'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

      const upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.ARK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature:
            typeof body.temperature === 'number' ? body.temperature : 0.4,
          max_tokens: body.max_tokens || 1200,
          stream: false
        })
      });

      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: {
          ...cors(),
          'Content-Type': 'application/json; charset=utf-8'
        }
      });
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  }
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors(),
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
