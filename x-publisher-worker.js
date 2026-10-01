/**
 * LTZZZ X Publisher
 * Activation date: 2026-10-01 (Asia/Shanghai).
 * Secrets: X_CONSUMER_KEY / X_CONSUMER_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET（OAuth 1.0a 发推签名）
 */

const ACTIVATION = '2026-10-01T00:00:00+08:00';
const POSTS = [
  'LTZZZ｜观 · 行深 · 大道至简。先观事实，再行动；先验证结果，再形成记忆。',
  'LTZZZ Web3：AI 可以提出支付，但公共资金必须有预算、白名单、额度和可验证的链上结果。',
  'LTZZZ 长期方向：当 AI 改变谋生技能后，探索新的学习、工作和收入机会，让更多人有尊严地参与新的生产方式。',
  'LTZZZ Memory：已有凭证不重复注册，已有任务不重复部署；未知事实不猜，真实结果才进入长期记忆。'
];

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(publish(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/status') {
      return new Response(JSON.stringify({ ok: true, activation: ACTIVATION, now: new Date().toISOString() }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: false, error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  }
};

async function publish(env) {
  const now = new Date();
  if (now < new Date(ACTIVATION)) return { ok: true, skipped: true, reason: 'before_activation' };
  const { X_CONSUMER_KEY, X_CONSUMER_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = env;
  if (!X_CONSUMER_KEY || !X_CONSUMER_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET) {
    return { ok: false, blocked: true, reason: 'missing_oauth1_credentials' };
  }

  const day = Math.floor((now.getTime() - new Date(ACTIVATION).getTime()) / 86400000);
  const text = `${POSTS[day % POSTS.length]}\n\n#LTZZZ #AI #AGI #Web3`;
  const r = await oauth1Fetch('https://api.x.com/2/tweets', { text }, { key: X_CONSUMER_KEY, secret: X_CONSUMER_SECRET }, { token: X_ACCESS_TOKEN, secret: X_ACCESS_SECRET });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) };
}

/* ---- OAuth 1.0a 签名（HMAC-SHA1）---- */
function oenc(s) {
  return encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
async function hmacSha1B64(key, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(s)));
}
async function oauth1Fetch(url, body, consumer, access) {
  const oauth = {
    oauth_consumer_key: consumer.key,
    oauth_nonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000),
    oauth_token: access.token,
    oauth_version: '1.0',
  };
  const params = { ...oauth, ...body };
  const paramStr = Object.keys(params).sort().map((k) => `${oenc(k)}=${oenc(params[k])}`).join('&');
  const base = `POST&${oenc(url)}&${oenc(paramStr)}`;
  const sigKey = `${oenc(consumer.secret)}&${oenc(access.secret)}`;
  oauth.oauth_signature = await hmacSha1B64(sigKey, base);
  const authHeader = 'OAuth ' + Object.keys(oauth).sort().map((k) => `${oenc(k)}="${oenc(oauth[k])}"`).join(', ');
  return fetch(url, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
