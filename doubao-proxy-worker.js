import {proxyAuth,proxyAuthState,authCheck} from './lib/proxy-auth.js';
import {beginExecution,executionResponse} from './lib/provider-execution.js';
// LTZZZ · 豆包（火山方舟）API proxy — Cloudflare Worker
// Key 只放 Worker Secret，浏览器不接触 Key。
//
// Secrets / Variables：
//   ARK_API_KEY          必填 — 方舟 API Key
//   DOUBAO_MODEL         可选 — 推荐填写你在方舟控制台已启用的模型/Endpoint ID
//   DOUBAO_BASE_URL      可选 — 默认 OpenAI 兼容 Chat Completions 地址
//
// 健康检查：GET /health
// 调用：POST /  { messages, model?, temperature?, max_tokens? }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: cors() });
    }

    // 不需要 Key 的部署探针：先确认 Worker 本身已经活着。
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        ...proxyAuthState(env),
        service: 'ltzzz-doubao-proxy',
        daily_recovery_revision: 'doubao-proxy-daily-v2',
        has_key: Boolean(env.ARK_API_KEY),
        model_configured: Boolean(env.DOUBAO_MODEL),
        configured_model: env.DOUBAO_MODEL || null,
        identity_receipt_revision: 'ltzzz.provider-execution.v1',
        generation_verified: false,
        base_url_configured: Boolean(env.DOUBAO_BASE_URL),
        time: new Date().toISOString()
      });
    }

    if(request.method==='GET'&&url.pathname==='/auth/check')return authCheck(request,env);

    if (request.method !== 'POST') {
      return json({ error: 'POST only', hint: 'Use GET /health to test deployment.' }, 405);
    }
    const denied=await proxyAuth(request,env);if(denied)return denied;
    if (!env.ARK_API_KEY) {
      return json({ error: 'Missing ARK_API_KEY secret', stage: 'worker_config' }, 500);
    }

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!messages.length) {
        return json({ error: 'messages is required', stage: 'request_validation' }, 400);
      }

      // 重要：前端不传 model 时，完全由 Worker 环境变量决定。
      // 这样以后换方舟模型/Endpoint，不需要再次修改网页。
      const model = body.model || env.DOUBAO_MODEL;
      if (!model) {
        return json({
          error: 'Missing DOUBAO_MODEL',
          stage: 'worker_config',
          hint: 'Set DOUBAO_MODEL to the model or Endpoint ID enabled in Volcengine Ark.'
        }, 500);
      }

      const upstreamUrl =
        env.DOUBAO_BASE_URL ||
        'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

      const execution=beginExecution('doubao',model,body.task_id);
      const upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.ARK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          ...(body.thinking?.type==='disabled'?{thinking:{type:'disabled'}}:{}),
          messages,
          temperature: typeof body.temperature === 'number' ? body.temperature : 0.4,
          max_tokens: Number.isInteger(body.max_tokens) ? body.max_tokens : 1200,
          stream: false
        })
      });

      return executionResponse(upstream,execution,cors());
    } catch (e) {
      return json({
        error: String(e?.message || e),
        stage: 'worker_runtime'
      }, 500);
    }
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
    headers: {
      ...cors(),
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
