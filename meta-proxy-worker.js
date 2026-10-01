// LTZZZ · Meta 席占位 Worker — Cloudflare Worker
// 槽位：did:ltzzz:meta（规划中；Meta 无公开聊天 API，不伪装接入）
// 声明：本 Worker 仅占位，/health 返回 planned:true；页面状态保持"规划中"。
//      待 Meta 开放聊天/Agent API 或出现合规通道后再补齐真实代理。
//
// 健康检查：GET /health → {ok, service, did, planned:true, has_key:false}
// 调用：POST / → 503（planned，未接入上游）

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: cors() });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: 'meta-proxy',
        did: 'did:ltzzz:meta',
        planned: true,
        has_key: false,
        note: 'Meta 无公开聊天 API，占位 Worker，规划中（不伪装接入）',
        time: new Date().toISOString()
      });
    }

    // 任何 POST → 503 planned
    if (request.method === 'POST') {
      return json({
        ok: false,
        service: 'meta-proxy',
        planned: true,
        error: 'Meta 席未接入上游，状态=规划中（planned），不伪装可用',
        stage: 'planned_placeholder'
      }, 503);
    }

    return json({ error: 'GET /health only; POST returns 503 planned' }, 405);
  }
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json; charset=utf-8' }
  });
}
