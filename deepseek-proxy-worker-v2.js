import {beginExecution,executionResponse} from './lib/provider-execution.js';
import {authHealthFields,checkOrigin,checkRateLimit,checkServiceAuth,clampMaxTokens} from './lib/proxy-guard.js';
// LTZZZ · DeepSeek API proxy — Cloudflare Worker（v2 + P0 guard）
// 槽位：did:ltzzz:deepseek
// Key 只放 Worker Secret（wrangler secret put DEEPSEEK_API_KEY），浏览器与仓库都不接触 Key。
//
// Secrets / Variables：
//   DEEPSEEK_API_KEY   必填
//   DEEPSEEK_MODEL     可选 — 默认 deepseek-flash
//   DEEPSEEK_BASE_URL  可选
//   REQUIRE_TOKEN      可选 — 默认关；true 时 POST 需 Bearer
//   MAX_TOKENS_HARD_CAP / ALLOWED_ORIGINS / RATE_LIMIT_PER_HOUR — 见 lib/proxy-guard.js
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
        service: 'ltzzz-deepseek-proxy',
        did: 'did:ltzzz:deepseek',
        has_key: Boolean(env.DEEPSEEK_API_KEY),
        model_configured: Boolean(env.DEEPSEEK_MODEL),
        configured_model: env.DEEPSEEK_MODEL || 'deepseek-flash',
        identity_receipt_revision: 'ltzzz.provider-execution.v1',
        generation_verified: false,
        ...authHealthFields(env, 'DEEPSEEK_WORKER_TOKEN'),
        time: new Date().toISOString()
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only', hint: 'Use GET /health to test deployment.' }, 405);
    }

    const denied =
      checkOrigin(request, env, { json }) ||
      checkServiceAuth(request, env, { seatTokenEnvName: 'DEEPSEEK_WORKER_TOKEN', json }) ||
      (await checkRateLimit(request, env, { json, bucket: 'deepseek' }));
    if (denied) return denied;

    if (!env.DEEPSEEK_API_KEY) {
      return json({ error: 'Missing DEEPSEEK_API_KEY secret', stage: 'worker_config' }, 500);
    }

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!messages.length) {
        return json({ error: 'messages is required', stage: 'request_validation' }, 400);
      }

      const model = body.model || env.DEEPSEEK_MODEL || 'deepseek-flash';
      const hardCap = Number.parseInt(String(env.MAX_TOKENS_HARD_CAP || '4096'), 10) || 4096;
      const max_tokens = clampMaxTokens(body.max_tokens, 1200, hardCap);

      const upstreamUrl =
        env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/chat/completions';

      const execution=beginExecution('deepseek',model,body.task_id);
      const upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
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
