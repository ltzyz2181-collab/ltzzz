/**
 * LTZZZ Agent Treasury Queue
 * GPT 总控提交 → Policy → Queue → (Safe/人工执行位) → Ledger 记录结构 → Memory 回写结构
 *
 * Vars / Secrets:
 *   SINGLE_TX_LIMIT   (default 20)
 *   DAILY_LIMIT       (default 50)
 *   MONTHLY_LIMIT     (default 300)
 *   LTZZZ_AGENT_TOKEN (Bearer)
 *   DRY_RUN=true      不声称链上已执行
 * KV: TREASURY_KV (reuse shared id via wrangler)
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
  });
}

function limits(env) {
  return {
    SINGLE_TX_LIMIT: Number(env.SINGLE_TX_LIMIT || 20),
    DAILY_LIMIT: Number(env.DAILY_LIMIT || 50),
    MONTHLY_LIMIT: Number(env.MONTHLY_LIMIT || 300),
    DRY_RUN: String(env.DRY_RUN || 'true') !== 'false',
  };
}

function auth(env, request) {
  const t = env.LTZZZ_AGENT_TOKEN;
  if (!t) return true; // open health; mutating routes check below
  const authz = request.headers.get('Authorization') || '';
  return authz === 'Bearer ' + t;
}

function requireAuth(env, request) {
  if (!env.LTZZZ_AGENT_TOKEN) return { ok: false, error: 'missing LTZZZ_AGENT_TOKEN secret' };
  if (!auth(env, request)) return { ok: false, error: 'unauthorized' };
  return { ok: true };
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
          service: 'ltzzz-treasury-queue',
          limits: limits(env),
          kv: Boolean(env.TREASURY_KV),
          has_agent_token: Boolean(env.LTZZZ_AGENT_TOKEN),
          safe_execute: 'queue-only-no-private-key',
          doubao_ordinary_tasks: 'allowed',
        });
      }

      if (path === '/policy' && request.method === 'GET') {
        return json({ ok: true, limits: limits(env), mode: 'policy-auto-within-limits' });
      }

      if (path === '/queue/submit' && request.method === 'POST') {
        const gate = requireAuth(env, request);
        if (!gate.ok) return json(gate, 401);
        return await submit(request, env);
      }

      if (path === '/queue/list' && request.method === 'GET') {
        return await listQueue(env, url);
      }

      if (path === '/queue/execute' && request.method === 'POST') {
        const gate = requireAuth(env, request);
        if (!gate.ok) return json(gate, 401);
        return await markExecute(request, env);
      }

      return json({
        ok: true,
        endpoints: [
          'GET /health',
          'GET /policy',
          'POST /queue/submit',
          'GET /queue/list',
          'POST /queue/execute',
        ],
      });
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 500);
    }
  },
};

async function submit(request, env) {
  const body = await request.json().catch(() => ({}));
  const L = limits(env);
  const amount = Number(body.amount || 0);
  const asset = (body.asset || 'USDT').toUpperCase();
  const network = (body.network || 'ethereum').toLowerCase();
  const to = (body.to || body.destination || '').trim();
  const purpose = (body.purpose || body.reason || 'ops').slice(0, 200);
  const submitted_by = body.submitted_by || 'GPT';

  if (!amount || amount <= 0) return json({ ok: false, error: 'invalid_amount' }, 400);
  if (!to) return json({ ok: false, error: 'missing_to' }, 400);

  // Policy
  if (amount > L.SINGLE_TX_LIMIT) {
    return json({
      ok: false,
      decision: 'reject_or_escalate',
      reason: 'single_tx_limit',
      SINGLE_TX_LIMIT: L.SINGLE_TX_LIMIT,
      amount,
    }, 400);
  }

  const day = new Date().toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const dailyKey = 'spend:daily:' + day;
  const monthlyKey = 'spend:monthly:' + month;
  let daily = 0;
  let monthly = 0;
  if (env.TREASURY_KV) {
    daily = Number((await env.TREASURY_KV.get(dailyKey)) || 0);
    monthly = Number((await env.TREASURY_KV.get(monthlyKey)) || 0);
  }
  if (daily + amount > L.DAILY_LIMIT) {
    return json({
      ok: false,
      decision: 'reject',
      reason: 'daily_limit',
      DAILY_LIMIT: L.DAILY_LIMIT,
      daily_spent: daily,
    }, 400);
  }
  if (monthly + amount > L.MONTHLY_LIMIT) {
    return json({
      ok: false,
      decision: 'reject',
      reason: 'monthly_limit',
      MONTHLY_LIMIT: L.MONTHLY_LIMIT,
      monthly_spent: monthly,
    }, 400);
  }

  const id =
    'TQ-' +
    day.replace(/-/g, '') +
    '-' +
    Math.random().toString(36).slice(2, 8);
  const item = {
    id,
    status: L.DRY_RUN ? 'queued_dry_run' : 'queued',
    amount,
    asset,
    network,
    to,
    purpose,
    submitted_by,
    decision: 'policy_pass',
    created_at: new Date().toISOString(),
    tx_hash: null,
    ledger_line: null,
    memory_ref: null,
  };

  if (env.TREASURY_KV) {
    await env.TREASURY_KV.put('queue:' + id, JSON.stringify(item));
    await env.TREASURY_KV.put(dailyKey, String(daily + amount));
    await env.TREASURY_KV.put(monthlyKey, String(monthly + amount));
  }

  // Ledger + Memory shaped payloads (caller / daily job persists to git/R2)
  item.ledger_line = {
    id,
    time: item.created_at,
    asset,
    amount,
    network,
    发送地址: 'treasury-ops-float',
    接收地址: to,
    TXID: item.tx_hash || 'pending',
    手续费: 'pending',
    状态: item.status,
    用途: purpose,
    人工确认: L.DRY_RUN ? 'dry_run' : 'policy-auto',
  };
  item.memory_ref = {
    type: 'treasury_queue',
    id,
    summary: `${submitted_by} queued ${amount} ${asset} to ${to.slice(0, 10)}… (${purpose})`,
  };

  return json({
    ok: true,
    decision: 'accept',
    dry_run: L.DRY_RUN,
    item,
    note: L.DRY_RUN
      ? 'Policy passed; queued. Chain execute requires Safe/wallet — no private key in Worker.'
      : 'Queued for execute path',
  });
}

async function listQueue(env, url) {
  if (!env.TREASURY_KV) return json({ ok: true, items: [], note: 'no KV' });
  const limit = Number(url.searchParams.get('limit') || 20);
  const listed = await env.TREASURY_KV.list({ prefix: 'queue:', limit: 100 });
  const items = [];
  for (const k of listed.keys || []) {
    const raw = await env.TREASURY_KV.get(k.name);
    if (raw) items.push(JSON.parse(raw));
  }
  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return json({ ok: true, count: items.length, items: items.slice(0, limit) });
}

async function markExecute(request, env) {
  const body = await request.json().catch(() => ({}));
  const id = body.id;
  const tx_hash = body.tx_hash || null;
  if (!id || !env.TREASURY_KV) return json({ ok: false, error: 'missing id or KV' }, 400);
  const raw = await env.TREASURY_KV.get('queue:' + id);
  if (!raw) return json({ ok: false, error: 'not_found' }, 404);
  const item = JSON.parse(raw);
  item.status = tx_hash ? 'executed' : 'awaiting_safe';
  item.tx_hash = tx_hash;
  item.executed_at = new Date().toISOString();
  if (item.ledger_line) {
    item.ledger_line.TXID = tx_hash || 'awaiting_safe';
    item.ledger_line.状态 = item.status;
  }
  await env.TREASURY_KV.put('queue:' + id, JSON.stringify(item));
  return json({ ok: true, item });
}
