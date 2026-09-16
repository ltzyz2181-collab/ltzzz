/**
 * LTZZZ TikTok Content Posting API 代理 Worker
 * 使用 TikTok 官方 OAuth 2.0 + Content Posting API（video.publish）
 * 绝无模拟发布 / 浏览器自动点击。全部走官方 API。
 *
 * 需要 Cloudflare Secret：
 *   TIKTOK_CLIENT_KEY     = TikTok 开发者应用 client_key
 *   TIKTOK_CLIENT_SECRET  = TikTok 开发者应用 client_secret
 * 需要 Cloudflare KV（命名空间绑定名 KV）：
 *   存储每个用户的 access_token / refresh_token / open_id（服务端存储，绝不放 localStorage）
 *
 * API 路由（均 POST，返回 JSON）：
 *   POST /auth/start        { }                        → 返回 { auth_url }（跳转 TikTok 授权页）
 *   POST /auth/callback     { code }                   → 用 code 换 token，存 KV，返回 { open_id }
 *   POST /status            { user_key? }              → 账号连接状态 + 最后发布 + 发布状态
 *   POST /publish           { video_url, title?, privacy? } → video.publish 发布（测试发布用 privacy=0/1）
 *
 * 说明：TikTok Content Posting API 要求视频先上传（POST https://open.tiktokapis.com/v2/post/publish/video/init/ 拿 upload_url → PUT 上传 → POST video/publish/）。本 Worker 已实现完整三步。
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
        case '/publish': return json(await publish(env, body));
        default: return json({ error: 'Unknown path: ' + path }, 404);
      }
    } catch (e) {
      return json({ error: e.message || String(e), stack: e.stack }, e.status || 502);
    }
  },
};

const OAUTH_BASE = 'https://www.tiktok.com/v2/auth/authorize';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const API_BASE = 'https://open.tiktokapis.com/v2';

function need(env) {
  const missing = [];
  if (!env.TIKTOK_CLIENT_KEY) missing.push('TIKTOK_CLIENT_KEY');
  if (!env.TIKTOK_CLIENT_SECRET) missing.push('TIKTOK_CLIENT_SECRET');
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
  // return_to: 授权完成后浏览器回到的前端页面（默认 creator-lab）
  const returnTo = (body.return_to || '').trim() || 'https://ltzzz.com/creator-lab.html';
  // scopes: 需要 video.publish 与 user.info.basic
  const scopes = ['user.info.basic', 'video.publish'];
  const state = btoa(JSON.stringify({ r: returnTo, u: redirectUri, t: Date.now() })).replace(/=/g, '');
  const params = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY,
    response_type: 'code',
    scope: scopes.join(','),
    redirect_uri: redirectUri,
    state,
  });
  const authUrl = OAUTH_BASE + '?' + params.toString();
  return { ok: true, auth_url: authUrl, state, redirect_uri: redirectUri, return_to: returnTo };
}

async function authCallback(env, body) {
  const missing = need(env);
  if (missing.length) throw Object.assign(new Error('Missing secrets: ' + missing.join(', ')), { status: 500 });
  const code = (body.code || '').trim();
  // state 里携带 return_to；解析失败则回 creator-lab
  let returnTo = 'https://ltzzz.com/creator-lab.html';
  try {
    const st = JSON.parse(atob(body.state || ''));
    if (st && st.r) returnTo = st.r;
  } catch {}
  // redirect_uri 必须与 auth/start 一致：从 state 恢复（state 在 authStart 里编码了 u=redirect_uri）
  let redirectUri = 'https://ltzzz-tiktok-post.ltzyz2181.workers.dev/auth/callback';
  try {
    const st = JSON.parse(atob(body.state || ''));
    if (st && st.u) redirectUri = st.u;
  } catch {}
  if (body.error) {
    return redirect(returnTo + '?tt_status=' + encodeURIComponent('error:' + body.error));
  }
  if (!code) throw Object.assign(new Error('Missing code'), { status: 400 });

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      client_secret: env.TIKTOK_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw Object.assign(new Error('TikTok token exchange failed: ' + r.status + ' ' + JSON.stringify(data)), { status: r.status });
  }
  const accessToken = data.access_token;
  const openId = data.open_id;
  if (!accessToken || !openId) {
    throw Object.assign(new Error('No access_token/open_id in response'), { status: 502 });
  }
  // 服务端存储 token（KV），绝不放 localStorage
  const key = 'tt:' + openId;
  await env.KV.put(key, JSON.stringify({
    access_token: accessToken,
    refresh_token: data.refresh_token || null,
    expires_in: data.expires_in || null,
    scope: data.scope || null,
    connected_at: new Date().toISOString(),
    last_publish: null,
    publish_status: 'none',
  }));
  return redirect(returnTo + '?tt_status=' + encodeURIComponent('connected&open_id=' + openId));
}

async function status(env, body) {
  const uk = userKey(body);
  const tokens = await getTokens(env, uk);
  if (!tokens) {
    return { connected: false, last_publish: null, publish_status: 'not_connected' };
  }
  const openId = tokens.open_id;
  // 查用户信息
  let displayName = null;
  try {
    const r = await fetch(API_BASE + '/user/info/?fields=display_name,avatar_url', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + tokens.access_token },
    });
    const d = await r.json().catch(() => ({}));
    displayName = d.data?.user?.display_name || null;
  } catch {}
  return {
    connected: true,
    open_id: openId,
    display_name: displayName,
    last_publish: tokens.last_publish,
    publish_status: tokens.publish_status,
    connected_at: tokens.connected_at,
  };
}

async function publish(env, body) {
  const uk = userKey(body);
  const tokens = await getTokens(env, uk);
  if (!tokens) throw Object.assign(new Error('TikTok account not connected. Run /auth/start first.'), { status: 401 });
  const videoUrl = (body.video_url || '').trim();
  if (!videoUrl) throw Object.assign(new Error('Missing video_url'), { status: 400 });
  const title = (body.title || '').trim().slice(0, 2200) || 'LTZZZ';
  // privacy_level: 0 公开 / 1 私密（测试发布用 1）
  const privacyLevel = body.privacy !== undefined ? Number(body.privacy) : 1;

  // Step 1: init 拿 upload_url + publish_id
  const init = await fetch(API_BASE + '/post/publish/video/init/', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + tokens.access_token,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: { title, privacy_level: privacyLevel, disable_duet: false, disable_comment: false, disable_stitch: false },
      source_info: { source: 'FILE_UPLOAD', video_size: body.video_size || 0, chunk_size: body.chunk_size || 0, total_chunk_count: body.total_chunk_count || 1 },
    }),
  });
  const initData = await init.json().catch(() => ({}));
  if (!init.ok) {
    throw Object.assign(new Error('TikTok init failed: ' + init.status + ' ' + JSON.stringify(initData)), { status: init.status });
  }
  const publishId = initData.data?.publish_id;
  const uploadUrl = initData.data?.upload_url;
  if (!publishId || !uploadUrl) {
    throw Object.assign(new Error('No publish_id/upload_url from init: ' + JSON.stringify(initData)), { status: 502 });
  }

  // Step 2: 下载源视频并 PUT 上传（Worker 需能访问该 URL；本地合成后可先传到公开可读的 R2/临时地址）
  const src = await fetch(videoUrl);
  if (!src.ok) throw Object.assign(new Error('Cannot fetch source video: ' + src.status), { status: 502 });
  const buf = await src.arrayBuffer();
  const up = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(buf.byteLength) },
    body: buf,
  });
  if (!up.ok) throw Object.assign(new Error('TikTok upload failed: ' + up.status), { status: up.status });

  // Step 3: 确认发布
  const pub = await fetch(API_BASE + '/post/publish/video/publish/', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + tokens.access_token,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const pubData = await pub.json().catch(() => ({}));
  if (!pub.ok) {
    throw Object.assign(new Error('TikTok publish failed: ' + pub.status + ' ' + JSON.stringify(pubData)), { status: pub.status });
  }
  // 更新 KV 状态
  await env.KV.put('tt:' + uk, JSON.stringify({
    ...tokens,
    last_publish: new Date().toISOString(),
    publish_status: 'published',
    last_publish_id: publishId,
  }));
  return { ok: true, publish_id: publishId, privacy_level: privacyLevel, published_at: new Date().toISOString() };
}

async function getTokens(env, uk) {
  const raw = await env.KV.get('tt:' + uk, 'json');
  if (!raw) return null;
  return { ...raw, open_id: uk };
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
