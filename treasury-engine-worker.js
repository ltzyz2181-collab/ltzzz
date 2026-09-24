/**
 * LTZZZ Agent Treasury Engine v1
 * Agent → Allowance check → Safe Module path → ERC20 calldata → TxHash → Ledger → Memory → Telegram
 *
 * NO private keys in this Worker. No mnemonics. No owner keys.
 * Safe preserved: 0x76379a52a9e82c259E5Db417104C65C26f9C58a3
 * Agents GPT|Doubao|XAI: propose + limits only.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const DEFAULT_SAFE = '0x76379a52a9e82c259E5Db417104C65C26f9C58a3';

const DEFAULT_AGENTS = {
  GPT: { SINGLE_TX_LIMIT: 20, DAILY_LIMIT: 50, TOKEN_ALLOWANCE: 300, paused: false },
  Doubao: { SINGLE_TX_LIMIT: 15, DAILY_LIMIT: 40, TOKEN_ALLOWANCE: 200, paused: false },
  XAI: { SINGLE_TX_LIMIT: 20, DAILY_LIMIT: 50, TOKEN_ALLOWANCE: 300, paused: false },
};

const TOKEN_ADDR = {
  ethereum: { USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
  sepolia: { USDT: '0x7169D38820dfd117C3FA1fFaA326bD75453EB6f5' },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
  });
}

function network(env) {
  return (env.NETWORK || 'sepolia').toLowerCase();
}

function safeAddress(env) {
  return (env.SAFE_ADDRESS || DEFAULT_SAFE).trim();
}

async function loadAgents(env) {
  if (!env.TREASURY_KV) return { ...DEFAULT_AGENTS };
  const raw = await env.TREASURY_KV.get('config:agents');
  if (!raw) return { ...DEFAULT_AGENTS };
  try {
    return { ...DEFAULT_AGENTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_AGENTS };
  }
}

async function saveAgents(env, agents) {
  if (env.TREASURY_KV) await env.TREASURY_KV.put('config:agents', JSON.stringify(agents));
}

async function enginePaused(env) {
  if (!env.TREASURY_KV) return false;
  return (await env.TREASURY_KV.get('config:paused')) === 'true';
}

function requireAuth(env, request) {
  if (!env.LTZZZ_AGENT_TOKEN) return { ok: true };
  const authz = request.headers.get('Authorization') || '';
  if (authz !== 'Bearer ' + env.LTZZZ_AGENT_TOKEN) return { ok: false, error: 'unauthorized' };
  return { ok: true };
}

function normalizeAgent(name) {
  const n = String(name || 'GPT').trim();
  if (/^gpt$/i.test(n)) return 'GPT';
  if (/豆包|doubao/i.test(n)) return 'Doubao';
  if (/xai|grok/i.test(n)) return 'XAI';
  return n;
}

function encodeErc20Transfer(to, amountRaw) {
  const sel = 'a9059cbb';
  const toClean = to.replace(/^0x/i, '').toLowerCase().padStart(64, '0');
  const amt = BigInt(amountRaw).toString(16).padStart(64, '0');
  return '0x' + sel + toClean + amt;
}

function usdtToRaw(amount) {
  return BigInt(Math.round(Number(amount) * 1e6));
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (path === '/health' && request.method === 'GET') {
        const agents = await loadAgents(env);
        return json({
          ok: true,
          service: 'ltzzz-treasury-engine',
          version: '1.0.1',
          network: network(env),
          safe: safeAddress(env),
          paused: await enginePaused(env),
          agents,
          kv: Boolean(env.TREASURY_KV),
          private_keys_in_worker: false,
          mode: String(env.DRY_RUN || 'true') !== 'false' ? 'testnet_dry_run' : 'live_queue',
          safe_module: 'allowance_module_path',
        });
      }

      if (path === '/agents' && request.method === 'GET') {
        return json({ ok: true, agents: await loadAgents(env) });
      }

      if (path === '/agents/config' && request.method === 'POST') {
        const gate = requireAuth(env, request);
        if (!gate.ok) return json(gate, 401);
        const body = await request.json().catch(() => ({}));
        const agents = await loadAgents(env);
        const a = normalizeAgent(body.agent);
        if (!agents[a]) agents[a] = { SINGLE_TX_LIMIT: 10, DAILY_LIMIT: 30, TOKEN_ALLOWANCE: 100, paused: false };
        if (body.SINGLE_TX_LIMIT != null) agents[a].SINGLE_TX_LIMIT = Number(body.SINGLE_TX_LIMIT);
        if (body.DAILY_LIMIT != null) agents[a].DAILY_LIMIT = Number(body.DAILY_LIMIT);
        if (body.TOKEN_ALLOWANCE != null) agents[a].TOKEN_ALLOWANCE = Number(body.TOKEN_ALLOWANCE);
        if (body.paused != null) agents[a].paused = Boolean(body.paused);
        await saveAgents(env, agents);
        await notify(env, '额度已更新 ' + a);
        return json({ ok: true, agent: a, config: agents[a] });
      }

      if (path === '/pause' && request.method === 'POST') {
        const gate = requireAuth(env, request);
        if (!gate.ok) return json(gate, 401);
        if (env.TREASURY_KV) await env.TREASURY_KV.put('config:paused', 'true');
        await notify(env, 'Treasury 已暂停');
        return json({ ok: true, paused: true });
      }

      if (path === '/resume' && request.method === 'POST') {
        const gate = requireAuth(env, request);
        if (!gate.ok) return json(gate, 401);
        if (env.TREASURY_KV) await env.TREASURY_KV.put('config:paused', 'false');
        await notify(env, 'Treasury 已恢复');
        return json({ ok: true, paused: false });
      }

      if (path === '/propose' && request.method === 'POST') {
        const gate = requireAuth(env, request);
        if (!gate.ok) return json(gate, 401);
        return await propose(request, env);
      }

      if (path === '/list' && request.method === 'GET') {
        return await listTx(env, url);
      }

      if (path === '/confirm' && request.method === 'POST') {
        const gate = requireAuth(env, request);
        if (!gate.ok) return json(gate, 401);
        return await confirmOnchain(request, env);
      }

      return json({
        ok: true,
        private_keys_in_worker: false,
        endpoints: ['GET /health', 'GET /agents', 'POST /agents/config', 'POST /pause', 'POST /resume', 'POST /propose', 'GET /list', 'POST /confirm'],
      });
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 500);
    }
  },
};

async function propose(request, env) {
  if (await enginePaused(env)) {
    await notify(env, '提案失败：Treasury 已暂停');
    return json({ ok: false, error: 'engine_paused' }, 403);
  }

  const body = await request.json().catch(() => ({}));
  // Reject accidental key material in body
  const blob = JSON.stringify(body);
  if (/private[_-]?key|mnemonic|seed phrase/i.test(blob)) {
    return json({ ok: false, error: 'private_key_material_rejected' }, 400);
  }

  const agent = normalizeAgent(body.agent || body.submitted_by || 'GPT');
  const agents = await loadAgents(env);
  const cfg = agents[agent] || DEFAULT_AGENTS.GPT;

  if (cfg.paused) {
    await notify(env, agent + ' 提案失败：Agent 已暂停');
    return json({ ok: false, error: 'agent_paused', agent }, 403);
  }

  const amount = Number(body.amount || 0);
  const asset = (body.asset || 'USDT').toUpperCase();
  const net = network(env);
  const to = (body.to || '').trim();
  const purpose = String(body.purpose || 'ops').slice(0, 200);

  if (!amount || amount <= 0) return json({ ok: false, error: 'invalid_amount' }, 400);
  if (!/^0x[a-fA-F0-9]{40}$/.test(to)) return json({ ok: false, error: 'invalid_to' }, 400);

  await notify(env, '提案 ' + agent + ' ' + amount + ' ' + asset + ' ' + net);

  if (amount > cfg.SINGLE_TX_LIMIT) {
    await notify(env, '失败：超过单笔限额');
    return json({ ok: false, error: 'single_tx_limit', limit: cfg.SINGLE_TX_LIMIT }, 400);
  }

  const day = new Date().toISOString().slice(0, 10);
  const dailyKey = 'agent:' + agent + ':daily:' + day;
  const allowKey = 'agent:' + agent + ':spent_allowance';
  let daily = 0;
  let spentAllow = 0;
  if (env.TREASURY_KV) {
    daily = Number((await env.TREASURY_KV.get(dailyKey)) || 0);
    spentAllow = Number((await env.TREASURY_KV.get(allowKey)) || 0);
  }
  if (daily + amount > cfg.DAILY_LIMIT) {
    await notify(env, '失败：超过日限额');
    return json({ ok: false, error: 'daily_limit', limit: cfg.DAILY_LIMIT, daily }, 400);
  }
  if (spentAllow + amount > cfg.TOKEN_ALLOWANCE) {
    await notify(env, '失败：超过 TOKEN_ALLOWANCE');
    return json({ ok: false, error: 'token_allowance', limit: cfg.TOKEN_ALLOWANCE }, 400);
  }

  const id = 'TX-' + day.replace(/-/g, '') + '-' + agent + '-' + Math.random().toString(36).slice(2, 7);
  const token = (env.USDT_TOKEN_ADDRESS || (TOKEN_ADDR[net] && TOKEN_ADDR[net][asset]) || TOKEN_ADDR.ethereum.USDT).trim();
  const amountRaw = usdtToRaw(amount).toString();
  const data = encodeErc20Transfer(to, amountRaw);
  const dry = String(env.DRY_RUN || 'true') !== 'false';

  const record = {
    id,
    agent,
    status: dry ? 'executed_dry_run' : 'proposed_awaiting_module',
    amount,
    asset,
    network: net,
    safe: safeAddress(env),
    token,
    to,
    purpose,
    amount_raw: amountRaw,
    calldata: data,
    safe_tx: { to: token, value: '0', data, operation: 0 },
    tx_hash: dry ? 'dry_' + id : null,
    confirmed: false,
    created_at: new Date().toISOString(),
    private_key_used: false,
  };

  record.ledger = {
    id,
    time: record.created_at,
    asset,
    amount,
    network: net,
    发送地址: record.safe,
    接收地址: to,
    TXID: record.tx_hash || 'pending',
    状态: record.status,
    用途: purpose,
    agent,
  };
  record.memory = {
    type: 'treasury_tx',
    id,
    summary: agent + ' ' + amount + ' ' + asset + ' [' + record.status + ']',
  };

  if (env.TREASURY_KV) {
    await env.TREASURY_KV.put('tx:' + id, JSON.stringify(record));
    await env.TREASURY_KV.put(dailyKey, String(daily + amount));
    await env.TREASURY_KV.put(allowKey, String(spentAllow + amount));
    await env.TREASURY_KV.put('result:' + id, JSON.stringify(record.ledger));
  }

  await notify(env, dry ? 'dry_run 完成 ' + id : '待 Safe Module ' + id);

  return json({
    ok: true,
    decision: 'allowance_pass',
    dry_run: dry,
    private_key_used: false,
    record,
    persist: { results_path: 'results/treasury/' + id + '.json', memory: record.memory },
  });
}

async function listTx(env, url) {
  if (!env.TREASURY_KV) return json({ ok: true, items: [] });
  const limit = Number(url.searchParams.get('limit') || 20);
  const listed = await env.TREASURY_KV.list({ prefix: 'tx:', limit: 100 });
  const items = [];
  for (const k of listed.keys || []) {
    const raw = await env.TREASURY_KV.get(k.name);
    if (raw) items.push(JSON.parse(raw));
  }
  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return json({ ok: true, count: items.length, items: items.slice(0, limit) });
}

async function confirmOnchain(request, env) {
  const body = await request.json().catch(() => ({}));
  const id = body.id;
  const tx_hash = body.tx_hash;
  if (!id || !tx_hash || !env.TREASURY_KV) return json({ ok: false, error: 'need id + tx_hash' }, 400);
  const raw = await env.TREASURY_KV.get('tx:' + id);
  if (!raw) return json({ ok: false, error: 'not_found' }, 404);
  const record = JSON.parse(raw);
  record.tx_hash = tx_hash;
  record.confirmed = Boolean(body.confirmed !== false);
  record.status = record.confirmed ? 'success' : 'submitted';
  record.private_key_used = false;
  if (record.ledger) {
    record.ledger.TXID = tx_hash;
    record.ledger.状态 = record.status;
  }
  await env.TREASURY_KV.put('tx:' + id, JSON.stringify(record));
  await env.TREASURY_KV.put('result:' + id, JSON.stringify(record.ledger));
  await notify(env, (record.confirmed ? '成功 ' : '已提交 ') + id + ' ' + tx_hash);
  return json({ ok: true, record });
}

async function notify(env, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  try {
    await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: String(text).slice(0, 3500) }),
    });
  } catch (_) {}
}
