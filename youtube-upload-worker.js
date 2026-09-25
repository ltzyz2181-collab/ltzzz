/**
 * LTZZZ YouTube 视频自动上传 Worker
 * 本地/服务器 MP4 → Google OAuth 2.0 → YouTube Data API v3 videos.insert → Video ID
 *
 * 官方 API：
 *   POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
 *   OAuth scope: https://www.googleapis.com/auth/youtube.upload
 * 不使用 Service Account，使用 OAuth 2.0 用户授权。
 *
 * Cloudflare Secret（不写 HTML / GitHub）：
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 * Cloudflare KV（绑定名 KV）：
 *   OAuth token 服务端存储（绝不放 localStorage）
 *
 * 路由：
 *   GET  /health                   → { ok: true, version }
 *   GET  /auth/youtube?return_to=  → 302 跳转 Google OAuth 授权页
 *   GET  /oauth/youtube/callback?code=&state= → 换 token 存 KV → 302 回前端
 *   GET  /youtube/status           → { connected, channel_name, channel_id, last_publish, ... }
 *   POST /youtube/upload           → 上传 MP4（支持 file 直传或 video_url 拉取）
 *   POST /youtube/disconnect       → 删除 KV 中的 token
 *
 * 上传参数：
 *   video (multipart 文件) 或 video_url
 *   title / description / tags[] / privacyStatus(private|unlisted|public) / publishAt / categoryId
 *
 * 前端默认隐私状态：private（绝不默认 public）
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      switch (path) {
        case '/health':
          return json({ ok: true, service: 'ltzzz-youtube-upload', version: '1.0.0', time: new Date().toISOString() });

        case '/auth/youtube':
          return await authStart(env, url);

        case '/oauth/youtube/callback':
          return await authCallback(env, url);

        case '/youtube/status':
          return json(await getStatus(env, url));

        case '/youtube/upload':
          if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
          return json(await uploadVideo(env, request, url));

        case '/youtube/disconnect':
          if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
          return json(await disconnect(env, request));

        default:
          return json({ error: 'Unknown path: ' + path }, 404);
      }
    } catch (e) {
      return json({ error: e.message || String(e), code: e.code || 'UNKNOWN', stack: e.stack }, e.status || 500);
    }
  },
};

const OAUTH_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';
const YT_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';
const YT_CHANNELS = 'https://www.googleapis.com/youtube/v3/channels';
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

function need(env) {
  const missing = [];
  if (!env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if (!env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  if (!env.KV) missing.push('KV binding');
  return missing;
}

// ============ OAuth ============

async function authStart(env, url) {
  const missing = need(env);
  if (missing.length) return json({ error: 'Missing secrets: ' + missing.join(', ') }, 500);

  const returnTo = url.searchParams.get('return_to') || 'https://ltzzz.com/youtube.html';
  const redirectUri = url.origin + '/oauth/youtube/callback';
  // state 携带 return_to 与 redirect_uri，回调时恢复
  const state = btoa(JSON.stringify({ r: returnTo, u: redirectUri, t: Date.now() })).replace(/=/g, '');

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return Response.redirect(OAUTH_AUTH + '?' + params.toString(), 302);
}

async function authCallback(env, url) {
  const missing = need(env);
  if (missing.length) return json({ error: 'Missing secrets: ' + missing.join(', ') }, 500);

  const code = url.searchParams.get('code');
  let returnTo = 'https://ltzzz.com/youtube.html';
  let redirectUri = url.origin + '/oauth/youtube/callback';
  try {
    const st = JSON.parse(atob(url.searchParams.get('state') || ''));
    if (st && st.r) returnTo = st.r;
    if (st && st.u) redirectUri = st.u;
  } catch {}

  if (url.searchParams.get('error')) {
    return Response.redirect(returnTo + '?yt_upload_status=' + encodeURIComponent('error:' + url.searchParams.get('error')), 302);
  }
  if (!code) return json({ error: 'Missing code' }, 400);

  const r = await fetch(OAUTH_TOKEN, {
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
  if (!r.ok || !data.access_token) {
    return json({ error: 'Token exchange failed', detail: data, http: r.status }, r.status);
  }
  if (!data.refresh_token) {
    // 理论上 prompt=consent + offline 必有 refresh_token；若没有，也存 access_token 但标记无 refresh
    console.warn('No refresh_token in OAuth response');
  }

  const accessToken = data.access_token;
  // 取频道信息
  let channelName = null, channelId = null;
  try {
    const cr = await fetch(YT_CHANNELS + '?part=snippet,contentDetails&mine=true', {
      headers: { 'Authorization': 'Bearer ' + accessToken },
    });
    const cd = await cr.json().catch(() => ({}));
    channelId = cd.items?.[0]?.id || null;
    channelName = cd.items?.[0]?.snippet?.title || null;
  } catch {}

  const uk = 'default';
  await env.KV.put('yt:' + uk, JSON.stringify({
    access_token: accessToken,
    refresh_token: data.refresh_token || null,
    expires_in: data.expires_in || 3600,
    scope: data.scope || null,
    connected_at: new Date().toISOString(),
    channel_name: channelName,
    channel_id: channelId,
    last_publish: null,
    publish_status: 'connected',
  }));

  return Response.redirect(returnTo + '?yt_upload_status=' + encodeURIComponent('connected&channel=' + (channelName || '')), 302);
}

// ============ Status ============

async function getStatus(env, url) {
  const uk = url.searchParams.get('user_key') || 'default';
  const raw = await env.KV.get('yt:' + uk, 'json');
  if (!raw) {
    return { connected: false, channel_name: null, channel_id: null, last_publish: null, publish_status: 'not_connected' };
  }
  // token 可能过期，尝试刷新（静默）
  let tokens = raw;
  try {
    tokens = await refreshIfNeeded(env, raw, uk);
  } catch {}
  return {
    connected: true,
    channel_name: tokens.channel_name || null,
    channel_id: tokens.channel_id || null,
    last_publish: tokens.last_publish || null,
    publish_status: tokens.publish_status || 'connected',
    connected_at: tokens.connected_at || null,
    last_video: tokens.last_video || null,
  };
}

async function disconnect(env, request) {
  const body = await request.json().catch(() => ({}));
  const uk = body.user_key || 'default';
  await env.KV.delete('yt:' + uk);
  return { ok: true, disconnected: true };
}

// ============ Upload ============

async function uploadVideo(env, request, url) {
  const missing = need(env);
  if (missing.length) throw Object.assign(new Error('Missing secrets: ' + missing.join(', ')), { status: 500 });

  const uk = url.searchParams.get('user_key') || 'default';
  const raw = await env.KV.get('yt:' + uk, 'json');
  if (!raw) throw Object.assign(new Error('YouTube not connected. Run /auth/youtube first.'), { status: 401 });
  const tokens = await refreshIfNeeded(env, raw, uk);

  // 解析参数：支持 multipart 表单（含文件）或 JSON（video_url）
  let title = '', description = '', tags = [], privacyStatus = 'private', publishAt = null, categoryId = '22';
  let videoBuffer = null;
  const contentType = request.headers.get('Content-Type') || '';

  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    title = (body.title || '').trim();
    description = (body.description || '').trim() || '';
    tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
    privacyStatus = ['private', 'unlisted', 'public'].includes(body.privacyStatus)
      ? body.privacyStatus : 'public'; // LTZZZ 默认公开发布
    publishAt = body.publishAt || null;
    categoryId = (body.categoryId || '22').toString();
    const videoUrl = (body.video_url || '').trim();
    if (!videoUrl) throw Object.assign(new Error('Missing video_url (JSON mode)'), { status: 400 });
    const src = await fetch(videoUrl);
    if (!src.ok) throw Object.assign(new Error('Cannot fetch source video: ' + src.status), { status: 502 });
    videoBuffer = await src.arrayBuffer();
  } else if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    title = (form.get('title') || '').trim();
    description = (form.get('description') || '').trim() || '';
    const tagsRaw = form.get('tags') || '';
    tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
    privacyStatus = ['private', 'unlisted', 'public'].includes(form.get('privacyStatus'))
      ? form.get('privacyStatus') : 'public'; // LTZZZ 默认公开发布
    publishAt = form.get('publishAt') || null;
    categoryId = (form.get('categoryId') || '22').toString();
    const file = form.get('video');
    if (!file || !file.arrayBuffer) throw Object.assign(new Error('Missing video file (multipart mode)'), { status: 400 });
    videoBuffer = await file.arrayBuffer();
  } else {
    throw Object.assign(new Error('Content-Type must be multipart/form-data or application/json'), { status: 415 });
  }

  if (!videoBuffer || videoBuffer.byteLength === 0) {
    throw Object.assign(new Error('Empty video file'), { status: 400 });
  }
  if (!title) title = 'LTZZZ ' + new Date().toISOString().slice(0, 10);

  // videos.insert（可恢复上传）
  const statusObj = { privacyStatus };
  if (publishAt && privacyStatus === 'private') {
    statusObj.publishAt = new Date(publishAt).toISOString();
  }
  const initBody = {
    snippet: {
      title: String(title).slice(0, 100),
      description: String(description).slice(0, 5000),
      tags: tags.slice(0, 25).map((t) => String(t).slice(0, 100)),
      categoryId: String(categoryId),
      defaultLanguage: 'zh-CN',
    },
    status: statusObj,
  };

  const initUrl = YT_UPLOAD + '?uploadType=resumable&part=snippet,status';
  const initRes = await fetch(initUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + tokens.access_token,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(videoBuffer.byteLength),
    },
    body: JSON.stringify(initBody),
  });
  if (!initRes.ok) {
    const txt = await initRes.text().catch(() => '');
    const code = parseYtError(txt);
    throw Object.assign(new Error('YouTube init failed: ' + initRes.status + ' ' + code.message), { status: initRes.status, code: code.code });
  }
  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) throw Object.assign(new Error('No upload location header'), { status: 502 });

  // 上传二进制
  const upRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(videoBuffer.byteLength),
    },
    body: videoBuffer,
  });
  const upData = await upRes.json().catch(() => ({}));
  if (!upRes.ok) {
    const code = parseYtError(JSON.stringify(upData));
    throw Object.assign(new Error('YouTube upload failed: ' + upRes.status + ' ' + code.message), { status: upRes.status, code: code.code });
  }
  const videoId = upData.id;
  if (!videoId) throw Object.assign(new Error('No video id returned'), { status: 502 });

  // 更新 KV：记录发布
  await env.KV.put('yt:' + uk, JSON.stringify({
    ...tokens,
    last_publish: new Date().toISOString(),
    publish_status: 'published',
    last_video: { video_id: videoId, title, privacyStatus, published_at: new Date().toISOString(), url: 'https://www.youtube.com/watch?v=' + videoId },
  }));

  return {
    ok: true,
    video_id: videoId,
    title,
    privacyStatus,
    url: 'https://www.youtube.com/watch?v=' + videoId,
    published_at: new Date().toISOString(),
  };
}

// ============ helpers ============

async function refreshIfNeeded(env, tokens, uk) {
  if (!tokens.refresh_token) return tokens;
  const created = tokens.connected_at ? Date.parse(tokens.connected_at) : Date.now();
  const expiresMs = (tokens.expires_in || 3600) * 1000;
  if (Date.now() - created < expiresMs - 60000) return tokens;
  const r = await fetch(OAUTH_TOKEN, {
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
  if (!r.ok || !d.access_token) {
    throw Object.assign(new Error('Token refresh failed: ' + r.status), { status: r.status });
  }
  tokens.access_token = d.access_token;
  tokens.connected_at = new Date().toISOString();
  tokens.expires_in = d.expires_in || 3600;
  await env.KV.put('yt:' + uk, JSON.stringify(tokens));
  return tokens;
}

function parseYtError(text) {
  try {
    const j = JSON.parse(text);
    const err = j.error || {};
    const reason = err.errors?.[0]?.reason || err.errors?.[0]?.message || err.message || JSON.stringify(err);
    return { code: err.code || 'YOUTUBE_API_ERROR', message: reason };
  } catch {
    return { code: 'YOUTUBE_API_ERROR', message: text.slice(0, 300) };
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}
