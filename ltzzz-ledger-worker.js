/**
 * LTZZZ 收支账本 Worker
 * 记录所有入账、出账、余额、手续费、TXID
 *
 * API 路由：
 *   GET  /health                    → 健康检查
 *   POST /ledger/income             { amount, currency, source, txid, note? }
 *   POST /ledger/expense            { amount, currency, destination, txid, note? }
 *   GET  /ledger/balance             ?currency=USDT → 当前余额
 *   GET  /ledger/records             ?type=all&limit=20 → 收支记录
 *   POST /ledger/test/20u            → 20U 测试流程（纸飞机 → 钱包 → U 卡）
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
          service: 'ltzzz-ledger',
          version: '1.0.0',
          features: ['income', 'expense', 'balance', 'test_20u'],
        });
      }

      if (url.pathname === '/ledger/income' && request.method === 'POST') {
        return await handleIncome(request, env);
      }

      if (url.pathname === '/ledger/expense' && request.method === 'POST') {
        return await handleExpense(request, env);
      }

      if (url.pathname === '/ledger/balance' && request.method === 'GET') {
        return await handleBalance(request, env);
      }

      if (url.pathname === '/ledger/records' && request.method === 'GET') {
        return await handleRecords(request, env);
      }

      if (url.pathname === '/ledger/test/20u' && request.method === 'POST') {
        return await handle20uTest(request, env);
      }

      return json({ ok: false, error: 'not_found' }, 404);
    } catch (e) {
      return json({ ok: false, error: 'internal', detail: String(e.message || e) }, 500);
    }
  }
};

async function handleIncome(request, env) {
  const body = await request.json();
  const { amount, currency = 'USDT', source, txid, note = '' } = body;

  if (!amount || amount <= 0) {
    return json({ ok: false, error: 'invalid_amount' }, 400);
  }

  if (!source || !txid) {
    return json({ ok: false, error: 'missing_source_or_txid' }, 400);
  }

  const recordId = `inc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    record_id: recordId,
    type: 'income',
    amount,
    currency,
    source,
    txid,
    note,
    status: 'confirmed',
    created_at: new Date().toISOString(),
  };

  await env.LTZZZ_LEDGER_KV.put(`ledger:${recordId}`, JSON.stringify(record));

  // 更新余额
  const balanceKey = `balance:${currency}`;
  const currentBalance = Number(await env.LTZZZ_LEDGER_KV.get(balanceKey) || 0);
  await env.LTZZZ_LEDGER_KV.put(balanceKey, String(currentBalance + amount));

  return json({ ok: true, ...record, new_balance: currentBalance + amount });
}

async function handleExpense(request, env) {
  const body = await request.json();
  const { amount, currency = 'USDT', destination, txid, note = '', fee = 0 } = body;

  if (!amount || amount <= 0) {
    return json({ ok: false, error: 'invalid_amount' }, 400);
  }

  if (!destination || !txid) {
    return json({ ok: false, error: 'missing_destination_or_txid' }, 400);
  }

  // 检查余额
  const balanceKey = `balance:${currency}`;
  const currentBalance = Number(await env.LTZZZ_LEDGER_KV.get(balanceKey) || 0);

  if (currentBalance < amount + fee) {
    return json({
      ok: false,
      error: 'insufficient_balance',
      balance: currentBalance,
      required: amount + fee,
    }, 400);
  }

  const recordId = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    record_id: recordId,
    type: 'expense',
    amount,
    fee,
    currency,
    destination,
    txid,
    note,
    status: 'confirmed',
    created_at: new Date().toISOString(),
  };

  await env.LTZZZ_LEDGER_KV.put(`ledger:${recordId}`, JSON.stringify(record));

  // 扣减余额
  await env.LTZZZ_LEDGER_KV.put(balanceKey, String(currentBalance - amount - fee));

  return json({ ok: true, ...record, new_balance: currentBalance - amount - fee });
}

async function handleBalance(request, env) {
  const url = new URL(request.url);
  const currency = url.searchParams.get('currency') || 'USDT';

  const balance = Number(await env.LTZZZ_LEDGER_KV.get(`balance:${currency}`) || 0);

  return json({
    ok: true,
    currency,
    balance,
    wallet: 'LTZZZ Internal',
    u_card_balance: 'TODO', // 待对接 U 卡 API
    usdt_wallet_address: env.USDT_WALLET_ADDRESS ? 'configured' : 'not_configured',
  });
}

async function handleRecords(request, env) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') || 20);
  const type = url.searchParams.get('type') || 'all';

  const keys = await env.LTZZZ_LEDGER_KV.list({ prefix: 'ledger:', limit: 100 });
  const records = [];

  for (const key of keys.keys) {
    const record = await env.LTZZZ_LEDGER_KV.get(key.name);
    if (!record) continue;
    const r = JSON.parse(record);
    if (type !== 'all' && r.type !== type) continue;
    records.push(r);
  }

  records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return json({
    ok: true,
    count: records.length,
    records: records.slice(0, limit),
  });
}

async function handle20uTest(request, env) {
  /**
   * 20U 测试流程：纸飞机 → LTZZZ 钱包 → U 卡
   * 步骤：
   *   1. 记录入账（模拟纸飞机收到 20U）
   *   2. 记录出账（模拟转到 U 卡）
   *   3. 每一步都有 TXID/状态
   *   4. 现在是 dry-run，不真实打款
   */

  const steps = [];
  const testTime = new Date().toISOString();

  // 步骤 1：纸飞机收到 20U
  const step1 = {
    step: 1,
    name: '纸飞机 → LTZZZ 钱包',
    amount: 20,
    currency: 'USDT',
    from: 'Telegram User',
    to: 'LTZZZ Internal Wallet',
    txid: `TEST_TG_IN_${Date.now()}`,
    status: 'dry_run',
    note: '模拟：纸飞机用户转账 20U 到 LTZZZ 钱包',
    time: testTime,
  };
  steps.push(step1);

  // 步骤 2：LTZZZ 钱包 → U 卡
  const step2 = {
    step: 2,
    name: 'LTZZZ 钱包 → U 卡',
    amount: 19.9, // 扣 0.1 手续费
    fee: 0.1,
    currency: 'USDT',
    from: 'LTZZZ Internal Wallet',
    to: 'U Card (Biyapay ID: 39207349)',
    txid: `TEST_WALLET_OUT_${Date.now()}`,
    status: 'dry_run',
    note: '模拟：钱包转账到 U 卡，扣 0.1U 手续费',
    time: new Date().toISOString(),
  };
  steps.push(step2);

  return json({
    ok: true,
    test: '20u_full_flow',
    dry_run: true,
    message: '这是 dry-run 测试，没有真实打款。每一步都有独立 TXID 和状态。',
    steps,
    total_in: 20,
    total_out: 19.9,
    total_fee: 0.1,
    net: 0, // 测试完余额不变
  });
}
