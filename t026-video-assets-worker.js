/**
 * T026 视频资产流程 Worker
 * 流程：真实成片 → 写入资产库 → YouTube private 首传 → 确认后 public
 *
 * 需要 Cloudflare Secret：
 *   LTZZZ_AGENT_TOKEN
 *   YOUTUBE_UPLOAD_WORKER_URL
 *
 * API 路由：
 *   GET  /health
 *   POST /assets/register     { video_url, title, description, source? }
 *   GET  /assets/list
 *   POST /assets/:id/publish  { privacy? }  → 发布到 YouTube
 *   GET  /assets/:id/status
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors, ...extra }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // 鉴权
    const auth = request.headers.get('Authorization') || '';
    if (auth !== `Bearer ${env.LTZZZ_AGENT_TOKEN}` && !url.pathname.includes('/health')) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }

    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        return json({
          ok: true,
          service: 'ltzzz-t026-video-assets',
          workflow: 'register → youtube-private → confirm → public',
        });
      }

      const path = url.pathname;

      if (path === '/assets/register' && request.method === 'POST') {
        return await handleRegisterAsset(request, env);
      }

      if (path === '/assets/list' && request.method === 'GET') {
        return await handleListAssets(request, env);
      }

      // /assets/:id/publish
      const publishMatch = path.match(/^\/assets\/([^/]+)\/publish$/);
      if (publishMatch && request.method === 'POST') {
        return await handlePublishAsset(publishMatch[1], request, env);
      }

      // /assets/:id/status
      const statusMatch = path.match(/^\/assets\/([^/]+)\/status$/);
      if (statusMatch && request.method === 'GET') {
        return await handleAssetStatus(statusMatch[1], request, env);
      }

      return json({ ok: false, error: 'not_found' }, 404);
    } catch (e) {
      return json({ ok: false, error: 'internal', detail: String(e.message || e) }, 500);
    }
  }
};

async function handleRegisterAsset(request, env) {
  const body = await request.json();
  const { video_url, title = '', description = '', source = 'unknown' } = body;

  if (!video_url) {
    return json({ ok: false, error: 'missing_video_url' }, 400);
  }

  const assetId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const asset = {
    asset_id: assetId,
    video_url,
    title,
    description,
    source,
    status: 'registered', // registered → uploaded_private → confirmed → public
    created_at: new Date().toISOString(),
    youtube_video_id: null,
    youtube_privacy: null,
  };

  // TODO: 存 KV
  // await env.LTZZZ_ASSETS_KV.put(`asset:${assetId}`, JSON.stringify(asset));

  return json({
    ok: true,
    ...asset,
    next_step: 'POST /assets/' + assetId + '/publish （默认 private）',
  });
}

async function handleListAssets(request, env) {
  // TODO: 从 KV 列出所有资产
  return json({
    ok: true,
    assets: [],
    note: '资产列表（KV 待接入）',
  });
}

async function handlePublishAsset(assetId, request, env) {
  const body = await request.json().catch(() => ({}));
  const privacy = body.privacy || 'private';

  // TODO: 从 KV 读取资产
  // 调用 YouTube Worker 上传
  // const uploadRes = await fetch(env.YOUTUBE_UPLOAD_WORKER_URL + '/upload', { ... });

  return json({
    ok: true,
    asset_id: assetId,
    status: 'uploading',
    privacy,
    next_step: '等待 YouTube 上传完成，确认后改为 public',
    note: 'YouTube Worker 调用待接入',
  });
}

async function handleAssetStatus(assetId, request, env) {
  // TODO: 从 KV 读取资产状态
  return json({
    ok: true,
    asset_id: assetId,
    status: 'registered',
    note: '资产状态查询（KV 待接入）',
  });
}
