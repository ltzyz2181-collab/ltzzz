// LTZZZ · Claude (Anthropic Messages API) proxy — Cloudflare Worker
// Deploy this file as a Cloudflare Worker, then add secret: ANTHROPIC_API_KEY
// The key stays in the Worker environment and is never sent to the browser.
// Usage from browser: POST { model, messages:[{role,content}], system?, max_tokens?, temperature? }

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: cors() });
    }
    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'Missing ANTHROPIC_API_KEY secret' }, 500);
    }

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!messages.length) return json({ error: 'messages is required' }, 400);

      const payload = {
        model: body.model || 'claude-sonnet-5',
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
      return new Response(text, {
        status: upstream.status,
        headers: { ...cors(), 'Content-Type': 'application/json; charset=utf-8' }
      });
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  }
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json; charset=utf-8' }
  });
}
