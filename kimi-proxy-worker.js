// LTZZZ · Kimi（Moonshot AI）API proxy — Cloudflare Worker
// 槽位：did:ltzzz:kimi（总控挑战者，2026-09-30 起，接替 GPT 席位比拼）
// Key 只放 Worker Secret（wrangler secret put KIMI_API_KEY），浏览器与仓库都不接触 Key。
//
// Secrets / Variables：
//   KIMI_API_KEY   必填 — Moonshot 开放平台 API Key（sk- 开头）
//   KIMI_MODEL     可选 — 默认 moonshot-v1-32k；长上下文任务用 moonshot-v1-128k
//   KIMI_BASE_URL  可选 — 默认 OpenAI 兼容 Chat Completions 地址
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
        service: 'ltzzz-kimi-proxy',
        did: 'did:ltzzz:kimi',
        has_key: Boolean(env.KIMI_API_KEY),
        model_configured: Boolean(env.KIMI_MODEL),
        time: new Date().toISOString()
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only', hint: 'Use GET /health to test deployment.' }, 405);
    }
    if (!env.KIMI_API_KEY) {
      return json({ error: 'Missing KIMI_API_KEY secret', stage: 'worker_config' }, 500);
    }

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!messages.length) {
        return json({ error: 'messages is required', stage: 'request_validation' }, 400);
      }

      // 2026-10-01 修正：moonshot-v1 系列与 kimi-k2.5 已于 2026-08-31 下线，
      // 沿用旧默认值会返回 404 "Not found the model or Permission denied"。
      // 现行可用：kimi-k3 / kimi-k2.6 / kimi-k2.7-code（总控实测确认）。
      const model = body.model || env.KIMI_MODEL || 'kimi-k2.6';

      const upstreamUrl =
        env.KIMI_BASE_URL ||
        'https://api.moonshot.cn/v1/chat/completions';

      const upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.KIMI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          // 2026-10-01 修正：kimi-k3 / k2.6 / k2.7-code 仅接受 temperature=1，
          // 传 0.4 会报 "invalid temperature: only 1 is allowed for this model"。
          temperature: /^kimi-(k3|k2\.6|k2\.7)/.test(model)
            ? 1
            : (typeof body.temperature === 'number' ? body.temperature : 1),
          max_tokens: Number.isInteger(body.max_tokens) ? body.max_tokens : 8192,
          // 2026-10-01 修正（依据 did:ltzzz:kimi 对抗性审查）：k2.6 等思考型模型的
          // reasoning 链会挤占输出预算，默认 2000 时实测 content 为空（out 被思考占满）。
          // 默认提到 8192 以预留"思考+回答"双预算。
          // reasoning_effort 仅按需透传：未验证 Moonshot 是否全模型支持，不默认强制，
          // 避免向不支持的模型发送未知参数导致 400。
          ...(body.reasoning_effort ? { reasoning_effort: body.reasoning_effort } : {}),
          stream: false
        })
      });

      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: {
          ...cors(),
          'Content-Type': 'application/json; charset=utf-8',
          'X-LTZZZ-Upstream-Status': String(upstream.status)
        }
      });
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
