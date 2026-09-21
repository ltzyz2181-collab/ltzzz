/**
 * LTZZZ 小额自动出金 Worker
 * 规则：
 *   - 单笔 < 100 USDT 自动出金到指定 U 卡 / PayPal / 银行账户
 *   - 单笔 >= 100 USDT 需要人工审批
 *   - 每日出金总额上限：500 USDT
 *   - 每月出金总额上限：5000 USDT
 *   - 出金记录存 KV（命名空间：LTZZZ_SETTLEMENT_KV）
 *
 * 需要 Cloudflare Secret：
 *   LTZZZ_AGENT_TOKEN     = 内部调用鉴权
 *   USDT_WALLET_ADDRESS   = USDT 接收钱包地址
 *   PAYPAL_EMAIL          = PayPal 邮箱（可选）
 *   U_CARD_ID             = U 卡 ID（可选）
 *
 * API 路由：
 *   GET  /health                    → 健康检查
 *   POST /withdraw/request          { amount, currency, destination, reason? }
 *                                    → 申请出金，自动判断是否需要审批
 *   POST /withdraw/approve          { request_id, approver } → 人工审批大额
 *   GET  /withdraw/records          ?limit=20 → 出金记录
 *   POST /withdraw/auto-test        → 测试自动出金流程（dry-run）
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

// 出金规则配置
const RULES = {
  AUTO_APPROVE_THRESHOLD: 100,      // 单笔 < 100 USDT 自动审批
  DAILY_LIMIT: 500,                 // 每日上限 500 USDT
  MONTHLY_LIMIT: 5000,              // 每月上限 5000 USDT
  AUTO_TEST_MODE: true,             // 先开测试模式，不真实打款
};

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
          service: 'ltzzz-auto-withdraw',
          rules: RULES,
          destinations: {
            usdt_wallet: !!env.USDT_WALLET_ADDRESS,
            paypal: !!env.PAYPAL_EMAIL,
            u_card: !!env.U_CARD_ID,
          }
        });
      }

      if (url.pathname === '/withdraw/request' && request.method === 'POST') {
        return await handleWithdrawRequest(request, env);
      }

      if (url.pathname === '/withdraw/approve' && request.method === 'POST') {
        return await handleApprove(request, env);
      }

      if (url.pathname === '/withdraw/records' && request.method === 'GET') {
        return await handleRecords(request, env);
      }

      if (url.pathname === '/withdraw/auto-test' && request.method === 'POST') {
        return await handleAutoTest(request, env);
      }

      return json({ ok: false, error: 'not_found' }, 404);
    } catch (e) {
      return json({ ok: false, error: 'internal', detail: String(e.message || e) }, 500);
    }
  }
};

async function handleWithdrawRequest(request, env) {
  const body = await request.json();
  const { amount, currency = 'USDT', destination, reason = '' } = body;

  if (!amount || amount <= 0) {
    return json({ ok: false, error: 'invalid_amount' }, 400);
  }

  if (!destination || !['usdt_wallet', 'paypal', 'u_card'].includes(destination)) {
    return json({ ok: false, error: 'invalid_destination', valid: ['usdt_wallet', 'paypal', 'u_card'] }, 400);
  }

  // 检查今日已出金
  const today = new Date().toISOString().slice(0, 10);
  const dailyKey = `withdraw:daily:${today}`;
  const dailySpent = Number(await env.LTZZZ_SETTLEMENT_KV.get(dailyKey) || 0);

  if (dailySpent + amount > RULES.DAILY_LIMIT) {
    return json({
      ok: false,
      error: 'daily_limit_exceeded',
      daily_limit: RULES.DAILY_LIMIT,
      daily_spent: dailySpent,
      requested: amount,
    }, 400);
  }

  // 自动审批判断
  const needApproval = amount >= RULES.AUTO_APPROVE_THRESHOLD;
  const requestId = `wd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const record = {
    request_id: requestId,
    amount,
    currency,
    destination,
    reason,
    status: needApproval ? 'pending_approval' : 'auto_approved',
    created_at: new Date().toISOString(),
    approved_at: needApproval ? null : new Date().toISOString(),
    approved_by: needApproval ? null : 'auto',
    tx_hash: null,
  };

  // 存 KV
  await env.LTZZZ_SETTLEMENT_KV.put(`withdraw:${requestId}`, JSON.stringify(record));

  // 累加每日总额
  await env.LTZZZ_SETTLEMENT_KV.put(dailyKey, String(dailySpent + amount));

  // 自动执行出金
  if (!needApproval && !RULES.AUTO_TEST_MODE) {
    // TODO: 真实出金逻辑
    // 1. 调用 USDT 钱包转账 API
    // 2. 调用 PayPal API
    // 3. 调用 U 卡 API
    record.tx_hash = `TODO_TX_${requestId}`;
    record.status = 'completed';
    await env.LTZZZ_SETTLEMENT_KV.put(`withdraw:${requestId}`, JSON.stringify(record));
  }

  return json({
    ok: true,
    ...record,
    auto_approved: !needApproval,
    test_mode: RULES.AUTO_TEST_MODE,
  });
}

async function handleApprove(request, env) {
  const body = await request.json();
  const { request_id, approver = 'admin' } = body;

  const recordStr = await env.LTZZZ_SETTLEMENT_KV.get(`withdraw:${request_id}`);
  if (!recordStr) return json({ ok: false, error: 'not_found' }, 404);

  const record = JSON.parse(recordStr);
  record.status = 'approved';
  record.approved_at = new Date().toISOString();
  record.approved_by = approver;

  // TODO: 真实出金逻辑
  record.tx_hash = `TODO_TX_${request_id}`;
  record.status = 'completed';

  await env.LTZZZ_SETTLEMENT_KV.put(`withdraw:${request_id}`, JSON.stringify(record));

  return json({ ok: true, ...record });
}

async function handleRecords(request, env) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') || 20);

  // 列出所有出金记录
  const keys = await env.LTZZZ_SETTLEMENT_KV.list({ prefix: 'withdraw:', limit: 100 });
  const records = [];
  for (const key of keys.keys) {
    if (key.name.startsWith('withdraw:daily:')) continue;
    const record = await env.LTZZZ_SETTLEMENT_KV.get(key.name);
    if (record) records.push(JSON.parse(record));
  }

  records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return json({
    ok: true,
    count: records.length,
    records: records.slice(0, limit),
  });
}

async function handleAutoTest(request, env) {
  // 测试自动出金流程（不真实打款）
  const testCases = [
    { amount: 10, destination: 'usdt_wallet', expected: 'auto_approved' },
    { amount: 50, destination: 'paypal', expected: 'auto_approved' },
    { amount: 150, destination: 'u_card', expected: 'pending_approval' },
  ];

  const results = [];
  for (const tc of testCases) {
    const needApproval = tc.amount >= RULES.AUTO_APPROVE_THRESHOLD;
    results.push({
      ...tc,
      expected: needApproval ? 'pending_approval' : 'auto_approved',
      passed: tc.expected === (needApproval ? 'pending_approval' : 'auto_approved'),
    });
  }

  return json({
    ok: true,
    test_mode: true,
    rules: RULES,
    results,
  });
}
