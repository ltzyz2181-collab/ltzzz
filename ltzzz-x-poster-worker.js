// LTZZZ 路 X (Twitter) 鑷姩鍙戝笘 Worker
// POST /tweet   { "text": "..." }  鈫?鍙戜竴鏉℃帹鏂?// GET  /health

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

// Web Crypto HMAC-SHA1 鈫?Base64
async function hmacSha1Base64(keyStr, dataStr) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(keyStr), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(dataStr));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// RFC 3986 涓ユ牸 percent-encode锛堟瘮 encodeURIComponent 鏇翠弗鏍硷級
function rfc3986(s) {
  return encodeURIComponent(s)
    .replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28')
    .replace(/\)/g, '%29').replace(/\*/g, '%2A');
}

async function oauthHeader(method, url, params, secrets) {
  const oauth = {
    oauth_consumer_key: secrets.consumerKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: secrets.accessToken,
    oauth_version: '1.0'
  };
  const all = { ...oauth, ...params };
  const keys = Object.keys(all).sort();
  const paramStr = keys.map(k => `${rfc3986(k)}=${rfc3986(all[k])}`).join('&');
  const base = `${method}&${rfc3986(url)}&${rfc3986(paramStr)}`;
  const signingKey = `${rfc3986(secrets.consumerSecret)}&${rfc3986(secrets.accessSecret)}`;
  oauth.oauth_signature = await hmacSha1Base64(signingKey, base);
  return 'OAuth ' + Object.keys(oauth).map(k => `${k}="${rfc3986(oauth[k])}"`).join(', ');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'ltzzz-x-poster',
        configured: {
          consumer: !!env.X_CONSUMER_KEY,
          access: !!env.X_ACCESS_TOKEN,
          tokenSecret: !!env.X_ACCESS_SECRET
        }
      });
    }

    if (url.pathname === '/tweet' && request.method === 'POST') {
      const auth = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (auth !== env.LTZZZ_AGENT_TOKEN) return json({ error: 'unauthorized' }, 401);

      const body = await request.json().catch(() => ({}));
      const text = String(body.text || '').slice(0, 280);
      if (!text) return json({ error: 'text is required' }, 400);

      const secrets = {
        consumerKey: env.X_CONSUMER_KEY,
        consumerSecret: env.X_CONSUMER_SECRET,
        accessToken: env.X_ACCESS_TOKEN,
        accessSecret: env.X_ACCESS_SECRET
      };
      if (!secrets.consumerKey || !secrets.accessToken) {
        return json({ ok: false, error: 'X credentials not configured' }, 500);
      }

      const apiUrl = 'https://api.twitter.com/2/tweets';
      const header = await oauthHeader('POST', apiUrl, {}, secrets);
      if (new URL(request.url).searchParams.has('debug')) return json({debug: header, secrets: secrets});
      const r = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': header,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text })
      });
      const j = await r.json();
      return json({ ok: r.ok, data: j, http: r.status }, r.ok ? 200 : 500);
    }

    return json({ error: 'not found' }, 404);
  }
};
