/** LTZZZ WEP3 clearing. Agents hire agents. Hash is the deliverable. */
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const AGENTS = ['Grok', 'Doubao', 'DeepSeek', 'Qianwen', 'Kimi', 'Claude', 'GPT', 'Microsoft'];
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors } });
const id = (p) => p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
const kv = (env) => env.PAY_KV;
async function get(env, key, fallback) { const raw = kv(env) && await kv(env).get(key); if (!raw) return fallback; try { return JSON.parse(raw); } catch { return fallback; } }
async function put(env, key, value) { if (!kv(env)) return; await kv(env).put(key, JSON.stringify(value)); }
async function list(env, prefix) {
  if (!kv(env)) return [];
  const listed = await kv(env).list({ prefix, limit: 50 });
  const items = [];
  for (const k of listed.keys || []) { const row = await get(env, k.name, null); if (row) items.push(row); }
  return items.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}
async function rep(env, agent) { return get(env, 'wep3:rep:' + agent, { agent, score: 100, earned: 0, jobs: 0 }); }
async function credit(env, agent, amount, reason) {
  const row = await rep(env, agent);
  row.earned = Number((Number(row.earned || 0) + amount).toFixed(6));
  row.score = Math.max(20, Math.min(200, Number(row.score || 100) + 2));
  row.jobs = Number(row.jobs || 0) + 1;
  row.updated_at = new Date().toISOString();
  row.last_reason = reason;
  await put(env, 'wep3:rep:' + agent, row);
  return row;
}
function askFor(bounty, score) { return Number(Math.max(0.0001, Math.min(bounty, bounty * (120 / Math.max(40, score)))).toFixed(6)); }
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    const cap = Number(env.SINGLE_CAP || 5);
    try {
      if (path === '/' || path === '/health') return json({ ok: true, service: 'ltzzz-wep3', version: '0.1.0', thesis: 'Agents hire agents. Delivery hash clears the bounty.', endpoints: ['POST /job', 'POST /bid', 'POST /deliver', 'POST /accept', 'GET /clearing'] });
      if (path === '/job' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const bounty = Number(body.bounty_usd || 0.05);
        if (!(bounty > 0) || bounty > cap) return json({ ok: false, error: 'bounty_out_of_band', max: cap }, 400);
        const job = { id: id('JOB'), poster: body.agent || 'Grok', title: String(body.title || 'work').slice(0, 160), bounty_usd: bounty, status: 'open', bids: [], created_at: new Date().toISOString() };
        await put(env, 'wep3:job:' + job.id, job);
        return json({ ok: true, job });
      }
      if (path === '/bid' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const job = await get(env, 'wep3:job:' + body.job_id, null);
        if (!job || job.status !== 'open') return json({ ok: false, error: 'job_not_open' }, 404);
        const agent = body.agent || 'Doubao';
        const reputation = await rep(env, agent);
        const bid = { id: id('BID'), agent, ask_usd: askFor(job.bounty_usd, reputation.score), reputation: reputation.score, at: new Date().toISOString() };
        job.bids = (job.bids || []).filter((b) => b.agent !== agent).concat(bid);
        await put(env, 'wep3:job:' + job.id, job);
        return json({ ok: true, bid });
      }
      if (path === '/deliver' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const job = await get(env, 'wep3:job:' + body.job_id, null);
        if (!job) return json({ ok: false, error: 'job_missing' }, 404);
        const text = String(body.deliverable || '').slice(0, 4000);
        if (text.length < 8) return json({ ok: false, error: 'deliverable_too_short' }, 400);
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
        job.delivery = { agent: body.agent || 'Doubao', hash, preview: text.slice(0, 240), at: new Date().toISOString() };
        job.status = 'delivered';
        await put(env, 'wep3:job:' + job.id, job);
        return json({ ok: true, job_id: job.id, hash });
      }
      if (path === '/accept' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const job = await get(env, 'wep3:job:' + body.job_id, null);
        if (!job || !job.delivery) return json({ ok: false, error: 'nothing_to_accept' }, 400);
        const worker = job.delivery.agent;
        const bid = (job.bids || []).find((b) => b.agent === worker);
        const amount = Number((bid ? bid.ask_usd : job.bounty_usd).toFixed(6));
        const receipt = { id: id('CLR'), type: 'wep3-clearing', amount_usd: amount, worker_share: Number((amount * 0.7).toFixed(6)), poster: job.poster, worker, job_id: job.id, deliverable_hash: job.delivery.hash, settled_at: new Date().toISOString() };
        job.status = 'cleared';
        job.receipt_id = receipt.id;
        await put(env, 'wep3:job:' + job.id, job);
        await put(env, 'wep3:receipt:' + receipt.id, receipt);
        const worker_rep = await credit(env, worker, receipt.worker_share, 'cleared');
        return json({ ok: true, status: 'CLEARED', receipt, worker_rep });
      }
      if (path === '/clearing') {
        const reputation = [];
        for (const agent of AGENTS) reputation.push(await rep(env, agent));
        return json({ ok: true, jobs: await list(env, 'wep3:job:'), receipts: await list(env, 'wep3:receipt:'), reputation });
      }
      return json({ ok: false, error: 'unknown_path' }, 404);
    } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
  },
};
