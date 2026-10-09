/** LTZZZ WEP3 v1.1.1 — credit loop + OKX balance. */
const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Lab-Pin, X-Wep3-Intent, X-Pay-Secret', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'};
const AGENTS = ['Grok', 'Doubao', 'DeepSeek', 'Qianwen', 'Kimi', 'Claude', 'GPT', 'Microsoft'];
const SKILLS = [
  {id: 'signal', owner: 'Grok', title: 'payment signal', price: 0.02, product: 'https://ltzzz.com/products.html'},
  {id: 'copy', owner: 'Doubao', title: 'product copy', price: 0.03, product: 'https://ltzzz.com/products.html'},
  {id: 'scan', owner: 'DeepSeek', title: 'market scan', price: 0.04, product: 'https://ltzzz.com/products.html'},
  {id: 'audit', owner: 'Claude', title: 'receipt audit', price: 0.015, product: 'https://ltzzz.com/products.html'},
  {id: 'route', owner: 'GPT', title: 'hire plan', price: 0.025, product: 'https://ltzzz.com/products.html'},
  {id: 'cause', owner: 'Kimi', title: 'causal stamp', price: 0.01, product: 'https://ltzzz.com/products.html'},
  {id: 'sell', owner: 'Qianwen', title: 'product close', price: 0.05, product: 'https://ltzzz.com/products.html'}
];
const SKUS = [
  {id: 'report-strategy', title: '战略报告', price_usd: 5, skill: 'scan', owner: 'DeepSeek', product: 'https://ltzzz.com/products.html', blurb: '市场与竞争结构一页纸'},
  {id: 'script-video', title: '视频脚本', price_usd: 3, skill: 'copy', owner: 'Doubao', product: 'https://ltzzz.com/products.html', blurb: '60秒产品解说脚本'},
  {id: 'report-research', title: '研究报告', price_usd: 4, skill: 'signal', owner: 'Grok', product: 'https://ltzzz.com/products.html', blurb: '支付信号与转化要点'},
  {id: 'report-trend', title: '趋势报告', price_usd: 4, skill: 'route', owner: 'GPT', product: 'https://ltzzz.com/products.html', blurb: '下一步雇工路线'},
  {id: 'audit-quality', title: '质量审核', price_usd: 2, skill: 'audit', owner: 'Claude', product: 'https://ltzzz.com/products.html', blurb: '交付物与回执抽检'}
];
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'content-type': 'application/json; charset=utf-8', ...cors}});
const nid = p => p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
const known = name => AGENTS.includes(name) || name === 'LTZZZ';
const kv = env => env.PAY_KV;
async function get(env, key, fallback) { const raw = kv(env) && await kv(env).get(key); if (!raw) return fallback; try { return JSON.parse(raw); } catch { return fallback; } }
async function put(env, key, value) { if (kv(env)) await kv(env).put(key, JSON.stringify(value)); }
async function list(env, prefix, lim) { if (!kv(env)) return []; const listed = await kv(env).list({prefix, limit: lim || 80}); const items = []; for (const k of listed.keys || []) { const row = await get(env, k.name, null); if (row) items.push(row); } return items.sort((a, b) => String(b.at || b.created_at || b.settled_at || '').localeCompare(String(a.at || a.created_at || a.settled_at || ''))); }
async function sha(text) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
function pinOk(request, env) { return !env.LAB_PIN || request.headers.get('x-lab-pin') === env.LAB_PIN; }
async function rep(env, agent) { return await get(env, 'wep3:rep:' + agent, null) || {agent, score: 100, earned: 0, spent: 0, credit: 1, jobs: 0, stamps: 0, held: 0, line_used: 0}; }
async function saveRep(env, row) { row.updated_at = new Date().toISOString(); await put(env, 'wep3:rep:' + row.agent, row); return row; }
function other(notThese) { return AGENTS.find(a => !notThese.includes(a)) || 'Microsoft'; }
function workFor(skill, title) { const s = SKILLS.find(x => x.id === skill) || SKILLS[0]; return s.owner + ' delivered ' + s.title + ' | ' + title + ' | ' + s.product + ' | ' + new Date().toISOString(); }
function split(amount) { const workerShare = Number((amount * 0.7).toFixed(6)); const attestShare = Number((amount * 0.1).toFixed(6)); return {workerShare, attestShare, labShare: Number((amount - workerShare - attestShare).toFixed(6))}; }
function lineLimit(row) { return Number(Math.min(0.5, Number(row.earned || 0) * 0.5 + Math.max(0, Number(row.score || 100) - 100) * 0.01).toFixed(6)); }
function spendable(row) { return Number((Number(row.credit || 0) + Math.max(0, lineLimit(row) - Number(row.line_used || 0))).toFixed(6)); }
async function tapePrice(env, skillId) { const skill = SKILLS.find(s => s.id === skillId) || SKILLS[0]; const hits = (await list(env, 'wep3:receipt:')).filter(r => r.skill === skillId && r.status !== 'void').map(r => Number(r.amount_usd || 0)).filter(n => n > 0).slice(0, 7).sort((a, b) => a - b); return hits.length ? Number(hits[Math.floor(hits.length / 2)].toFixed(6)) : skill.price; }
async function credit(env, agent, amount, field) { if (!known(agent)) throw new Error('unknown_agent'); const row = await rep(env, agent); row.credit = Number((Number(row.credit || 0) + amount).toFixed(6)); if (Number(row.line_used || 0) > 0 && row.credit > 0) { const payback = Math.min(row.credit, row.line_used); row.credit = Number((row.credit - payback).toFixed(6)); row.line_used = Number((row.line_used - payback).toFixed(6)); } if (field) row[field] = Number((Number(row[field] || 0) + amount).toFixed(6)); await saveRep(env, row); return row; }
async function draw(env, agent, max) { const wallet = await rep(env, agent); if (spendable(wallet) < max) return {error: 'credit_short', credit: wallet.credit, line: lineLimit(wallet), line_used: wallet.line_used || 0, spendable: spendable(wallet), need: max, status: 402}; const fromCash = Math.min(Number(wallet.credit || 0), max); const fromLine = Number((max - fromCash).toFixed(6)); wallet.credit = Number((Number(wallet.credit || 0) - fromCash).toFixed(6)); wallet.line_used = Number((Number(wallet.line_used || 0) + fromLine).toFixed(6)); wallet.spent = Number((Number(wallet.spent || 0) + max).toFixed(6)); wallet.held = Number((Number(wallet.held || 0) + max).toFixed(6)); await saveRep(env, wallet); return {wallet, fromLine}; }
async function poolState(env) { return await get(env, 'wep3:pool', null) || {total: 0, shares: 0, fee_reserve: 0, volume: 0, updated_at: null}; }
async function savePool(env, pool) { pool.updated_at = new Date().toISOString(); await put(env, 'wep3:pool', pool); return pool; }
async function stakePos(env, agent) { return await get(env, 'wep3:stake:' + agent, null) || {agent, shares: 0, staked: 0, debt: 0, harvested: 0}; }
async function saveStake(env, row) { row.updated_at = new Date().toISOString(); await put(env, 'wep3:stake:' + row.agent, row); return row; }
function shareValue(pool, shares) { if (!pool.shares || pool.shares <= 0) return 0; return Number(((Number(pool.total || 0) + Number(pool.fee_reserve || 0)) * shares / pool.shares).toFixed(6)); }
async function feedPool(env, amount) { if (!(amount > 0)) return; const pool = await poolState(env); pool.fee_reserve = Number((Number(pool.fee_reserve || 0) + amount).toFixed(6)); pool.volume = Number((Number(pool.volume || 0) + amount).toFixed(6)); await savePool(env, pool); }
async function journal(env, entry) {
  entry.id = entry.id || nid('LED'); entry.at = entry.at || new Date().toISOString();
  const book = [];
  for (const a of AGENTS.concat(['LTZZZ'])) { const r = await rep(env, a); const p = await stakePos(env, a); book.push({ agent: a, credit: Number(r.credit || 0), spendable: spendable(r), stake_shares: Number(p.shares || 0), debt: Number(p.debt || 0) }); }
  const pool = await poolState(env);
  entry.pool_after = { total: pool.total, shares: pool.shares, fee_reserve: pool.fee_reserve };
  entry.balances_after = book;
  entry.hash = await sha([entry.id, entry.type, entry.from || '', entry.to || '', String(entry.amount_usd || 0), entry.at].join('|'));
  await put(env, 'wep3:ledger:' + entry.id, entry); return entry;
}
async function buildLedger(env, since, limit) {
  limit = Math.min(100, Math.max(1, Number(limit || 40)));
  let rows = await list(env, 'wep3:ledger:');
  if (since) rows = rows.filter(r => String(r.at || '') >= String(since));
  rows = rows.slice(0, limit);
  const agents = {}; const pool = await poolState(env);
  for (const a of AGENTS.concat(['LTZZZ'])) { const r = await rep(env, a); const p = await stakePos(env, a); agents[a] = { credit: r.credit, earned: r.earned || 0, spent: r.spent || 0, spendable: spendable(r), line: lineLimit(r), stake_value: shareValue(pool, p.shares), debt: p.debt || 0 }; }
  const creditSum = Object.values(agents).reduce((s, x) => s + Number(x.credit || 0), 0);
  return { ok: true, version: '1.1.1', since: since || null, count: rows.length, pool, agents, credit_sum: Number(creditSum.toFixed(6)), pool_nav: Number((Number(pool.total || 0) + Number(pool.fee_reserve || 0)).toFixed(6)), entries: rows.map(r => ({ id: r.id, type: r.type, from: r.from || null, to: r.to || null, amount_usd: r.amount_usd, ref: r.ref || null, at: r.at, hash: r.hash })) };
}
async function settle(env, amount, workerName, attesterName) {
  const shares = split(amount);
  const w = await credit(env, workerName, shares.workerShare, 'earned'); w.jobs = Number(w.jobs || 0) + 1; w.score = Number(w.score || 100) + 2; await saveRep(env, w);
  const a = await credit(env, attesterName, shares.attestShare, 'earned'); a.stamps = Number(a.stamps || 0) + 1; a.score = Number(a.score || 100) + 1; await saveRep(env, a);
  const keep = Number((shares.labShare * 0.5).toFixed(6)); const toPool = Number((shares.labShare - keep).toFixed(6));
  await credit(env, 'LTZZZ', keep, 'earned'); await feedPool(env, toPool);
  await journal(env, {type:'hire_settle', from: workerName, to: attesterName, amount_usd: amount, ref: workerName + '|' + attesterName, meta: shares});
  return shares;
}
function clean(pathname) { let path = pathname || '/'; while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1); return path || '/'; }
async function openIntent(env, poster, skill, max, title, parentId) {
  if (!known(poster)) return {error: 'unknown_agent', status: 400};
  if (!(max > 0) || max > Number(env.SINGLE_CAP || 5)) return {error: 'max_out_of_band', status: 400};
  const drawn = await draw(env, poster, max); if (drawn.error) return drawn;
  const intent = {id: nid('INT'), poster, skill: skill.id, title: String(title || skill.title).slice(0, 160), product: skill.product, max_usd: max, remaining: max, drawn: 0, held: 0, status: 'open', quotes: [], slices: [], prev_hash: 'genesis', matched: null, parent_id: parentId || null, children: [], created_at: new Date().toISOString()};
  await put(env, 'wep3:intent:' + intent.id, intent);
  return {intent, poster_credit: drawn.wallet.credit, line_used: drawn.wallet.line_used, spendable: spendable(drawn.wallet)};
}
async function release(env, intent, reason) {
  if (!intent || intent.status === 'sealed' || intent.status === 'void') return intent;
  const back = Number((Number(intent.remaining || 0) + Number(intent.held || 0)).toFixed(6));
  if (back > 0) await credit(env, intent.poster, back, null);
  const poster = await rep(env, intent.poster);
  poster.held = Number(Math.max(0, Number(poster.held || 0) - Number(intent.max_usd || 0)).toFixed(6));
  await saveRep(env, poster);
  intent.status = 'void'; intent.remaining = 0; intent.held = 0; intent.void_reason = reason; intent.voided_at = new Date().toISOString();
  await put(env, 'wep3:intent:' + intent.id, intent); return intent;
}
async function addQuote(env, intent, agent, ask) {
  if (!known(agent) || agent === intent.poster) return {error: 'bad_quoter'};
  const tape = await tapePrice(env, intent.skill);
  const row = await rep(env, agent);
  const edge = Math.max(0.85, 1 - Math.min(20, Number(row.score || 100) - 100) / 200);
  const floor = Number((tape * edge).toFixed(6));
  if (!(ask > 0) || ask > intent.max_usd) return {error: 'ask_above_budget', budget: intent.max_usd};
  if (ask > tape * 1.5) return {error: 'ask_above_tape', tape, max_ask: Number((tape * 1.5).toFixed(6))};
  if (ask < floor) return {error: 'ask_below_reputation_floor', floor, score: row.score};
  const quote = {id: nid('QTE'), agent, ask_usd: ask, tape, floor, score: row.score, at: new Date().toISOString()};
  intent.quotes = (intent.quotes || []).filter(q => q.agent !== agent).concat(quote);
  if (intent.status === 'open') intent.status = 'quoted';
  await put(env, 'wep3:intent:' + intent.id, intent);
  return {quote, beats_tape: ask <= tape};
}
async function bidAtTape(env, intent, agent) {
  const tape = await tapePrice(env, intent.skill);
  const row = await rep(env, agent);
  const edge = Math.max(0.85, 1 - Math.min(20, Number(row.score || 100) - 100) / 200);
  const floor = Number((tape * edge).toFixed(6));
  const ask = Number(Math.min(intent.max_usd, Math.max(floor, Number((tape * 0.99).toFixed(6)))).toFixed(6));
  return addQuote(env, intent, agent, ask);
}
async function matchIntent(env, intent) {
  const quotes = (intent.quotes || []).slice().sort((a, b) => a.ask_usd - b.ask_usd || b.score - a.score);
  if (!quotes.length) return {error: 'no_quotes'};
  intent.matched = {agent: quotes[0].agent, ask_usd: quotes[0].ask_usd, at: new Date().toISOString()};
  intent.status = 'matched'; await put(env, 'wep3:intent:' + intent.id, intent);
  return {winner: quotes[0], losers: quotes.slice(1)};
}
async function sliceIntent(env, intent, agent, text, sliceUsd) {
  if (!known(agent) || agent === intent.poster) return {error: 'poster_cannot_slice'};
  if (intent.matched && intent.matched.agent !== agent) return {error: 'not_matched_agent', matched: intent.matched.agent};
  if (String(text).length < 8 || !String(text).includes('ltzzz.com')) return {error: 'deliverable_must_link_product'};
  if (!(sliceUsd > 0) || sliceUsd > intent.remaining) return {error: 'slice_above_remaining', remaining: intent.remaining};
  const hash = await sha((intent.prev_hash || 'genesis') + '|' + text);
  intent.remaining = Number((intent.remaining - sliceUsd).toFixed(6));
  intent.drawn = Number((Number(intent.drawn || 0) + sliceUsd).toFixed(6));
  intent.held = Number((Number(intent.held || 0) + sliceUsd).toFixed(6));
  intent.slices = (intent.slices || []).concat({agent, hash, prev: intent.prev_hash || 'genesis', usd: sliceUsd, settled: false});
  intent.prev_hash = hash; intent.status = 'streaming';
  await put(env, 'wep3:intent:' + intent.id, intent);
  return {hash, remaining: intent.remaining, held: intent.held};
}
async function sealIntent(env, intent, agent, parts) {
  if (!intent.slices?.length) return {error: 'nothing_to_seal'};
  const worker = intent.matched?.agent || intent.slices[0].agent;
  if (!known(agent) || agent === intent.poster || agent === worker) return {error: 'sealer_must_be_third'};
  if (!parts.length || parts.length !== intent.slices.length) return {error: 'parts_required', need: intent.slices.length};
  let prev = 'genesis'; const recomputed = [];
  for (const text of parts) { const hash = await sha(prev + '|' + text); recomputed.push(hash); prev = hash; }
  if (recomputed.join(',') !== intent.slices.map(s => s.hash).join(',')) return {error: 'tape_mismatch', recomputed, expected: intent.slices.map(s => s.hash)};
  const amount = Number(intent.held || 0);
  const shares = await settle(env, amount, worker, agent);
  const refund = Number(intent.remaining || 0);
  if (refund > 0) await credit(env, intent.poster, refund, null);
  const poster = await rep(env, intent.poster);
  poster.held = Number(Math.max(0, Number(poster.held || 0) - intent.max_usd).toFixed(6));
  await saveRep(env, poster);
  intent.status = 'sealed'; intent.remaining = 0; intent.held = 0;
  intent.seal = {agent, recomputed, refund, amount, at: new Date().toISOString()};
  intent.sealed_text = parts;
  await put(env, 'wep3:intent:' + intent.id, intent);
  const receipt = {id: nid('SEAL'), type: 'tape-seal', status: 'cleared', skill: intent.skill, amount_usd: amount, ...shares, poster: intent.poster, worker, attester: agent, intent_id: intent.id, product: intent.product, parent_id: intent.parent_id || null, deliverable_hash: prev, settled_at: new Date().toISOString()};
  await put(env, 'wep3:receipt:' + receipt.id, receipt);
  return {receipt, refund};
}
async function citeReceipt(env, receiptId, citer, fee) {
  const receipt = await get(env, 'wep3:receipt:' + receiptId, null);
  if (!receipt || receipt.status === 'void') return {error: 'receipt_missing'};
  if (!known(citer) || citer === receipt.worker) return {error: 'citer_must_be_downstream'};
  fee = Number(fee || 0.005);
  if (!(fee >= 0.001) || fee > 0.05) return {error: 'cite_fee_band', min: 0.001, max: 0.05};
  const drawn = await draw(env, citer, fee); if (drawn.error) return drawn;
  const workerShare = Number((fee * 0.6).toFixed(6)); const posterShare = Number((fee * 0.2).toFixed(6)); const labShare = Number((fee - workerShare - posterShare).toFixed(6));
  await credit(env, receipt.worker, workerShare, 'earned');
  if (receipt.poster && receipt.poster !== receipt.worker) await credit(env, receipt.poster, posterShare, 'earned'); else await credit(env, 'LTZZZ', posterShare, 'earned');
  const labKeep = Number((labShare * 0.5).toFixed(6)); const labPool = Number((labShare - labKeep).toFixed(6));
  await credit(env, 'LTZZZ', labKeep, 'earned'); await feedPool(env, labPool);
  receipt.yield_usd = Number((Number(receipt.yield_usd || 0) + fee).toFixed(6)); receipt.cites = Number(receipt.cites || 0) + 1;
  receipt.last_cite = {agent: citer, fee, at: new Date().toISOString()};
  await put(env, 'wep3:receipt:' + receipt.id, receipt);
  const cite = {id: nid('CITE'), receipt_id: receipt.id, citer, worker: receipt.worker, poster: receipt.poster, fee, workerShare, posterShare, labShare, skill: receipt.skill, at: new Date().toISOString()};
  await put(env, 'wep3:cite:' + cite.id, cite);
  await journal(env, {type:'cite', from: citer, to: receipt.worker, amount_usd: fee, ref: receipt.id, meta: {workerShare, posterShare, labShare}});
  return {cite, receipt_yield: receipt.yield_usd, cites: receipt.cites};
}
async function writeGate(env, request, actor) {
  if (env.LAB_PIN && pinOk(request, env)) return null;
  const name = known(actor) ? actor : 'anon';
  const hour = new Date().toISOString().slice(0, 13);
  const key = 'wep3:gate:' + name + ':' + hour;
  const row = await get(env, key, {n: 0});
  if (row.n >= 12) return {error: 'actor_hour_cap', actor: name, hour, writes: row.n, cap: 12};
  row.n += 1; await put(env, key, row); return null;
}
async function openInvoice(env, skuId, buyer) {
  const sku = SKUS.find(s => s.id === skuId);
  if (!sku) return {error: 'unknown_sku', status: 404};
  const inv = {id: nid('INV'), sku_id: sku.id, title: sku.title, skill: sku.skill, amount_usd: sku.price_usd, product: sku.product, buyer_email: String((buyer && buyer.email) || '').slice(0, 120) || null, buyer_ref: String((buyer && buyer.ref) || '').slice(0, 80) || null, status: 'open', provider: null, created_at: new Date().toISOString(), pay_url: 'https://ltzzz.com/wep3-pay.html?invoice='};
  inv.pay_url = inv.pay_url + encodeURIComponent(inv.id);
  await put(env, 'wep3:invoice:' + inv.id, inv);
  await journal(env, {type: 'invoice_open', from: inv.buyer_ref || 'external', to: 'LTZZZ', amount ent_usd: inv.amount_usd, ref: inv.id, meta: {sku_id: sku.id}});
  return {ok: true, invoice: inv, sku};
}
