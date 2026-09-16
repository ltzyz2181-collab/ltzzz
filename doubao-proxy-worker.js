// LTZZZ · 豆包（火山方舟）API Proxy
// Cloudflare Worker
// Secrets / Variables required in Cloudflare Worker:
//   ARK_API_KEY   = your Ark API key (Secret)
//   DOUBAO_MODEL  = the model ID enabled in Volcengine Ark
//
// This file intentionally contains NO API key.

const UPSTREAM = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405);
    }

    if (!env.ARK_API_KEY) {
      return json({ error: 'Missing ARK_API_KEY secret' }, 500);
    }

    if (!env.DOUBAO_MODEL) {
      return json({ error: 'Missing DOUBAO_MODEL variable' }, 500);
    }

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages : [];

      if (!messages.length) {
        return json({ error: 'messages is required' }, 400);
      }

      const payload = {
        model: env.DOUBAO_MODEL,
        messages,
        temperature: typeof body.temperature === 'number' ? body.temperature : 0.4,
        max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 1200,
        stream: false
      };

      const upstream = await fetch(UPSTREAM, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.ARK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const text = await upstream.text();

      return new Response(text, {
        status: upstream.status,
        headers: {
          ...corsHeaders(),
          'Content-Type': 'application/json; charset=utf-8'
        }
      });
    } catch (error) {
      return json({ error: String(error) }, 500);
    }
  }
};

function corsHeaders() {
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
      ...corsHeaders(),
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
