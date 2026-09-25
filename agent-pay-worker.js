/**
 * LTZZZ Agent Payment / Treasury v1 entry
 * AI → PaymentPolicy → TransactionQueue → Safe (Allowance Module) → ERC20 → TxHash → Confirm → Ledger → Memory
 *
 * NO owner private keys in Worker.
 * Safe address fixed default: 0x76379a52a9e82c259E5Db417104C65C26f9C58a3
 * Limits: SINGLE_TX_LIMIT / DAILY_LIMIT / MONTHLY_LIMIT
 * Agents: GPT | Doubao | XAI (and others) via body.agent
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const DEFAULT_SAFE = '0x76379a52a9e82c259E5Db417104C65C26f9C58a3';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
  });
}

function policy(env) {
  return {
    SINGLE_TX_LIMIT: Number(env.SINGLE_TX_LIMIT || 20),
    DAILY_LIMIT: Number(env.DAILY_LIMIT || 50),
    MONTHLY_LIMIT: Number(env.MONTHLY_LIMIT || 300),
    TOKEN_ALLOWLIST: String(env.TOKEN_ALLOWLIST || 'USDT,USDC')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
    CHAIN_ALLOWLIST: String(env.CHAIN_ALLOWLIST || 'sepolia,ethereum')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    DESTINATION_ALLOWLIST: String(env.DESTINATION_ALLOWLIST || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    NETWORK: (env.NETWORK || 'sepolia').toLowerCase(),
    DRY_RUN: String(env.DRY_RUN || 'true') !== 'false',
    SAFE_ADDRESS: (env.SAFE_ADDRESS || DEFAULT_SAFE).trim(),
    // Optional: deployed Allowance Module on the Safe (set after Safe UI enable)
    ALLOWANCE_MODULE_ADDRESS: (env.ALLOWANCE_MODULE_ADDRESS || '').trim() || null,
  };
}

function normalizeAgent(name) {
  const n = String(name || 'XAI').trim();
  if (/^gpt$/i.test(n) || /chatgpt/i.test(n)) return 'GPT';
  if (/豆包|doubao/i.test(n)) return 'Doubao';
  if (/xai|grok/i.test(n)) return 'XAI';
  return n;
}

function requireAuth(env, request) {
  if (!env.LTZZZ_AGENT_TOKEN) return { ok: true };
  const a = request.headers.get('Authorization') || '';
  if (a !== 'Bearer ' + env.LTZZZ_AGENT_TOKEN) return { ok: false, error: 'unauthorized' };
  return { ok: true };
}

/** Explicit stage flags for LTZZZ-TREASURY-P0-TODAY */
function readiness(env, extras = {}) {
  const p = policy(env);
  const CODE_READY = true;
  const TESTNET_OK = p.NETWORK === 'sepolia' || p.DRY_RUN === true;
  const MAINNET_READY =
    p.NETWORK === 'ethereum' &&
    p.DRY_RUN === false &&
    Boolean(p.ALLOWANCE_MODULE_ADDRESS) &&
    String(env.ETH_GAS_FUNDED || '') === 'true';
  const REAL_TX_SUCCESS = Boolean(extras.real_tx_success);

  return {
    CODE_READY,
    TESTNET_OK,
    MAINNET_READY,
    REAL_TX_SUCCESS,
    detail: {
      safe: p.SAFE_ADDRESS,
      network: p.NETWORK,
      dry_run: p.DRY_RUN,
      allowance_module: p.ALLOWANCE_MODULE_ADDRESS,
      eth_gas_funded_flag: String(env.ETH_GAS_FUNDED || 'false'),
      private_keys_in_worker: false,
      next: MAINNET_READY
        ? 'Submit POST /pay with DRY_RUN=false; confirm via POST /confirm with TxHash'
        : 'Tomorrow: fund Safe with ETH gas → enable Allowance Module → set ALLOWANCE_MODULE_ADDRESS + ETH_GAS_FUNDED=true + DRY_RUN=false',
    },
  };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(morningRun(env));
  },

  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (path === '/health' && request.method === 'GET') {
        const p = policy(env);
        const kv = env.PAY_KV || env.TREASURY_KV;
        let realSuccessCount = 0;
        if (kv) {
          const n = await kv.get('meta:real_tx_success_count');
          realSuccessCount = Number(n || 0);
        }
        return json({
          ok: true,
          service: 'ltzzz-agent-payment',
          version: '1.1.0',
          simulated_success: false,
          pipeline: [
            'AI',
            'PaymentPolicy',
            'TransactionQueue',
            'SafeAllowanceModule',
            'ERC20_USDT',
            'TxHash',
            'Confirm',
            'Ledger',
            'Memory',
          ],
          policy: p,
          readiness: readiness(env, { real_tx_success: realSuccessCount > 0 }),
          kv: Boolean(kv),
          private_keys_in_worker: false,
          morning_cron: true,
          agents_supported: ['GPT', 'Doubao', 'XAI'],
        });
      }

      if (path === '/status' && request.method === 'GET') {
        const kv = env.PAY_KV || env.TREASURY_KV;
        let realSuccessCount = 0;
        if (kv) {
          realSuccessCount = Number((await kv.get('meta:real_tx_success_count')) || 0);
        }
        return json({
          ok: true,
          readiness: readiness(env, { real_tx_success: realSuccessCount > 0 }),
          real_tx_success_count: realSuccessCount,
        });
      }

      if (path === '/policy' && request.method === 'GET') {
        return json({ ok: true, policy: policy(env) });
      }

      if (path === '/pay' && request.method === 'POST') {
        const gate = requireAuth(env, request);
        if (!gate.ok) return json(gate, 401);
        return await handlePay(request, env);
      }

      if ((path === '/quote' || path === '/pay-demo') && request.method === 'POST') {
        const gate = requireAuth(env, request);
        if (!gate.ok) return json(gate, 401);
        return await handlePay(request, env);
      }

      if (path === '/queue' && request.method === 'GET') {
        return await listQueue(env, url);
      }

      if (path === '/confirm' && request.method === 'POST') {
        const gate = requireAuth(env, request);
        if (!gate.ok) return json(gate, 401);
        return await confirm(request, env);
      }

      return json({
        ok: true,
        endpoints: [
          'GET /health',
          'GET /status',
          'GET /policy',
          'POST /pay',
          'GET /queue',
          'POST /confirm',
        ],
      });
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 500);
    }
  },
};

async function handlePay(request, env) {
  const body = await request.json().catch(() => ({}));
  if (/private[_-]?key|mnemonic/i.test(JSON.stringify(body))) {
    return json({ ok: false, error: 'private_key_material_rejected' }, 400);
  }

  const p = policy(env);
  const agent = normalizeAgent(body.agent || body.submitted_by || 'XAI');
  const amount = Number(body.amount_usd ?? body.amount ?? 0);
  const asset = String(body.asset || 'USDT').toUpperCase();
  const chain = String(body.chain || body.network || p.NETWORK).toLowerCase();
  const to = String(body.to || body.destination || '').trim();
  const purpose = String(body.purpose || body.description || 'ops').slice(0, 200);

  const fails = [];
  if (!amount || amount <= 0) fails.push('invalid_amount');
  if (amount > p.SINGLE_TX_LIMIT) fails.push('single_tx_limit');
  if (!p.TOKEN_ALLOWLIST.includes(asset)) fails.push('token_not_allowlisted');
  if (!p.CHAIN_ALLOWLIST.includes(chain)) fails.push('chain_not_allowlisted');
  if (!/^0x[a-fA-F0-9]{40}$/.test(to)) fails.push('invalid_destination');
  if (p.DESTINATION_ALLOWLIST.length && !p.DESTINATION_ALLOWLIST.includes(to.toLowerCase())) {
    fails.push('destination_not_allowlisted');
  }

  const kv = env.PAY_KV || env.TREASURY_KV;
  const day = new Date().toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  let daily = 0;
  let monthly = 0;
  if (kv) {
    daily = Number((await kv.get('pay:daily:' + day)) || 0);
    monthly = Number((await kv.get('pay:monthly:' + month)) || 0);
  }
  if (daily + amount > p.DAILY_LIMIT) fails.push('daily_limit');
  if (monthly + amount > p.MONTHLY_LIMIT) fails.push('monthly_limit');

  if (fails.length) {
    return json({
      ok: false,
      stage: 'PaymentPolicy',
      status: 'REJECTED',
      fails,
      policy: p,
      agent,
    }, 400);
  }

  const id =
    'PAY-' +
    day.replace(/-/g, '') +
    '-' +
    agent +
    '-' +
    Math.random().toString(36).slice(2, 8);

  const amountRaw = BigInt(Math.round(amount * 1e6)).toString();
  const token =
    env.USDT_TOKEN_ADDRESS ||
    (chain === 'sepolia'
      ? '0x7169D38820dfd117C3FA1fFaA326bD75453EB6f5'
      : '0xdAC17F958D2ee523a2206206994597C13D831ec7');
  const data = encodeTransfer(to, amountRaw);

  // Safe Allowance Module execution envelope (no private key — module executes within on-chain allowance)
  const allowancePath = {
    module: p.ALLOWANCE_MODULE_ADDRESS || 'NOT_SET_ENABLE_IN_SAFE_UI',
    safe: p.SAFE_ADDRESS,
    token,
    to,
    amount_raw: amountRaw,
    erc20_transfer_data: data,
    note: 'Enable Safe Allowance/Spending Module on Safe; set ALLOWANCE_MODULE_ADDRESS; fund ETH for gas; then DRY_RUN=false',
  };

  const item = {
    id,
    stage: 'TransactionQueue',
    status: p.DRY_RUN ? 'queued_dry_run' : 'queued_allowance_module',
    agent,
    amount,
    asset,
    chain,
    to,
    purpose,
    safe: p.SAFE_ADDRESS,
    token,
    calldata: data,
    allowance_module: allowancePath,
    tx_hash: p.DRY_RUN ? 'dry_' + id : null,
    confirmed: false,
    created_at: new Date().toISOString(),
    blockers: p.DRY_RUN
      ? ['dry_run_enabled']
      : [
          ...(p.ALLOWANCE_MODULE_ADDRESS ? [] : ['allowance_module_address_not_set']),
          ...(String(env.ETH_GAS_FUNDED || '') === 'true' ? [] : ['safe_needs_eth_gas']),
        ],
  };

  if (p.DRY_RUN) {
    item.stage = 'Ledger';
    item.status = 'dry_run_complete';
  }

  item.ledger = {
    id,
    time: item.created_at,
    asset,
    amount,
    network: chain,
    发送地址: p.SAFE_ADDRESS,
    接收地址: to,
    TXID: item.tx_hash || 'pending',
    状态: item.status,
    用途: purpose,
    agent,
  };
  item.memory = {
    type: 'agent_pay',
    id,
    summary: agent + ' ' + amount + ' ' + asset + ' → ' + to.slice(0, 10) + ' [' + item.status + ']',
  };

  if (kv) {
    await kv.put('queue:' + id, JSON.stringify(item));
    await kv.put('pay:daily:' + day, String(daily + amount));
    await kv.put('pay:monthly:' + month, String(monthly + amount));
  }

  return json({
    ok: true,
    simulated_success: false,
    status: item.status,
    stage: item.stage,
    agent,
    readiness: readiness(env),
    pipeline: {
      AI: agent,
      PaymentPolicy: 'pass',
      TransactionQueue: id,
      Safe: p.SAFE_ADDRESS,
      AllowanceModule: allowancePath.module,
      ERC20: asset,
      TxHash: item.tx_hash,
      Confirm: item.confirmed,
      Ledger: item.ledger,
      Memory: item.memory,
    },
    item,
  });
}

function encodeTransfer(to, amountRaw) {
  const sel = 'a9059cbb';
  const toClean = to.replace(/^0x/i, '').toLowerCase().padStart(64, '0');
  const amt = BigInt(amountRaw).toString(16).padStart(64, '0');
  return '0x' + sel + toClean + amt;
}

async function listQueue(env, url) {
  const kv = env.PAY_KV || env.TREASURY_KV;
  if (!kv) return json({ ok: true, items: [] });
  const limit = Number(url.searchParams.get('limit') || 20);
  const listed = await kv.list({ prefix: 'queue:', limit: 100 });
  const items = [];
  for (const k of listed.keys || []) {
    const raw = await kv.get(k.name);
    if (raw) items.push(JSON.parse(raw));
  }
  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return json({ ok: true, count: items.length, items: items.slice(0, limit) });
}

async function confirm(request, env) {
  const body = await request.json().catch(() => ({}));
  const kv = env.PAY_KV || env.TREASURY_KV;
  if (!kv || !body.id || !body.tx_hash) return json({ ok: false, error: 'need id + tx_hash' }, 400);
  const raw = await kv.get('queue:' + body.id);
  if (!raw) return json({ ok: false, error: 'not_found' }, 404);
  const item = JSON.parse(raw);
  item.tx_hash = body.tx_hash;
  item.confirmed = body.confirmed !== false;
  item.status = item.confirmed ? 'success' : 'submitted';
  item.stage = 'Memory';
  if (item.ledger) {
    item.ledger.TXID = body.tx_hash;
    item.ledger.状态 = item.status;
  }
  if (item.memory) {
    item.memory.summary = (item.memory.summary || '') + ' tx=' + body.tx_hash;
  }
  await kv.put('queue:' + body.id, JSON.stringify(item));
  if (item.confirmed && !String(body.tx_hash).startsWith('dry_')) {
    const n = Number((await kv.get('meta:real_tx_success_count')) || 0) + 1;
    await kv.put('meta:real_tx_success_count', String(n));
  }
  return json({
    ok: true,
    item,
    readiness: readiness(env, {
      real_tx_success: item.confirmed && !String(body.tx_hash).startsWith('dry_'),
    }),
  });
}

async function morningRun(env) {
  const p = policy(env);
  const kv = env.PAY_KV || env.TREASURY_KV;
  const report = {
    at: new Date().toISOString(),
    network: p.NETWORK,
    dry_run: p.DRY_RUN,
    safe: p.SAFE_ADDRESS,
    readiness: readiness(env),
    action: 'morning_treasury_open',
  };
  if (kv) await kv.put('morning:' + report.at.slice(0, 10), JSON.stringify(report));
  return report;
}
