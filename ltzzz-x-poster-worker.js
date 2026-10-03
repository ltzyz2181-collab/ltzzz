// LTZZZ X (Twitter) auto-poster Worker
// POST /tweet   { "text": "..." } -> post a tweet (OAuth2 Bearer preferred, OAuth1 fallback)
// POST /refresh -> exchange refresh token for new access token (OAuth2)
// GET  /health

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

async function hmacSha1Base64(keyStr, dataStr) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(keyStr), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(dataStr));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

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
        },
        oauth2: {
          userToken: !!env.X_USER_TOKEN,
          refreshToken: !!env.X_REFRESH_TOKEN,
          client: !!env.X_CLIENT_ID && !!env.X_CLIENT_SECRET
        }
      });
    }

    if (url.pathname === '/tweet' && request.method === 'POST') {
      const auth = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (auth !== env.LTZZZ_AGENT_TOKEN) return json({ error: 'unauthorized' }, 401);

      const body = await request.json().catch(() => ({}));
      const text = String(body.text || '').slice(0, 280);
      if (!text) return json({ error: 'text is required' }, 400);

      const apiUrl = 'https://api.x.com/2/tweets';
      let headers = { 'Content-Type': 'application/json' };

      if (env.X_USER_TOKEN) {
        // OAuth2 user-context Bearer (preferred, no signature)
        headers['Authorization'] = 'Bearer ' + env.X_USER_TOKEN;
      } else {
        const secrets = {
          consumerKey: env.X_CONSUMER_KEY,
          consumerSecret: env.X_CONSUMER_SECRET,
          accessToken: env.X_ACCESS_TOKEN,
          accessSecret: env.X_ACCESS_SECRET
        };
        if (!secrets.consumerKey || !secrets.accessToken) {
          return json({ ok: false, error: 'X credentials not configured' }, 500);
        }
        const header = await oauthHeader('POST', apiUrl, {}, secrets);
        if (url.searchParams.has('debug')) return json({ debug: header, secrets: secrets });
        headers['Authorization'] = header;
      }

      const r = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text })
      });
      const j = await r.json().catch(() => ({}));
      return json({ ok: r.ok, data: j, http: r.status }, r.ok ? 200 : 500);
    }

    if (url.pathname === '/refresh' && request.method === 'POST') {
      const auth = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (auth !== env.LTZZZ_AGENT_TOKEN) return json({ error: 'unauthorized' }, 401);
      if (!env.X_REFRESH_TOKEN || !env.X_CLIENT_ID || !env.X_CLIENT_SECRET) {
        return json({ ok: false, error: 'refresh credentials not configured' }, 500);
      }
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: env.X_REFRESH_TOKEN,
        client_id: env.X_CLIENT_ID,
        client_secret: env.X_CLIENT_SECRET
      });
      const r = await fetch('https://api.x.com/2/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      const j = await r.json().catch(() => ({}));
      // NOTE: rotated refresh token (if any) must be re-injected by the operator.
      return json({ ok: r.ok, data: j, http: r.status }, r.ok ? 200 : 500);
    }

    return json({ error: 'not found' }, 404);
  }
};
