import {beginExecution,executionResponse} from './lib/provider-execution.js';
import {authHealthFields,checkOrigin,checkRateLimit,checkServiceAuth,clampMaxTokens} from './lib/proxy-guard.js';
// LTZZZ · 豆包（火山方舟）API proxy — Cloudflare Worker
// Key 只放 Worker Secret，浏览器不接触 Key。
//
// 公开页 doubao.html 无法放 Bearer → 默认不强制 REQUIRE_TOKEN。
// P0 防护：max_tokens 硬顶、可选 Origin 白名单、按 IP 小时限频；
// 若部署方将 REQUIRE_TOKEN=true，则内部调用方可走 Bearer（LTZZZ_AGENT_TOKEN）。
//
// Secrets / Variables：
//   ARK_API_KEY          必填
//   DOUBAO_MODEL         推荐填写
//   DOUBAO_BASE_URL      可选
//   REQUIRE_TOKEN        可选 — 默认关（浏览器页依赖）
//   MAX_TOKENS_HARD_CAP  可选 — 默认 2048（公开页更紧）
//   RATE_LIMIT_PER_HOUR  可选 — 默认 30（公开页更紧）
//   ALLOWED_ORIGINS      可选 — 如 https://ltzzz.com,https://ltzyz2181-collab.github.io
//
// 健康检查：GET /health
// 调用：POST /  { messages, model?, temperature?, max_tokens? }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: cors() });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: 'ltzzz-doubao-proxy',
        has_key: Boolean(env.ARK_API_KEY),
        model_configured: Boolean(env.DOUBAO_MODEL),
        configured_model: env.DOUBAO_MODEL || null,
        identity_receipt_revision: 'ltzzz.provider-execution.v1',
        generation_verified: false,
        base_url_configured: Boolean(env.DOUBAO_BASE_URL),
        public_page_compatible: !String(env.REQUIRE_TOKEN || '').match(/^(1|true|yes|on)$/i),
        ...authHealthFields(env, 'DOUBAO_WORKER_TOKEN'),
        time: new Date().toISOString()
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only', hint: 'Use GET /health to test deployment.' }, 405);
    }

    // 公开页路径：默认不强制 Bearer；限频 + origin + token 顶。
    const rateEnv = {
      ...env,
      RATE_LIMIT_PER_HOUR: env.RATE_LIMIT_PER_HOUR ?? '30'
    };
    const denied =
      checkOrigin(request, env, { json }) ||
      checkServiceAuth(request, env, { seatTokenEnvName: 'DOUBAO_WORKER_TOKEN', json }) ||
      (await checkRateLimit(request, rateEnv, { json, bucket: 'doubao' }));
    if (denied) return denied;

    if (!env.ARK_API_KEY) {
      return json({ error: 'Missing ARK_API_KEY secret', stage: 'worker_config' }, 500);
    }

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!messages.length) {
        return json({ error: 'messages is required', stage: 'request_validation' }, 400);
      }

      // 模型优先 Worker 配置；允许 body.model 仅当未设置 LOCK 时。
      const lockModel = String(env.DOUBAO_LOCK_MODEL || 'false').toLowerCase();
      const model =
        lockModel === '1' || lockModel === 'true' || lockModel === 'yes'
          ? env.DOUBAO_MODEL
          : body.model || env.DOUBAO_MODEL;
      if (!model) {
        return json({
          error: 'Missing DOUBAO_MODEL',
          stage: 'worker_config',
          hint: 'Set DOUBAO_MODEL to the model or Endpoint ID enabled in Volcengine Ark.'
        }, 500);
      }

      const hardCap = Number.parseInt(String(env.MAX_TOKENS_HARD_CAP || '2048'), 10) || 2048;
      const max_tokens = clampMaxTokens(body.max_tokens, 1200, hardCap);

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
          messages,
          temperature: typeof body.temperature === 'number' ? body.temperature : 0.4,
          max_tokens,
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
