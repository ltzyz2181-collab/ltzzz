/**
 * LTZZZ YouTube Data API 代理 Worker
 * Google OAuth 2.0 + YouTube Data API v3 videos.insert
 * 支持 PRIVATE / UNLISTED / PUBLIC 三种可见性。
 *
 * 需要 Cloudflare Secret：
 *   GOOGLE_CLIENT_ID     = Google Cloud OAuth Client ID
 *   GOOGLE_CLIENT_SECRET = Google Cloud OAuth Client Secret
 * 需要 Cloudflare KV（绑定名 KV）：
 *   OAuth token 服务端存储（绝不放 localStorage）
 *
 * API 路由（均 POST）：
 *   POST /auth/start    { redirect_uri? }        → { auth_url }
 *   POST /auth/callback { code, redirect_uri }   → 换 token 存 KV，返回 { channel }
 *   POST /status        { user_key? }            → 连接状态 + 最后发布 + 发布状态
 *   POST /upload        { video_url, title?, description?, privacy? } → videos.insert
 *        privacy: 'private' | 'unlisted' | 'public'（默认 'private'，测试发布不公开）
 *
 * 说明：videos.insert 用可恢复上传（resumable upload）：先拿 upload URL，再分段上传，最后 insert。
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    // OAuth 回调是浏览器 GET 跳转（?code=xxx&state=xxx）
    if (request.method === 'GET' && url.pathname.replace(/\/+$/, '') === '/auth/callback') {
      return authCallback(env, Object.fromEntries(url.searchParams));
    }
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

    const path = url.pathname.replace(/\/+$/, '');
    try {
      switch (path) {
        case '/auth/start': return json(await authStart(env, body, url));
        case '/auth/callback': return authCallback(env, body);
        case '/status': return json(await status(env, body));
        case '/upload': return json(await upload(env, body));
        default: return json({ error: 'Unknown path: ' + path }, 404);
      }
    } catch (e) {
      return json({ error: e.message || String(e), stack: e.stack }, e.status || 502);
    }
  },
};

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YT_API = 'https://www.googleapis.com/upload/youtube/v3/videos';

function need(env) {
  const missing = [];
  if (!env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if (!env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  if (!env.KV) missing.push('KV binding');
  return missing;
}

function userKey(body) {
  return body.user_key || 'default';
}

async function authStart(env, body, requestUrl) {
  const missing = need(env);
  if (missing.length) throw Object.assign(new Error('Missing secrets: ' + missing.join(', ')), { status: 500 });
  const redirectUri = (body.redirect_uri || '').trim() || (requestUrl.origin + '/auth/callback');
  const returnTo = (body.return_to || '').trim() || 'https://ltzzz.com/creator-lab.html';
  const state = btoa(JSON.stringify({ r: returnTo, u: redirectUri, t: Date.now() })).replace(/=/g, '');
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return { ok: true, auth_url: AUTH_URL + '?' + params.toString(), redirect_uri: redirectUri, return_to: returnTo };
}

async function authCallback(env, body) {
  const missing = need(env);
  if (missing.length) throw Object.assign(new Error('Missing secrets: ' + missing.join(', ')), { status: 500 });
  const code = (body.code || '').trim();
  let returnTo = 'https://ltzzz.com/creator-lab.html';
  let redirectUri = 'https://ltzzz-youtube-post.ltzyz2181.workers.dev/auth/callback';
  try {
    const st = JSON.parse(atob(body.state || ''));
    if (st && st.r) returnTo = st.r;
    if (st && st.u) redirectUri = st.u;
  } catch {}
  if (body.error) {
    return redirect(returnTo + '?yt_status=' + encodeURIComponent('error:' + body.error));
  }
  if (!code) throw Object.assign(new Error('Missing code or redirect_uri'), { status: 400 });

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error('Google token exchange failed: ' + r.status + ' ' + JSON.stringify(data)), { status: r.status });

  const accessToken = data.access_token;
  if (!accessToken) throw Object.assign(new Error('No access_token'), { status: 502 });

  // 获取频道信息
  let channel = null;
  try {
    const cr = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { 'Authorization': 'Bearer ' + accessToken },
    });
    const cd = await cr.json().catch(() => ({}));
    channel = cd.items?.[0]?.snippet?.title || null;
  } catch {}

  const uk = body.user_key || channel || 'default';
  await env.KV.put('yt:' + uk, JSON.stringify({
    access_token: accessToken,
    refresh_token: data.refresh_token || null,
    expires_in: data.expires_in || null,
    scope: data.scope || null,
    connected_at: new Date().toISOString(),
    last_publish: null,
    publish_status: 'none',
    channel,
  }));
  return redirect(returnTo + '?yt_status=' + encodeURIComponent('connected&user_key=' + uk));
}

async function status(env, body) {
  const uk = userKey(body);
  const raw = await env.KV.get('yt:' + uk, 'json');
  if (!raw) return { connected: false, last_publish: null, publish_status: 'not_connected' };
  return {
    connected: true,
    user_key: uk,
    channel: raw.channel,
    last_publish: raw.last_publish,
    publish_status: raw.publish_status,
    connected_at: raw.connected_at,
  };
}

async function refreshIfNeeded(env, tokens, uk) {
  if (!tokens.refresh_token) return tokens;
  // 简单判断：过期时间已过则刷新（token 有效期 1 小时）
  const created = tokens.connected_at ? Date.parse(tokens.connected_at) : Date.now();
  const expiresMs = (tokens.expires_in || 3600) * 1000;
  if (Date.now() - created < expiresMs - 60000) return tokens;
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: tokens.refresh_token,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw Object.assign(new Error('Google token refresh failed: ' + r.status), { status: r.status });
  tokens.access_token = d.access_token;
  tokens.connected_at = new Date().toISOString();
  tokens.expires_in = d.expires_in || 3600;
  await env.KV.put('yt:' + uk, JSON.stringify(tokens));
  return tokens;
}

async function upload(env, body) {
  const uk = userKey(body);
  const raw = await env.KV.get('yt:' + uk, 'json');
  if (!raw) throw Object.assign(new Error('YouTube not connected. Run /auth/start first.'), { status: 401 });
  const tokens = await refreshIfNeeded(env, raw, uk);

  const videoUrl = (body.video_url || '').trim();
  if (!videoUrl) throw Object.assign(new Error('Missing video_url'), { status: 400 });
  const title = (body.title || '').trim().slice(0, 100) || 'LTZZZ';
  const description = (body.description || '').trim().slice(0, 5000) || '';
  const privacy = (body.privacy || 'private').toLowerCase();
  if (!['private', 'unlisted', 'public'].includes(privacy)) {
    throw Object.assign(new Error('privacy must be private|unlisted|public'), { status: 400 });
  }

  // 下载源视频
  const src = await fetch(videoUrl);
  if (!src.ok) throw Object.assign(new Error('Cannot fetch source video: ' + src.status), { status: 502 });
  const buf = await src.arrayBuffer();

  // 可恢复上传：拿 upload URL
  const initUrl = YT_API + '?uploadType=resumable&part=snippet,status';
  const initRes = await fetch(initUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + tokens.access_token,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      snippet: { title, description },
      status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
    }),
  });
  if (!initRes.ok) {
    const t = await initRes.text().catch(() => '');
    throw Object.assign(new Error('YouTube upload init failed: ' + initRes.status + ' ' + t.slice(0, 300)), { status: initRes.status });
  }
  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) throw Object.assign(new Error('No upload location header'), { status: 502 });

  // 上传视频二进制
  const up = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/*',
      'Content-Length': String(buf.byteLength),
    },
    body: buf,
  });
  const upData = await up.json().catch(() => ({}));
  if (!up.ok) {
    throw Object.assign(new Error('YouTube upload failed: ' + up.status + ' ' + JSON.stringify(upData)), { status: up.status });
  }
  const videoId = upData.id;
  if (!videoId) throw Object.assign(new Error('No video id returned'), { status: 502 });

  await env.KV.put('yt:' + uk, JSON.stringify({
    ...tokens,
    last_publish: new Date().toISOString(),
    publish_status: 'published',
    last_video_id: videoId,
    last_privacy: privacy,
  }));
  return { ok: true, video_id: videoId, privacy, title, published_at: new Date().toISOString() };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}

function redirect(location) {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': location,
      'Access-Control-Allow-Origin': '*',
    },
  });
}
