import {beginExecution,executionResponse} from './lib/provider-execution.js';
import {authHealthFields,checkOrigin,checkRateLimit,checkServiceAuth,clampMaxTokens} from './lib/proxy-guard.js';
// LTZZZ · XAI (Grok) API proxy — Cloudflare Worker
// 槽位：did:ltzzz:grok（待 owner 提供 XAI_API_KEY 激活）
// Key 只放 Worker Secret（wrangler secret put XAI_API_KEY），不进代码/对话/回执。
//
// Secrets / Variables：
//   XAI_API_KEY   必填 — xAI API Key（xai- 开头）
//   XAI_MODEL     可选 — 默认 grok-3
//   XAI_BASE_URL  可选 — 默认 https://api.x.ai/v1/chat/completions
//   REQUIRE_TOKEN 可选 — 默认关；true 时 POST 需 Bearer（LTZZZ_AGENT_TOKEN 或 XAI_WORKER_TOKEN）
//   MAX_TOKENS_HARD_CAP / ALLOWED_ORIGINS / RATE_LIMIT_PER_HOUR — 见 lib/proxy-guard.js
//
// 健康检查：GET /health → {ok, service, did, has_key, model_configured, require_token, ...}
// 调用：POST /  { messages, model?, temperature?, max_tokens? } → 透传上游，原样带状态码

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: cors() });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: 'xai-proxy',
        did: 'did:ltzzz:grok',
        has_key: Boolean(env.XAI_API_KEY),
        model_configured: Boolean(env.XAI_MODEL),
        configured_model: env.XAI_MODEL || 'grok-3',
        identity_receipt_revision: 'ltzzz.provider-execution.v1',
        generation_verified: false,
        ...authHealthFields(env, 'XAI_WORKER_TOKEN'),
        time: new Date().toISOString()
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only', hint: 'Use GET /health to test deployment.' }, 405);
    }

    const denied =
      checkOrigin(request, env, { json }) ||
      checkServiceAuth(request, env, { seatTokenEnvName: 'XAI_WORKER_TOKEN', json }) ||
      (await checkRateLimit(request, env, { json, bucket: 'xai' }));
    if (denied) return denied;

    if (!env.XAI_API_KEY) {
      return json({ error: 'Missing XAI_API_KEY secret', stage: 'worker_config' }, 500);
    }

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!messages.length) {
        return json({ error: 'messages is required', stage: 'request_validation' }, 400);
      }

      const model = body.model || env.XAI_MODEL || 'grok-3';
      const hardCap = Number.parseInt(String(env.MAX_TOKENS_HARD_CAP || '4096'), 10) || 4096;
      const max_tokens = clampMaxTokens(body.max_tokens, 2000, hardCap);

      const upstreamUrl = env.XAI_BASE_URL || 'https://api.x.ai/v1/chat/completions';

      const execution=beginExecution('grok',model,body.task_id);
      const upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.XAI_API_KEY}`,
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
      return json({ error: String(e?.message || e), stage: 'worker_runtime' }, 500);
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
    headers: { ...cors(), 'Content-Type': 'application/json; charset=utf-8' }
  });
}
