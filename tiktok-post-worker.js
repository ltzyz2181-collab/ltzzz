/**
 * LTZZZ TikTok OAuth + Content Posting proxy
 * Secrets: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET
 * KV binding: KV
 * Sandbox: user.info.basic + video.upload (draft)
 * Production review may later add video.publish
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    try {
      if (path === '/health' && request.method === 'GET') {
        return json({
          ok: true,
          service: 'ltzzz-tiktok-post',
          has_key: Boolean(env.TIKTOK_CLIENT_KEY),
          has_secret: Boolean(env.TIKTOK_CLIENT_SECRET),
          kv: Boolean(env.KV),
          scopes: 'user.info.basic,video.upload',
        });
      }

      if (path === '/auth/callback' && request.method === 'GET') {
        return await authCallback(env, Object.fromEntries(url.searchParams));
      }

      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed', path }, 405);
      }

      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }

      switch (path) {
        case '/auth/start':
          return json(await authStart(env, body, url));
        case '/auth/callback':
          return await authCallback(env, body);
        case '/status':
          return json(await status(env, body));
        case '/publish':
          return json(await publish(env, body));
        default:
          return json({ error: 'Unknown path: ' + path }, 404);
      }
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      const statusCode = e && e.status ? e.status : 500;
      if (path === '/auth/callback') {
        const dest =
          'https://ltzzz.com/creator-lab.html?tt_status=' +
          encodeURIComponent('error:' + msg.slice(0, 180));
        return redirect(dest);
      }
      return json({ ok: false, error: msg }, statusCode);
    }
  },
};

const OAUTH_BASE = 'https://www.tiktok.com/v2/auth/authorize';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const API_BASE = 'https://open.tiktokapis.com/v2';

// Sandbox apps often only enable video.upload (draft), not video.publish
const DEFAULT_SCOPES = ['user.info.basic', 'video.upload'];

function need(env) {
  const missing = [];
  if (!env.TIKTOK_CLIENT_KEY) missing.push('TIKTOK_CLIENT_KEY');
  if (!env.TIKTOK_CLIENT_SECRET) missing.push('TIKTOK_CLIENT_SECRET');
  if (!env.KV) missing.push('KV');
  return missing;
}

function parseState(raw) {
  if (!raw) return {};
  try {
    let s = String(raw).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return JSON.parse(atob(s));
  } catch {
    return {};
  }
}

async function authStart(env, body, requestUrl) {
  const missing = need(env);
  if (missing.length) {
    return { ok: false, error: 'Missing secrets: ' + missing.join(', ') };
  }
  const redirectUri =
    (body.redirect_uri || '').trim() || requestUrl.origin + '/auth/callback';
  const returnTo =
    (body.return_to || '').trim() || 'https://ltzzz.com/creator-lab.html';
  // body.scopes optional override, comma-separated
  const scopes = body.scopes
    ? String(body.scopes).split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_SCOPES;
  const state = btoa(JSON.stringify({ r: returnTo, u: redirectUri, t: Date.now() })).replace(/=+$/, '');
  const params = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY.trim(),
    response_type: 'code',
    scope: scopes.join(','),
    redirect_uri: redirectUri,
    state,
  });
  return {
    ok: true,
    auth_url: OAUTH_BASE + '?' + params.toString(),
    redirect_uri: redirectUri,
    return_to: returnTo,
    scopes: scopes.join(','),
  };
}

async function authCallback(env, body) {
  const st = parseState(body.state);
  const returnTo = st.r || 'https://ltzzz.com/creator-lab.html';
  const redirectUri =
    st.u || 'https://ltzzz-tiktok-post.ltzyz2181.workers.dev/auth/callback';

  const missing = need(env);
  if (missing.length) {
    return redirect(
      returnTo + '?tt_status=' + encodeURIComponent('error:missing:' + missing.join(','))
    );
  }

  if (body.error) {
    return redirect(
      returnTo + '?tt_status=' + encodeURIComponent('error:' + body.error)
    );
  }

  const code = (body.code || '').trim();
  if (!code) {
    return redirect(
      returnTo + '?tt_status=' + encodeURIComponent('error:missing_code')
    );
  }

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY.trim(),
      client_secret: env.TIKTOK_CLIENT_SECRET.trim(),
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    return redirect(
      returnTo +
        '?tt_status=' +
        encodeURIComponent(
          'error:token_' + r.status + '_' + JSON.stringify(data).slice(0, 120)
        )
    );
  }

  const accessToken = data.access_token;
  const openId = data.open_id;
  if (!accessToken || !openId) {
    return redirect(
      returnTo + '?tt_status=' + encodeURIComponent('error:no_token_in_response')
    );
  }

  const record = {
    open_id: openId,
    access_token: accessToken,
    refresh_token: data.refresh_token || null,
    expires_in: data.expires_in || null,
    scope: data.scope || null,
    connected_at: new Date().toISOString(),
    last_publish: null,
    publish_status: 'none',
  };
  await env.KV.put('tt:' + openId, JSON.stringify(record));
  await env.KV.put('tt:default', JSON.stringify(record));

  return redirect(
    returnTo + '?tt_status=' + encodeURIComponent('connected&open_id=' + openId)
  );
}

async function status(env, body) {
  const uk = (body && body.user_key) || 'default';
  const tokens = await env.KV.get('tt:' + uk, 'json');
  if (!tokens) {
    return { connected: false, publish_status: 'not_connected' };
  }
  return {
    connected: true,
    open_id: tokens.open_id || null,
    last_publish: tokens.last_publish || null,
    publish_status: tokens.publish_status || 'connected',
    connected_at: tokens.connected_at || null,
  };
}

async function publish(env, body) {
  const uk = (body && body.user_key) || 'default';
  const tokens = await env.KV.get('tt:' + uk, 'json');
  if (!tokens || !tokens.access_token) {
    throw Object.assign(new Error('TikTok not connected'), { status: 401 });
  }
  const videoUrl = (body.video_url || '').trim();
  if (!videoUrl) throw Object.assign(new Error('Missing video_url'), { status: 400 });
  const title = (body.title || 'LTZZZ').trim().slice(0, 2200);
  const privacyLevel = body.privacy !== undefined ? Number(body.privacy) : 1;

  const init = await fetch(API_BASE + '/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + tokens.access_token,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title,
        privacy_level: privacyLevel,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: body.video_size || 0,
        chunk_size: body.chunk_size || 0,
        total_chunk_count: body.total_chunk_count || 1,
      },
    }),
  });
  const initData = await init.json().catch(() => ({}));
  if (!init.ok) {
    throw Object.assign(
      new Error('TikTok init failed: ' + init.status + ' ' + JSON.stringify(initData)),
      { status: init.status }
    );
  }
  const publishId = initData.data && initData.data.publish_id;
  const uploadUrl = initData.data && initData.data.upload_url;
  if (!publishId || !uploadUrl) {
    throw Object.assign(new Error('No publish_id/upload_url'), { status: 502 });
  }

  const src = await fetch(videoUrl);
  if (!src.ok) throw Object.assign(new Error('Cannot fetch video: ' + src.status), { status: 502 });
  const buf = await src.arrayBuffer();
  const up = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(buf.byteLength),
    },
    body: buf,
  });
  if (!up.ok) throw Object.assign(new Error('Upload failed: ' + up.status), { status: up.status });

  const pub = await fetch(API_BASE + '/post/publish/video/publish/', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + tokens.access_token,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const pubData = await pub.json().catch(() => ({}));
  if (!pub.ok) {
    throw Object.assign(
      new Error('Publish failed: ' + pub.status + ' ' + JSON.stringify(pubData)),
      { status: pub.status }
    );
  }

  await env.KV.put(
    'tt:' + uk,
    JSON.stringify({
      ...tokens,
      last_publish: new Date().toISOString(),
      publish_status: 'published',
      last_publish_id: publishId,
    })
  );

  return {
    ok: true,
    publish_id: publishId,
    privacy_level: privacyLevel,
    published_at: new Date().toISOString(),
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function redirect(location) {
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Access-Control-Allow-Origin': '*' },
  });
}
