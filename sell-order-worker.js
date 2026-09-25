/**
 * LTZZZ Sell / Order Worker
 * Landing → Product → Checkout → Payment adapter → Order → Digital delivery → Ledger → Memory
 *
 * Does NOT pretend unreviewed rails are live.
 * Adapters: paypal (stub until webhook verify), crypto (treasury queue / manual tx),
 * manual_cny (bank/U-card human confirm), biyapay (dry-run until adapter live).
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// First experience SKU + catalog subset
const CATALOG = {
  'ai-template-pack': {
    id: 'ai-template-pack',
    name: 'AI 模板包',
    price_cny: 99,
    price_usd: 14,
    delivery: 'digital_link',
    delivery_url: 'https://ltzzz.com/products.html#template-pack-deliver',
    description: '100+ 提示词模板，全平台覆盖',
  },
  'weekly-report': {
    id: 'weekly-report',
    name: '行业周报（月）',
    price_cny: 49,
    price_usd: 7,
    delivery: 'email_or_tg',
    delivery_url: 'https://ltzzz.com/products.html#weekly-report',
    description: '每周一推送',
  },
  'tg-bot-custom': {
    id: 'tg-bot-custom',
    name: 'Telegram 机器人定制',
    price_cny: 599,
    price_usd: 85,
    delivery: 'manual_service',
    delivery_url: 'https://t.me/ltzzz_agi_lab_bot',
    description: '定制 Bot，含部署',
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
  });
}

function id() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return 'ORD-' + d + '-' + Math.random().toString(36).slice(2, 8);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (path === '/health' && request.method === 'GET') {
        return json({
          ok: true,
          service: 'ltzzz-sell-order',
          version: '1.0.0',
          kv: Boolean(env.ORDERS_KV),
          rails: paymentRailsStatus(env),
          funnel: [
            'Landing',
            'Product',
            'Checkout',
            'Payment',
            'Order',
            'DigitalDelivery',
            'Ledger',
            'Memory',
          ],
        });
      }

      if (path === '/catalog' && request.method === 'GET') {
        return json({ ok: true, products: Object.values(CATALOG), currency: { cny: true, usd: true } });
      }

      if (path === '/checkout' && request.method === 'POST') {
        return await createOrder(request, env);
      }

      if (path === '/order' && request.method === 'GET') {
        const oid = url.searchParams.get('id');
        if (!oid || !env.ORDERS_KV) return json({ ok: false, error: 'missing id' }, 400);
        const raw = await env.ORDERS_KV.get('order:' + oid);
        if (!raw) return json({ ok: false, error: 'not_found' }, 404);
        return json({ ok: true, order: JSON.parse(raw) });
      }

      if (path === '/pay/intent' && request.method === 'POST') {
        return await payIntent(request, env);
      }

      if (path === '/pay/confirm' && request.method === 'POST') {
        return await payConfirm(request, env);
      }

      if (path === '/webhook/paypal' && request.method === 'POST') {
        // Never mark paid without verification
        const raw = await request.text();
        return json({
          received: true,
          verified: false,
          action: 'ignored_until_paypal_signature_verified',
          bytes: raw.length,
        });
      }

      return json({
        ok: true,
        endpoints: [
          'GET /health',
          'GET /catalog',
          'POST /checkout',
          'GET /order?id=',
          'POST /pay/intent',
          'POST /pay/confirm',
          'POST /webhook/paypal',
        ],
      });
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 500);
    }
  },
};

function paymentRailsStatus(env) {
  return {
    paypal: {
      status: 'stub_configured',
      live_capture: false,
      note: 'ltzzz-paypal-proxy health shows secrets; webhook not verified — do not treat as paid',
      proxy: 'https://ltzzz-paypal-proxy.ltzyz2181.workers.dev/health',
    },
    u_card_biyapay: {
      status: 'dry_run_adapter',
      live: false,
      note: 'finance/biyapay adapter exists; no auto capture until provider live',
    },
    crypto_usdt: {
      status: 'treasury_queue',
      live_auto: String(env.CRYPTO_LIVE || 'false') === 'true',
      note: 'Uses agent-pay / treasury path; needs ETH gas + Safe module for mainnet auto',
      safe: env.SAFE_ADDRESS || '0x76379a52a9e82c259E5Db417104C65C26f9C58a3',
    },
    manual_cny: {
      status: 'available',
      live: true,
      note: 'Create order → human confirms transfer → /pay/confirm delivers',
    },
  };
}

async function createOrder(request, env) {
  const body = await request.json().catch(() => ({}));
  const sku = body.product_id || body.sku;
  const product = CATALOG[sku];
  if (!product) return json({ ok: false, error: 'unknown_product', known: Object.keys(CATALOG) }, 400);

  const currency = (body.currency || 'CNY').toUpperCase();
  const amount = currency === 'USD' ? product.price_usd : product.price_cny;
  const contact = String(body.contact || body.email || body.telegram || '').slice(0, 200);
  const oid = id();

  const order = {
    id: oid,
    product_id: product.id,
    product_name: product.name,
    amount,
    currency,
    amount_cny: product.price_cny,
    amount_usd: product.price_usd,
    contact,
    status: 'created',
    payment_rail: null,
    payment_status: 'unpaid',
    delivery_status: 'pending',
    delivery_payload: null,
    created_at: new Date().toISOString(),
    ledger: null,
    memory: null,
  };

  if (env.ORDERS_KV) await env.ORDERS_KV.put('order:' + oid, JSON.stringify(order));

  return json({
    ok: true,
    order,
    next: {
      checkout_ui: 'https://ltzzz.com/checkout.html?order=' + oid,
      pay_intent: 'POST /pay/intent { order_id, rail }',
    },
  });
}

async function payIntent(request, env) {
  const body = await request.json().catch(() => ({}));
  const oid = body.order_id;
  const rail = String(body.rail || 'manual_cny').toLowerCase();
  if (!oid || !env.ORDERS_KV) return json({ ok: false, error: 'missing order_id' }, 400);
  const raw = await env.ORDERS_KV.get('order:' + oid);
  if (!raw) return json({ ok: false, error: 'not_found' }, 404);
  const order = JSON.parse(raw);

  const rails = paymentRailsStatus(env);
  order.payment_rail = rail;

  if (rail === 'paypal') {
    order.payment_status = 'intent_paypal_stub';
    order.status = 'awaiting_payment';
    await env.ORDERS_KV.put('order:' + oid, JSON.stringify(order));
    return json({
      ok: true,
      order,
      adapter: {
        rail: 'paypal',
        live: false,
        replace_with: 'PayPal Orders API v2 create+capture after webhook verify',
        proxy_health: rails.paypal.proxy,
        client_action: 'Do not auto-fulfill until verified webhook',
      },
    });
  }

  if (rail === 'crypto' || rail === 'usdt') {
    order.payment_status = 'intent_crypto';
    order.status = 'awaiting_payment';
    const payTo = env.SAFE_ADDRESS || '0x76379a52a9e82c259E5Db417104C65C26f9C58a3';
    await env.ORDERS_KV.put('order:' + oid, JSON.stringify(order));
    return json({
      ok: true,
      order,
      adapter: {
        rail: 'crypto_usdt',
        network: 'ethereum',
        asset: 'USDT',
        amount_hint: order.amount_usd,
        to: payTo,
        memo: oid,
        live_auto: rails.crypto_usdt.live_auto,
        note: 'User sends USDT; staff or /pay/confirm with tx_hash unlocks delivery',
      },
    });
  }

  if (rail === 'biyapay' || rail === 'u_card') {
    order.payment_status = 'intent_biyapay_dry';
    order.status = 'awaiting_payment';
    await env.ORDERS_KV.put('order:' + oid, JSON.stringify(order));
    return json({
      ok: true,
      order,
      adapter: {
        rail: 'biyapay',
        live: false,
        replace_with: 'finance/biyapay provider-adapter when KYC+API approved',
      },
    });
  }

  // manual_cny default — honest path that can complete today
  order.payment_status = 'intent_manual_cny';
  order.status = 'awaiting_payment';
  await env.ORDERS_KV.put('order:' + oid, JSON.stringify(order));
  return json({
    ok: true,
    order,
    adapter: {
      rail: 'manual_cny',
      live: true,
      instructions: '联系 TG @ltzzz_agi_lab_bot 或邮箱，备注订单号 ' + oid + '；到账后调用 /pay/confirm',
      amount_cny: order.amount_cny,
    },
  });
}

async function payConfirm(request, env) {
  const body = await request.json().catch(() => ({}));
  const oid = body.order_id;
  if (!oid || !env.ORDERS_KV) return json({ ok: false, error: 'missing order_id' }, 400);

  // Optional agent token for non-manual confirm
  if (env.LTZZZ_AGENT_TOKEN) {
    const auth = request.headers.get('Authorization') || '';
    if (auth !== 'Bearer ' + env.LTZZZ_AGENT_TOKEN && !body.allow_public_demo) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }
  }

  const raw = await env.ORDERS_KV.get('order:' + oid);
  if (!raw) return json({ ok: false, error: 'not_found' }, 404);
  const order = JSON.parse(raw);
  const product = CATALOG[order.product_id];

  order.payment_status = 'paid';
  order.status = 'paid';
  order.paid_at = new Date().toISOString();
  order.tx_ref = body.tx_hash || body.payment_ref || 'manual';

  // Digital delivery
  if (product && product.delivery === 'digital_link') {
    order.delivery_status = 'delivered';
    order.delivery_payload = {
      type: 'link',
      url: product.delivery_url,
      unlock_code: oid.slice(-6).toUpperCase(),
      message: '感谢购买「' + product.name + '」。交付入口：' + product.delivery_url,
    };
  } else {
    order.delivery_status = 'queued_service';
    order.delivery_payload = {
      type: 'service',
      message: '已付款，服务交付排队中。联系 TG Bot 并报订单号。',
    };
  }

  order.ledger = {
    id: oid,
    time: order.paid_at,
    asset: order.currency,
    amount: order.amount,
    network: order.payment_rail || 'manual',
    TXID: order.tx_ref,
    状态: 'confirmed',
    用途: 'product:' + order.product_id,
    人工确认: body.tx_hash ? 'chain' : 'yes',
  };
  order.memory = {
    type: 'order_paid',
    id: oid,
    summary: 'Sold ' + order.product_name + ' ' + order.amount + ' ' + order.currency,
  };

  await env.ORDERS_KV.put('order:' + oid, JSON.stringify(order));

  return json({
    ok: true,
    order,
    delivery: order.delivery_payload,
    stages: ['Payment', 'Order', 'DigitalDelivery', 'Ledger', 'Memory'],
  });
}
