/**
 * LTZZZ webhook receiver.
 * Accepts signed POST /hook. Does not publish video or move funds.
 * Secret: wrangler secret put WEBHOOK_SECRET
 */
const ALLOWED = new Set(['ping', 'patrol', 'record-result', 'deploy-pages']);
const FORBIDDEN = new Set(['publish', 'pay', 'withdraw', 'transfer', 'public']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') {
      return new Response('ok', { headers: cors() });
    }
    if (path === '/health' && request.method === 'GET') {
      return json({
        ok: true,
        service: 'ltzzz-webhook',
        allowed: [...ALLOWED],
        forbidden: [...FORBIDDEN],
        has_secret: Boolean(env.WEBHOOK_SECRET),
      });
    }
    if (path === '/hook' && request.method === 'POST') {
      return handleHook(request, env);
    }
    return json({ error: 'unknown path' }, 404);
  },
};

async function handleHook(request, env) {
  if (!env.WEBHOOK_SECRET) {
    return json({ ok: false, error: 'WEBHOOK_SECRET missing' }, 503);
  }
  const given = request.headers.get('x-ltzzz-secret') || '';
  if (given !== env.WEBHOOK_SECRET) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const action = String(body.action || 'ping');
  if (FORBIDDEN.has(action)) {
    return json({ ok: false, error: 'forbidden action', action }, 403);
  }
  if (!ALLOWED.has(action)) {
    return json({ ok: false, error: 'unknown action', action }, 400);
  }
  return json({
    ok: true,
    accepted: true,
    action,
    next: 'trigger GitHub repository_dispatch with same action',
    publish: false,
    payment: false,
    time: new Date().toISOString(),
  });
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-ltzzz-secret',
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors() },
  });
}
