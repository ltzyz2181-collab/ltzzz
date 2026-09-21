/** T026 video assets. KV prefix asset:  Shared id 63c6bb67. No public publish. */
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/health') {
      return json({
        ok: true,
        service: 'ltzzz-t026-video-assets',
        kv_bound: Boolean(env.LTZZZ_ASSETS_KV),
        kv_id: '63c6bb670cfc42b18b4d232605d5bcad',
        prefix: 'asset:',
        publish_default: 'private',
      });
    }
    const auth = request.headers.get('Authorization') || '';
    if (env.LTZZZ_AGENT_TOKEN && auth !== 'Bearer ' + env.LTZZZ_AGENT_TOKEN) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }
    if (!env.LTZZZ_ASSETS_KV) return json({ ok: false, error: 'kv_unbound' }, 503);
    if (path === '/assets/register' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!body.video_url) return json({ ok: false, error: 'missing_video_url' }, 400);
      const assetId = 'vid_' + Date.now().toString(36);
      const asset = {
        asset_id: assetId,
        video_url: body.video_url,
        title: body.title || '',
        description: body.description || '',
        tags: body.tags || [],
        status: 'registered',
        youtube_video_id: null,
        tiktok_publish_id: null,
        human_confirm: false,
        created_at: new Date().toISOString(),
      };
      await env.LTZZZ_ASSETS_KV.put('asset:' + assetId, JSON.stringify(asset));
      return json({ ok: true, ...asset });
    }
    if (path === '/assets/list' && request.method === 'GET') {
      const listed = await env.LTZZZ_ASSETS_KV.list({ prefix: 'asset:', limit: 50 });
      const assets = [];
      for (const k of listed.keys) {
        const raw = await env.LTZZZ_ASSETS_KV.get(k.name);
        if (raw) assets.push(JSON.parse(raw));
      }
      return json({ ok: true, count: assets.length, assets });
    }
    return json({ ok: false, error: 'not_found' }, 404);
  },
};
