// LTZZZ · DeepSeek API proxy (Cloudflare Worker)
// Deploy this file as a Cloudflare Worker, then add secret: DEEPSEEK_API_KEY
// The key stays in the Worker environment and is never sent to the browser.

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: cors() });
    }
    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405);
    }
    if (!env.DEEPSEEK_API_KEY) {
      return json({ error: 'Missing DEEPSEEK_API_KEY secret' }, 500);
    }

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!messages.length) return json({ error: 'messages is required' }, 400);

      const upstream = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: body.model || 'deepseek-chat',
          messages,
          temperature: typeof body.temperature === 'number' ? body.temperature : 0.4,
          max_tokens: body.max_tokens || 1200,
          stream: false
        })
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json; charset=utf-8' }
  });
}
