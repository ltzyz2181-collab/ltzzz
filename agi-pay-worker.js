/**
 * LTZZZ AGI Pay v0 — Intent-native machine payments
 * Flow: INTENT → QUOTE → COMMIT → SETTLE → RECEIPT
 * Rails: x402 | stream-usdc | erc20-allowance | credit-pool
 */
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, PAYMENT-SIGNATURE, X-PAYMENT',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const RAILS = {
  x402: { unit: 'HTTP-402', asset: 'USDC', min: 0.0001, max: 2, latency_ms: 80 },
  'stream-usdc': { unit: 'per-token', asset: 'USDC', min: 0.000001, max: 0.5, latency_ms: 20 },
  'erc20-allowance': { unit: 'Safe-module', asset: 'USDT', min: 0.01, max: 100, latency_ms: 12000 },
  'credit-pool': { unit: 'internal-ledger', asset: 'LTZ', min: 0.0001, max: 20, latency_ms: 5 },
};
const AGENTS = ['Grok', 'Doubao', 'DeepSeek', 'Qianwen', 'Kimi', 'Claude', 'GPT', 'Microsoft'];
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors, ...extra },
  });
}
function id(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
function policy(env) {
  return {
    version: 'agi-pay-0.1',
    daily_cap_usd: Number(env.AGI_PAY_DAILY || 50),
    single_cap_usd: Number(env.AGI_PAY_SINGLE || 5),
    stream_tick_usd: Number(env.AGI_PAY_TICK || 0.0002),
    rails: Object.keys(RAILS),
    dry_run: String(env.DRY_RUN || 'true') !== 'false',
    breaker_open: String(env.BREAKER_OPEN || 'false') === 'true',
    council: AGENTS,
    split: { reinvest: 0.3, ops: 0.4, reserve: 0.3 },
  };
}
function pickRail(intent) {
  const kind = String(intent.kind || 'api').toLowerCase();
  if (kind === 'inference' || kind === 'token' || kind === 'stream') return 'stream-usdc';
  if (kind === 'compute' || kind === 'batch' || Number(intent.max_usd || 0) >= 1) return 'erc20-allowance';
  if (kind === 'internal' || kind === 'credit') return 'credit-pool';
  return 'x402';
}
function quoteFor(intent, rail) {
  const spec = RAILS[rail];
  const max = Number(intent.max_usd || spec.max);
  const units = Number(intent.units || 1);
  let price = rail === 'stream-usdc' ? units * 0.00012 : units * (intent.unit_price || 0.002);
  price = Math.max(spec.min, Math.min(price, Math.min(spec.max, max)));
  return { rail, asset: spec.asset, unit: spec.unit, price_usd: Number(price.toFixed(6)), ttl_sec: 30, latency_ms: spec.latency_ms };
}
async function kvGet(env, key, fallback) {
  const kv = env.PAY_KV || env.TREASURY_KV;
  if (!kv) return fallback;
  const raw = await kv.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return raw; }
}
async function kvPut(env, key, value) {
  const kv = env.PAY_KV || env.TREASURY_KV;
  if (!kv) return false;
  await kv.put(key, typeof value === 'string' ? value : JSON.stringify(value));
  return true;
}
async function daySpend(env) {
  const day = new Date().toISOString().slice(0, 10);
  const n = await kvGet(env, 'agi-pay:daily:' + day, 0);
  return { day, spent: Number(n || 0) };
}
function breakerCheck(p, intent, quote, spent) {
  const triggers = [];
  if (p.breaker_open) triggers.push('manual_breaker');
  if (quote.price_usd > p.single_cap_usd) triggers.push('single_cap');
  if (spent + quote.price_usd > p.daily_cap_usd) triggers.push('daily_cap');
  if (/private.?key|mnemonic|seed phrase/i.test(JSON.stringify(intent))) triggers.push('key_exfil_attempt');
  if (intent.to && !/^0x[a-fA-F0-9]{40}$|^did:/.test(String(intent.to))) triggers.push('bad_destination');
  return triggers;
}
function rewritePolicy(triggers, p) {
  const next = { ...p, rewritten_at: new Date().toISOString(), rewritten_for: triggers };
  if (triggers.includes('daily_cap')) next.daily_cap_usd = Math.max(1, p.daily_cap_usd * 0.7);
  if (triggers.includes('single_cap')) next.single_cap_usd = Math.max(0.05, p.single_cap_usd * 0.5);
  if (triggers.includes('key_exfil_attempt')) next.breaker_open = true;
  return next;
}
async function listPrefix(env, prefix, limit) {
  const kv = env.PAY_KV || env.TREASURY_KV;
  if (!kv) return [];
  const listed = await kv.list({ prefix, limit: 100 });
  const items = [];
  for (const k of listed.keys || []) {
    const raw = await kv.get(k.name);
    if (raw) { try { items.push(JSON.parse(raw)); } catch { items.push({ raw }); } }
  }
  items.sort((a, b) => String(b.created_at || b.settled_at || '').localeCompare(String(a.created_at || a.settled_at || '')));
  return items.slice(0, limit);
}
async function commit(request, env) {
  const body = await request.json().catch(() => ({}));
  const p = policy(env);
  const intent = body.intent_id ? await kvGet(env, 'agi-pay:intent:' + body.intent_id, body) : {
    id: id('INT'), agent: body.agent || 'Grok', kind: body.kind || 'api', want: body.want || 'service',
    units: Number(body.units || 1), max_usd: Number(body.max_usd || body.amount || 0.01), to: body.to || 'did:ltzzz:market',
  };
  const rail = body.rail || pickRail(intent);
  const quote = quoteFor(intent, rail);
  const { day, spent } = await daySpend(env);
  const triggers = breakerCheck(p, intent, quote, spent);
  if (triggers.length) {
    const rewritten = rewritePolicy(triggers, p);
    await kvPut(env, 'agi-pay:breaker:' + Date.now(), { triggers, rewritten });
    return json({ ok: false, status: 'CIRCUIT_OPEN', action: 'rewrite_in_place', triggers, policy_next: rewritten }, 409);
  }
  const receipt = {
    id: id('RCT'), type: 'agi-pay-receipt', rail, asset: quote.asset, amount_usd: quote.price_usd,
    agent: intent.agent, want: intent.want, to: intent.to, dry_run: p.dry_run,
    settled_at: new Date().toISOString(),
    split: { reinvest: Number((quote.price_usd * p.split.reinvest).toFixed(6)), ops: Number((quote.price_usd * p.split.ops).toFixed(6)), reserve: Number((quote.price_usd * p.split.reserve).toFixed(6)) },
    proof: p.dry_run ? 'dry-run-receipt' : 'pending-chain',
    tx_hash: p.dry_run ? 'dry_' + id('TX') : null,
  };
  await kvPut(env, 'agi-pay:receipt:' + receipt.id, receipt);
  await kvPut(env, 'agi-pay:daily:' + day, spent + quote.price_usd);
  if (intent.id) { intent.status = 'settled'; intent.receipt_id = receipt.id; await kvPut(env, 'agi-pay:intent:' + intent.id, intent); }
  return json({ ok: true, status: p.dry_run ? 'SETTLED_DRY' : 'SETTLED_QUEUED', quote, receipt, pipeline: ['INTENT','QUOTE','COMMIT','SETTLE','RECEIPT'] });
}
async function gatedResource(request, env) {
  const pay = request.headers.get('X-PAYMENT') || request.headers.get('PAYMENT-SIGNATURE');
  if (!pay) {
    return json({ ok: false, status: 402, protocol: 'x402', pay_to: 'did:ltzzz:lab', asset: 'USDC', amount_usd: 0.001, how: 'POST /commit then retry with X-PAYMENT: receipt_id' }, 402, { 'WWW-Authenticate': 'x402 amount=0.001 asset=USDC payee=did:ltzzz:lab' });
  }
  const receipt = await kvGet(env, 'agi-pay:receipt:' + pay, null);
  if (!receipt && pay !== 'demo') return json({ ok: false, error: 'invalid_receipt' }, 402);
  return json({ ok: true, resource: 'ltzzz-agi-signal', payload: { line: 'future pay is intent settlement', ts: new Date().toISOString() }, receipt_used: pay });
}
async function streamTick(request, env) {
  const body = await request.json().catch(() => ({}));
  const tokens = Math.max(1, Number(body.tokens || 32));
  const agent = body.agent || 'Grok';
  const p = policy(env);
  const price = Number((tokens * p.stream_tick_usd).toFixed(6));
  const { day, spent } = await daySpend(env);
  if (spent + price > p.daily_cap_usd) return json({ ok: false, status: 'CIRCUIT_OPEN', triggers: ['daily_cap'] }, 409);
  const receipt = { id: id('STR'), type: 'stream-tick', rail: 'stream-usdc', agent, tokens, amount_usd: price, settled_at: new Date().toISOString(), dry_run: p.dry_run };
  await kvPut(env, 'agi-pay:receipt:' + receipt.id, receipt);
  await kvPut(env, 'agi-pay:daily:' + day, spent + price);
  return json({ ok: true, receipt, stream: 'continue' });
}
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (path === '/' || path === '/health') {
        return json({ ok: true, service: 'ltzzz-agi-pay', thesis: 'Agents buy work with intents. Receipts are truth.', version: '0.1.0', policy: policy(env), rails: RAILS, endpoints: ['GET /health','GET /market','POST /intent','POST /quote','POST /commit','GET /resource','POST /stream-tick','GET /receipts','GET /ledger'] });
      }
      if (path === '/market' && request.method === 'GET') {
        return json({ ok: true, open_intents: await listPrefix(env, 'agi-pay:intent:', 30), rails: RAILS, agents: AGENTS });
      }
      if (path === '/intent' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const intent = { id: id('INT'), agent: body.agent || 'Grok', kind: body.kind || 'api', want: String(body.want || body.service || 'inference').slice(0, 240), units: Number(body.units || 1), max_usd: Number(body.max_usd || 0.05), to: body.to || 'did:ltzzz:market', created_at: new Date().toISOString(), status: 'open' };
        await kvPut(env, 'agi-pay:intent:' + intent.id, intent);
        return json({ ok: true, intent, suggested: quoteFor(intent, pickRail(intent)), next: 'POST /quote or POST /commit' });
      }
      if (path === '/quote' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const intent = body.intent_id ? await kvGet(env, 'agi-pay:intent:' + body.intent_id, body) : body;
        const rail = body.rail || pickRail(intent);
        const q = { id: id('Q'), ...quoteFor(intent, rail), intent_id: intent.id || null };
        await kvPut(env, 'agi-pay:quote:' + q.id, q);
        return json({ ok: true, quote: q });
      }
      if (path === '/commit' && request.method === 'POST') return await commit(request, env);
      if (path === '/resource') return await gatedResource(request, env);
      if (path === '/stream-tick' && request.method === 'POST') return await streamTick(request, env);
      if (path === '/receipts' && request.method === 'GET') return json({ ok: true, items: await listPrefix(env, 'agi-pay:receipt:', 40) });
      if (path === '/ledger' && request.method === 'GET') {
        const d = await daySpend(env);
        return json({ ok: true, day: d.day, spent_usd: d.spent, policy: policy(env), items: await listPrefix(env, 'agi-pay:receipt:', 40) });
      }
      return json({ ok: false, error: 'unknown_path' }, 404);
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 500);
    }
  },
};
