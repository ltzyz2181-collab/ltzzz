// LTZZZ Agentic Payment Worker — framework endpoint
// This is intentionally a protocol-shaped demo, not a live payment processor.
// Deploy with Cloudflare Workers when you are ready.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Payment-Signature',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors, ...extra }
  });
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'ltzzz-agent-payment', mode: 'framework', liveSettlement: false });
    }

    if (url.pathname === '/quote' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const amount = Number(body.amount_usd ?? 0.001);
      return json({
        ok: true,
        protocol: body.protocol || 'x402',
        resource: body.resource || 'ltzzz-demo-api',
        amount_usd: amount,
        payment_required: true,
        settlement: 'demo-only',
        note: 'Replace this response with the official x402/MPP adapter before using real funds.'
      }, 402, {
        'PAYMENT-REQUIRED': btoa(JSON.stringify({
          scheme: 'demo',
          network: 'demo',
          amount: String(amount),
          asset: 'USDC',
          description: body.description || 'LTZZZ demo resource'
        }))
      });
    }

    if (url.pathname === '/pay-demo' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      return json({
        ok: true,
        status: 'SIMULATED_SUCCESS',
        rail: body.rail || 'x402-demo',
        amount_usd: Number(body.amount_usd ?? 0.001),
        tx: null,
        settled_onchain: false,
        time: new Date().toISOString()
      });
    }

    return json({
      name: 'LTZZZ Agentic Payment Worker',
      endpoints: ['/health', '/quote', '/pay-demo'],
      protocols: ['x402', 'MPP', 'Visa Agentic', 'Mastercard Agent Pay'],
      liveSettlement: false
    });
  }
};
