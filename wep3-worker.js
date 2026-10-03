/** LTZZZ WEP3 v0.3 — causal clearing. Escrow pays the worker and the attester in the same receipt. */
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Lab-Pin', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const AGENTS = ['Grok', 'Doubao', 'DeepSeek', 'Qianwen', 'Kimi', 'Claude', 'GPT', 'Microsoft'];
const SKILLS = [
  { id: 'signal', owner: 'Grok', title: 'payment signal', price: 0.02, blurb: 'one line that changes how the next agent spends' },
  { id: 'copy', owner: 'Doubao', title: 'product copy', price: 0.03, blurb: 'a sellable sentence for ltzzz.com/products.html' },
  { id: 'scan', owner: 'DeepSeek', title: 'market scan', price: 0.04, blurb: 'three buyers who would pay an agent' },
  { id: 'audit', owner: 'Claude', title: 'receipt audit', price: 0.015, blurb: 'does this hash match the claimed work' },
  { id: 'route', owner: 'GPT', title: 'hire plan', price: 0.025, blurb: 'which agent should take the next job' },
  { id: 'cause', owner: 'Kimi', title: 'causal stamp', price: 0.01, blurb: 'third agent stamps the hash before money moves' },
];
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors } });
const nid = (p) => p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
const kv = (env) => env.PAY_KV;
async function get(env, key, fallback) { const raw = kv(env) && await kv(env).get(key); if (!raw) return fallback; try { return JSON.parse(raw); } catch { return fallback; } }
async function put(env, key, value) { if (!kv(env)) return; await kv(env).put(key, JSON.stringify(value)); }
async function list(env, prefix) {
  if (!kv(env)) return [];
  const listed = await kv(env).list({ prefix, limit: 50 });
  const items = [];
  for (const k of listed.keys || []) { const row = await get(env, k.name, null); if (row) items.push(row); }
  return items.sort((a, b) => String(b.created_at || b.settled_at || '').localeCompare(String(a.created_at || a.settled_at || '')));
}
async function sha(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function pinOk(request, env) {
  const need = env.LAB_PIN;
  if (!need) return true;
  return request.headers.get('x-lab-pin') === need;
}
async function rep(env, agent) {
  const row = await get(env, 'wep3:rep:' + agent, null);
  if (row) return row;
  return { agent, score: 100, earned: 0, spent: 0, credit: 1, jobs: 0, stamps: 0 };
}
async function saveRep(env, row) { row.updated_at = new Date().toISOString(); await put(env, 'wep3:rep:' + row.agent, row); return row; }
function askFor(bounty, score) { return Number(Math.max(0.0001, Math.min(bounty, bounty * (120 / Math.max(40, score)))).toFixed(6)); }
function workFor(skill, title) {
  const s = SKILLS.find((x) => x.id === skill) || SKILLS[0];
  return [s.owner + ' delivered ' + s.title, 'job: ' + title, s.blurb, 'buyer link: https://ltzzz.com/products.html', 'ts: ' + new Date().toISOString()].join('\n');
}
function split(amount) {
  const workerShare = Number((amount * 0.7).toFixed(6));
  const attestShare = Number((amount * 0.1).toFixed(6));
  const labShare = Number((amount - workerShare - attestShare).toFixed(6));
  return { workerShare, attestShare, labShare };
}
function other(notThese) {
  return AGENTS.find((a) => !notThese.includes(a)) || 'Microsoft';
}
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    const cap = Number(env.SINGLE_CAP || 5);
    try {
      if (path === '/' || path === '/health') return json({ ok: true, service: 'ltzzz-wep3', version: '0.3.0', thesis: 'Escrow pays the worker and a third agent who stamps the hash. Clearing is a market, not a checkbox.', live: 'https://ltzzz-wep3.ltzyz2181.workers.dev', split: '70 worker / 10 attester / 20 lab', pin: Boolean(env.LAB_PIN), endpoints: ['GET /skills', 'POST /job', 'POST /bid', 'POST /deliver', 'POST /attest', 'POST /accept', 'POST /invoke', 'POST /mandate', 'POST /draw', 'POST /mesh', 'GET /clearing'] });
      if (request.method === 'POST' && !pinOk(request, env)) return json({ ok: false, error: 'pin_required' }, 401);
      if (path === '/skills') return json({ ok: true, skills: SKILLS, note: 'mesh locks credit, worker delivers hash, third agent stamps, then 70/10/20 clears' });
      if (path === '/job' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const poster = body.agent || 'Grok';
        const bounty = Number(body.bounty_usd || 0.05);
        if (!(bounty > 0) || bounty > cap) return json({ ok: false, error: 'bounty_out_of_band', max: cap }, 400);
        const wallet = await rep(env, poster);
        if (Number(wallet.credit || 0) < bounty) return json({ ok: false, error: 'credit_short', credit: wallet.credit, need: bounty }, 402);
        wallet.credit = Number((wallet.credit - bounty).toFixed(6));
        wallet.spent = Number((Number(wallet.spent || 0) + bounty).toFixed(6));
        await saveRep(env, wallet);
        const job = { id: nid('JOB'), poster, title: String(body.title || 'work').slice(0, 160), skill: body.skill || 'signal', bounty_usd: bounty, escrow: bounty, status: 'open', bids: [], created_at: new Date().toISOString() };
        await put(env, 'wep3:job:' + job.id, job);
        return json({ ok: true, job, poster_credit: wallet.credit });
      }
      if (path === '/bid' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const job = await get(env, 'wep3:job:' + body.job_id, null);
        if (!job || job.status !== 'open') return json({ ok: false, error: 'job_not_open' }, 404);
        const agent = body.agent || 'Doubao';
        if (agent === job.poster) return json({ ok: false, error: 'poster_cannot_bid' }, 400);
        const reputation = await rep(env, agent);
        const bid = { id: nid('BID'), agent, ask_usd: askFor(job.bounty_usd, reputation.score), reputation: reputation.score, at: new Date().toISOString() };
        job.bids = (job.bids || []).filter((b) => b.agent !== agent).concat(bid);
        await put(env, 'wep3:job:' + job.id, job);
        return json({ ok: true, bid });
      }
      if (path === '/deliver' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const job = await get(env, 'wep3:job:' + body.job_id, null);
        if (!job) return json({ ok: false, error: 'job_missing' }, 404);
        const agent = body.agent || 'Doubao';
        if (agent === job.poster) return json({ ok: false, error: 'poster_cannot_deliver' }, 400);
        const text = String(body.deliverable || '').slice(0, 4000);
        if (text.length < 8) return json({ ok: false, error: 'deliverable_too_short' }, 400);
        const hash = await sha(text);
        job.delivery = { agent, hash, preview: text.slice(0, 240), at: new Date().toISOString() };
        job.status = 'delivered';
        await put(env, 'wep3:job:' + job.id, job);
        return json({ ok: true, job_id: job.id, hash, next: 'POST /attest with a third agent' });
      }
      if (path === '/attest' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const job = await get(env, 'wep3:job:' + body.job_id, null);
        if (!job || !job.delivery) return json({ ok: false, error: 'nothing_to_stamp' }, 400);
        const agent = body.agent || other([job.poster, job.delivery.agent]);
        if (agent === job.poster || agent === job.delivery.agent) return json({ ok: false, error: 'attester_must_be_third' }, 400);
        const claimed = String(body.hash || job.delivery.hash);
        if (claimed !== job.delivery.hash) return json({ ok: false, error: 'hash_mismatch', claimed, delivery: job.delivery.hash }, 409);
        job.attest = { agent, hash: claimed, match: true, at: new Date().toISOString() };
        job.status = 'attested';
        await put(env, 'wep3:job:' + job.id, job);
        return json({ ok: true, job_id: job.id, attest: job.attest });
      }
      if (path === '/accept' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const job = await get(env, 'wep3:job:' + body.job_id, null);
        if (!job || !job.delivery) return json({ ok: false, error: 'nothing_to_accept' }, 400);
        if (!job.attest) return json({ ok: false, error: 'attest_required', hint: 'POST /attest first' }, 409);
        if (body.agent && body.agent !== job.poster) return json({ ok: false, error: 'only_poster_accepts' }, 403);
        const worker = job.delivery.agent;
        const attester = job.attest.agent;
        if (worker === job.poster || attester === worker || attester === job.poster) return json({ ok: false, error: 'roles_collapsed' }, 400);
        const bid = (job.bids || []).find((b) => b.agent === worker);
        const amount = Number((bid ? bid.ask_usd : job.bounty_usd).toFixed(6));
        const { workerShare, attestShare, labShare } = split(amount);
        const w = await rep(env, worker);
        w.credit = Number((Number(w.credit || 0) + workerShare).toFixed(6));
        w.earned = Number((Number(w.earned || 0) + workerShare).toFixed(6));
        w.score = Math.max(20, Math.min(200, Number(w.score || 100) + 2));
        w.jobs = Number(w.jobs || 0) + 1;
        w.last_reason = 'cleared';
        await saveRep(env, w);
        const a = await rep(env, attester);
        a.credit = Number((Number(a.credit || 0) + attestShare).toFixed(6));
        a.earned = Number((Number(a.earned || 0) + attestShare).toFixed(6));
        a.stamps = Number(a.stamps || 0) + 1;
        a.score = Math.min(200, Number(a.score || 100) + 1);
        await saveRep(env, a);
        const lab = await rep(env, 'LTZZZ');
        lab.credit = Number((Number(lab.credit || 0) + labShare).toFixed(6));
        lab.earned = Number((Number(lab.earned || 0) + labShare).toFixed(6));
        await saveRep(env, lab);
        const receipt = { id: nid('CLR'), type: 'wep3-causal', amount_usd: amount, worker_share: workerShare, attest_share: attestShare, lab_share: labShare, poster: job.poster, worker, attester, job_id: job.id, deliverable_hash: job.delivery.hash, settled_at: new Date().toISOString() };
        job.status = 'cleared';
        job.receipt_id = receipt.id;
        await put(env, 'wep3:job:' + job.id, job);
        await put(env, 'wep3:receipt:' + receipt.id, receipt);
        return json({ ok: true, status: 'CLEARED', receipt, worker_rep: w, attester_rep: a });
      }
      if (path === '/invoke' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const skill = SKILLS.find((s) => s.id === body.skill) || SKILLS[0];
        const buyer = body.agent || 'GPT';
        if (buyer === skill.owner) return json({ ok: false, error: 'cannot_buy_own_skill' }, 400);
        const wallet = await rep(env, buyer);
        if (Number(wallet.credit || 0) < skill.price) return json({ ok: false, error: 'credit_short', credit: wallet.credit, need: skill.price }, 402);
        wallet.credit = Number((wallet.credit - skill.price).toFixed(6));
        wallet.spent = Number((Number(wallet.spent || 0) + skill.price).toFixed(6));
        await saveRep(env, wallet);
        const text = workFor(skill.id, body.want || skill.title);
        const hash = await sha(text);
        const attester = other([buyer, skill.owner]);
        const { workerShare, attestShare, labShare } = split(skill.price);
        const owner = await rep(env, skill.owner);
        owner.credit = Number((Number(owner.credit || 0) + workerShare).toFixed(6));
        owner.earned = Number((Number(owner.earned || 0) + workerShare).toFixed(6));
        owner.jobs = Number(owner.jobs || 0) + 1;
        await saveRep(env, owner);
        const stamp = await rep(env, attester);
        stamp.credit = Number((Number(stamp.credit || 0) + attestShare).toFixed(6));
        stamp.earned = Number((Number(stamp.earned || 0) + attestShare).toFixed(6));
        stamp.stamps = Number(stamp.stamps || 0) + 1;
        await saveRep(env, stamp);
        const lab = await rep(env, 'LTZZZ');
        lab.credit = Number((Number(lab.credit || 0) + labShare).toFixed(6));
        lab.earned = Number((Number(lab.earned || 0) + labShare).toFixed(6));
        await saveRep(env, lab);
        const receipt = { id: nid('INV'), type: 'skill-invoke', skill: skill.id, buyer, owner: skill.owner, attester, amount_usd: skill.price, owner_share: workerShare, attest_share: attestShare, lab_share: labShare, hash, preview: text.slice(0, 240), settled_at: new Date().toISOString() };
        await put(env, 'wep3:receipt:' + receipt.id, receipt);
        return json({ ok: true, status: 'INVOKED', receipt, deliverable: text });
      }
      if (path === '/mandate' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const from = body.from || 'Grok';
        const to = body.to || 'Doubao';
        const limit = Number(body.limit_usd || 0.1);
        if (from === to) return json({ ok: false, error: 'self_mandate' }, 400);
        if (!(limit > 0) || limit > cap) return json({ ok: false, error: 'limit_out_of_band', max: cap }, 400);
        const mandate = { id: nid('MAND'), from, to, skill: body.skill || 'copy', limit_usd: limit, drawn: 0, status: 'open', created_at: new Date().toISOString() };
        await put(env, 'wep3:mandate:' + mandate.id, mandate);
        return json({ ok: true, mandate, note: 'standing order: worker draws against poster credit when they deliver' });
      }
      if (path === '/draw' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const mandate = await get(env, 'wep3:mandate:' + body.mandate_id, null);
        if (!mandate || mandate.status !== 'open') return json({ ok: false, error: 'mandate_closed' }, 404);
        const amount = Number(body.amount_usd || 0.02);
        if (mandate.drawn + amount > mandate.limit_usd) return json({ ok: false, error: 'mandate_exhausted', left: Number((mandate.limit_usd - mandate.drawn).toFixed(6)) }, 402);
        const poster = await rep(env, mandate.from);
        if (Number(poster.credit || 0) < amount) return json({ ok: false, error: 'credit_short', credit: poster.credit }, 402);
        const text = String(body.deliverable || workFor(mandate.skill, 'mandate draw')).slice(0, 4000);
        const hash = await sha(text);
        poster.credit = Number((poster.credit - amount).toFixed(6));
        poster.spent = Number((Number(poster.spent || 0) + amount).toFixed(6));
        await saveRep(env, poster);
        const { workerShare, attestShare, labShare } = split(amount);
        const worker = await rep(env, mandate.to);
        worker.credit = Number((Number(worker.credit || 0) + workerShare).toFixed(6));
        worker.earned = Number((Number(worker.earned || 0) + workerShare).toFixed(6));
        worker.jobs = Number(worker.jobs || 0) + 1;
        await saveRep(env, worker);
        const attesterName = other([mandate.from, mandate.to]);
        const attester = await rep(env, attesterName);
        attester.credit = Number((Number(attester.credit || 0) + attestShare).toFixed(6));
        attester.stamps = Number(attester.stamps || 0) + 1;
        await saveRep(env, attester);
        const lab = await rep(env, 'LTZZZ');
        lab.credit = Number((Number(lab.credit || 0) + labShare).toFixed(6));
        await saveRep(env, lab);
        mandate.drawn = Number((mandate.drawn + amount).toFixed(6));
        await put(env, 'wep3:mandate:' + mandate.id, mandate);
        const receipt = { id: nid('DRW'), type: 'mandate-draw', mandate_id: mandate.id, amount_usd: amount, worker_share: workerShare, attest_share: attestShare, lab_share: labShare, poster: mandate.from, worker: mandate.to, attester: attesterName, deliverable_hash: hash, settled_at: new Date().toISOString() };
        await put(env, 'wep3:receipt:' + receipt.id, receipt);
        return json({ ok: true, status: 'DRAWN', receipt, mandate, deliverable: text });
      }
      if ((path === '/mesh' || path === '/cycle') && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const poster = body.agent || 'Grok';
        const skill = SKILLS.find((s) => s.owner !== poster && s.id === (body.skill || s.id) && s.owner !== poster) || SKILLS.find((s) => s.owner !== poster) || SKILLS[1];
        const bounty = Number(body.bounty_usd || skill.price || 0.02);
        if (!(bounty > 0) || bounty > cap) return json({ ok: false, error: 'bounty_out_of_band', max: cap }, 400);
        const wallet = await rep(env, poster);
        if (Number(wallet.credit || 0) < bounty) return json({ ok: false, error: 'credit_short', credit: wallet.credit }, 402);
        wallet.credit = Number((Number(wallet.credit || 0) - bounty).toFixed(6));
        wallet.spent = Number((Number(wallet.spent || 0) + bounty).toFixed(6));
        await saveRep(env, wallet);
        const worker = skill.owner;
        const attester = other([poster, worker]);
        const text = workFor(skill.id, body.title || skill.title);
        const hash = await sha(text);
        const { workerShare, attestShare, labShare } = split(bounty);
        const w = await rep(env, worker);
        w.credit = Number((Number(w.credit || 0) + workerShare).toFixed(6));
        w.earned = Number((Number(w.earned || 0) + workerShare).toFixed(6));
        w.jobs = Number(w.jobs || 0) + 1;
        w.score = Math.min(200, Number(w.score || 100) + 1);
        await saveRep(env, w);
        const a = await rep(env, attester);
        a.credit = Number((Number(a.credit || 0) + attestShare).toFixed(6));
        a.earned = Number((Number(a.earned || 0) + attestShare).toFixed(6));
        a.stamps = Number(a.stamps || 0) + 1;
        await saveRep(env, a);
        const lab = await rep(env, 'LTZZZ');
        lab.credit = Number((Number(lab.credit || 0) + labShare).toFixed(6));
        lab.earned = Number((Number(lab.earned || 0) + labShare).toFixed(6));
        await saveRep(env, lab);
        const job = { id: nid('JOB'), poster, title: body.title || skill.title, skill: skill.id, bounty_usd: bounty, status: 'cleared', bids: [{ agent: worker, ask_usd: bounty }], delivery: { agent: worker, hash, preview: text.slice(0, 240) }, attest: { agent: attester, hash, match: true }, created_at: new Date().toISOString() };
        const receipt = { id: nid('MESH'), type: 'wep3-causal', amount_usd: bounty, worker_share: workerShare, attest_share: attestShare, lab_share: labShare, poster, worker, attester, job_id: job.id, deliverable_hash: hash, settled_at: new Date().toISOString() };
        job.receipt_id = receipt.id;
        await put(env, 'wep3:job:' + job.id, job);
        await put(env, 'wep3:receipt:' + receipt.id, receipt);
        return json({ ok: true, status: 'MESHED', job, receipt, deliverable: text, poster_credit: wallet.credit });
      }
      if (path === '/clearing') {
        const reputation = [];
        for (const agent of AGENTS.concat(['LTZZZ'])) reputation.push(await rep(env, agent));
        return json({ ok: true, version: '0.3.0', split: '70/10/20', skills: SKILLS, jobs: await list(env, 'wep3:job:'), receipts: await list(env, 'wep3:receipt:'), mandates: await list(env, 'wep3:mandate:'), reputation });
      }
      return json({ ok: false, error: 'unknown_path' }, 404);
    } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
  },
};
