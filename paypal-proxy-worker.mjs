/**
 * LTZZZ PayPal 代理骨架（无真扣款）
 * ------------------------------------------------------------------
 * Secrets（部署后由主人在 Cloudflare 填写，勿提交 Git）：
 *   PAYPAL_CLIENT_ID
 *   PAYPAL_CLIENT_SECRET
 *   PAYPAL_WEBHOOK_ID          可选，Webhook 验签用
 *   LTZZZ_AGENT_TOKEN          内部调用鉴权
 * Vars：
 *   PAYPAL_ENV = sandbox | live（默认 sandbox）
 *
 * 端点：
 *   GET  /health     不泄露 Secret，只报告是否已配置
 *   POST /oauth/token  服务端向 PayPal 换 access_token（需 Agent Token）
 *   POST /webhook      接收通知；未配置验签密钥时拒绝当成功
 *
 * 明确不做：保存银行卡、自动转账、链上签名。
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body, status = 200) {
  return new Response(JSON.stringify({ ok: status < 400, time: new Date().toISOString(), ...body }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

function requireAgent(env, req) {
  const t = env.LTZZZ_AGENT_TOKEN;
  if (!t) return false;
  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return auth === t;
}

function paypalBase(env) {
  return (env.PAYPAL_ENV || 'sandbox') === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/health' && req.method === 'GET') {
      return json({
        service: 'ltzzz-paypal-proxy',
        version: '0.1.0-stub',
        env: env.PAYPAL_ENV || 'sandbox',
        live_capture: false,
        configured: {
          client_id: Boolean(env.PAYPAL_CLIENT_ID),
          client_secret: Boolean(env.PAYPAL_CLIENT_SECRET),
          webhook_id: Boolean(env.PAYPAL_WEBHOOK_ID),
          agent_token: Boolean(env.LTZZZ_AGENT_TOKEN),
        },
        note: 'Stub only. No card data. Webhook must be verified before treating as paid.',
      });
    }

    if (path === '/oauth/token' && req.method === 'POST') {
      if (!requireAgent(env, req)) return json({ error: 'unauthorized' }, 401);
      if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
        return json({ error: 'missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in Worker secrets' }, 500);
      }
      const basic = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
      const resp = await fetch(`${paypalBase(env)}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      const data = await resp.json().catch(() => ({}));
      // 不把完整 token 写入日志；仅返回给已鉴权的调用方
      return json({
        status: resp.status,
        token_type: data.token_type,
        expires_in: data.expires_in,
        access_token: data.access_token || null,
        error: data.error || null,
      }, resp.ok ? 200 : 502);
    }

    if (path === '/webhook' && req.method === 'POST') {
      // 未实现完整验签前：只收件并标记 unverified，绝不触发放行发货/入账成功
      const raw = await req.text();
      return json({
        received: true,
        verified: false,
        action: 'ignored_until_signature_verification_enabled',
        bytes: raw.length,
        hint: 'Configure PAYPAL_WEBHOOK_ID and implement PayPal verify-webhook-signature before trusting events.',
      });
    }

    return json({
      service: 'ltzzz-paypal-proxy',
      endpoints: ['GET /health', 'POST /oauth/token', 'POST /webhook'],
      layers: 'See finance/PAYMENT_LAYERS.md',
    });
  },
};
