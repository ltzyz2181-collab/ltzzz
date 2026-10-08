/** LTZZZ WEP3 v0.9.1 — hire, causal yield, pool, ledger journal. */
const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Lab-Pin, X-Wep3-Intent', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'};
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
  entry.id = entry.id || nid('LED');
  entry.at = entry.at || new Date().toISOString();
  const book = [];
  for (const a of AGENTS.concat(['LTZZZ'])) {
    const r = await rep(env, a);
    const p = await stakePos(env, a);
    book.push({ agent: a, credit: Number(r.credit || 0), spendable: spendable(r), stake_shares: Number(p.shares || 0), debt: Number(p.debt || 0) });
  }
  const pool = await poolState(env);
  entry.pool_after = { total: pool.total, shares: pool.shares, fee_reserve: pool.fee_reserve };
  entry.balances_after = book;
  entry.hash = await sha([entry.id, entry.type, entry.from || '', entry.to || '', String(entry.amount_usd || 0), entry.at].join('|'));
  await put(env, 'wep3:ledger:' + entry.id, entry);
  return entry;
}
async function buildLedger(env, since, limit) {
  limit = Math.min(100, Math.max(1, Number(limit || 40)));
  let rows = await list(env, 'wep3:ledger:');
  if (since) rows = rows.filter(r => String(r.at || '') >= String(since));
  rows = rows.slice(0, limit);
  const agents = {};
  const pool = await poolState(env);
  for (const a of AGENTS.concat(['LTZZZ'])) {
    const r = await rep(env, a);
    const p = await stakePos(env, a);
    agents[a] = { credit: r.credit, earned: r.earned || 0, spent: r.spent || 0, spendable: spendable(r), line: lineLimit(r), stake_value: shareValue(pool, p.shares), debt: p.debt || 0 };
  }
  const creditSum = Object.values(agents).reduce((s, x) => s + Number(x.credit || 0), 0);
  return { ok: true, version: '0.9.1', since: since || null, count: rows.length, pool, agents, credit_sum: Number(creditSum.toFixed(6)), pool_nav: Number((Number(pool.total || 0) + Number(pool.fee_reserve || 0)).toFixed(6)), entries: rows.map(r => ({ id: r.id, type: r.type, from: r.from || null, to: r.to || null, amount_usd: r.amount_usd, ref: r.ref || null, at: r.at, hash: r.hash })) };
}
async function settle(env, amount, workerName, attesterName) {
  const shares = split(amount);
  const w = await credit(env, workerName, shares.workerShare, 'earned');
  w.jobs = Number(w.jobs || 0) + 1; w.score = Number(w.score || 100) + 2; await saveRep(env, w);
  const a = await credit(env, attesterName, shares.attestShare, 'earned');
  a.stamps = Number(a.stamps || 0) + 1; a.score = Number(a.score || 100) + 1; await saveRep(env, a);
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
  intent.status = 'matched';
  await put(env, 'wep3:intent:' + intent.id, intent);
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
  const workerShare = Number((fee * 0.6).toFixed(6));
  const posterShare = Number((fee * 0.2).toFixed(6));
  const labShare = Number((fee - workerShare - posterShare).toFixed(6));
  await credit(env, receipt.worker, workerShare, 'earned');
  if (receipt.poster && receipt.poster !== receipt.worker) await credit(env, receipt.poster, posterShare, 'earned');
  else await credit(env, 'LTZZZ', posterShare, 'earned');
  const labKeep = Number((labShare * 0.5).toFixed(6)); const labPool = Number((labShare - labKeep).toFixed(6));
  await credit(env, 'LTZZZ', labKeep, 'earned'); await feedPool(env, labPool);
  receipt.yield_usd = Number((Number(receipt.yield_usd || 0) + fee).toFixed(6));
  receipt.cites = Number(receipt.cites || 0) + 1;
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
async function doStake(env, agent, amount) {
  if (!known(agent)) return {error: 'unknown_agent', status: 400};
  amount = Number(amount);
  if (!(amount >= 0.01) || amount > 5) return {error: 'stake_band', min: 0.01, max: 5, status: 400};
  const drawn = await draw(env, agent, amount); if (drawn.error) return drawn;
  const pool = await poolState(env);
  const nav = Number(pool.total || 0) + Number(pool.fee_reserve || 0);
  const mint = pool.shares > 0 && nav > 0 ? Number((amount * pool.shares / nav).toFixed(6)) : amount;
  pool.total = Number((Number(pool.total || 0) + amount).toFixed(6));
  pool.shares = Number((Number(pool.shares || 0) + mint).toFixed(6));
  await savePool(env, pool);
  const pos = await stakePos(env, agent);
  pos.shares = Number((Number(pos.shares || 0) + mint).toFixed(6));
  pos.staked = Number((Number(pos.staked || 0) + amount).toFixed(6));
  await saveStake(env, pos);
  await journal(env, {type:'stake', from: agent, to: 'POOL', amount_usd: amount, ref: agent, meta: {shares: mint}});
  return {ok: true, status: 'STAKED', agent, amount, shares: mint, position: pos, pool};
}
async function doUnstake(env, agent, amount) {
  if (!known(agent)) return {error: 'unknown_agent', status: 400};
  amount = Number(amount); if (!(amount > 0)) return {error: 'bad_amount', status: 400};
  const pool = await poolState(env); const pos = await stakePos(env, agent);
  const value = shareValue(pool, pos.shares);
  if (value < amount) return {error: 'unstake_above_position', value, status: 409};
  if (Number(pos.debt || 0) > 0 && value - amount < Number(pos.debt || 0) * 1.1) return {error: 'debt_collateral_short', debt: pos.debt, value, status: 409};
  const burn = value > 0 ? Number((pos.shares * amount / value).toFixed(6)) : 0;
  const fromFees = Math.min(Number(pool.fee_reserve || 0), amount);
  const fromTotal = Number((amount - fromFees).toFixed(6));
  pool.fee_reserve = Number((Number(pool.fee_reserve || 0) - fromFees).toFixed(6));
  pool.total = Number(Math.max(0, Number(pool.total || 0) - fromTotal).toFixed(6));
  pool.shares = Number(Math.max(0, Number(pool.shares || 0) - burn).toFixed(6));
  await savePool(env, pool);
  pos.shares = Number(Math.max(0, Number(pos.shares || 0) - burn).toFixed(6));
  pos.staked = Number(Math.max(0, Number(pos.staked || 0) - amount).toFixed(6));
  await saveStake(env, pos); await credit(env, agent, amount, null);
  await journal(env, {type:'unstake', from: 'POOL', to: agent, amount_usd: amount, ref: agent, meta: {burn}});
  return {ok: true, status: 'UNSTAKED', agent, amount, burn, position: pos, pool};
}
async function doBorrow(env, agent, amount) {
  if (!known(agent)) return {error: 'unknown_agent', status: 400};
  amount = Number(amount);
  if (!(amount >= 0.01) || amount > 1) return {error: 'borrow_band', min: 0.01, max: 1, status: 400};
  const row = await rep(env, agent); const pos = await stakePos(env, agent); const pool = await poolState(env);
  const collateral = shareValue(pool, pos.shares);
  const maxDebt = Number(Math.min(1, lineLimit(row) + collateral * 0.5).toFixed(6));
  if (Number(pos.debt || 0) + amount > maxDebt) return {error: 'borrow_cap', maxDebt, debt: pos.debt || 0, status: 409};
  if (Number(pool.total || 0) < amount) return {error: 'pool_dry', pool: pool.total, status: 409};
  pool.total = Number((Number(pool.total || 0) - amount).toFixed(6)); await savePool(env, pool);
  pos.debt = Number((Number(pos.debt || 0) + amount).toFixed(6)); await saveStake(env, pos);
  await credit(env, agent, amount, null);
  await journal(env, {type:'borrow', from: 'POOL', to: agent, amount_usd: amount, ref: agent, meta: {debt: pos.debt}});
  return {ok: true, status: 'BORROWED', agent, amount, debt: pos.debt, maxDebt, pool};
}
async function doRepay(env, agent, amount) {
  if (!known(agent)) return {error: 'unknown_agent', status: 400};
  const pos = await stakePos(env, agent);
  amount = Number(amount || pos.debt || 0);
  if (!(amount > 0) || amount > Number(pos.debt || 0)) return {error: 'repay_band', debt: pos.debt || 0, status: 400};
  const drawn = await draw(env, agent, amount); if (drawn.error) return drawn;
  const interest = Number((amount * 0.02).toFixed(6));
  const principal = Number((amount - Math.min(interest, amount * 0.5)).toFixed(6));
  const fee = Number((amount - principal).toFixed(6));
  const pool = await poolState(env);
  pool.total = Number((Number(pool.total || 0) + principal).toFixed(6));
  pool.fee_reserve = Number((Number(pool.fee_reserve || 0) + fee).toFixed(6));
  await savePool(env, pool);
  pos.debt = Number((Number(pos.debt || 0) - amount).toFixed(6)); await saveStake(env, pos);
  await journal(env, {type:'repay', from: agent, to: 'POOL', amount_usd: amount, ref: agent, meta: {fee, debt: pos.debt}});
  return {ok: true, status: 'REPAID', agent, amount, fee, debt: pos.debt, pool};
}
async function walletView(env, agent) {
  if (!known(agent) && agent !== 'LTZZZ') return {error: 'unknown_agent', status: 404};
  const row = await rep(env, agent); const pos = await stakePos(env, agent); const pool = await poolState(env);
  const stake_value = shareValue(pool, pos.shares);
  return { ok: true, agent, credit: row.credit, earned: row.earned || 0, score: row.score, line: lineLimit(row), line_used: row.line_used || 0, spendable: spendable(row), stake: {shares: pos.shares || 0, staked: pos.staked || 0, value: stake_value, debt: pos.debt || 0}, net: Number((spendable(row) + stake_value - Number(pos.debt || 0)).toFixed(6)), pool: {total: pool.total, shares: pool.shares, fee_reserve: pool.fee_reserve, volume: pool.volume} };
}
async function hireLoop(env, body) {
  const poster = body.agent || 'Grok';
  const skill = SKILLS.find(s => s.id === body.skill && s.owner !== poster) || SKILLS.find(s => s.owner !== poster) || SKILLS[1];
  const tape = await tapePrice(env, skill.id);
  const max = Number(body.bounty_usd || body.max_usd || Math.max(tape, skill.price));
  const opened = await openIntent(env, poster, skill, max, body.title || skill.title, body.parent_id || null);
  if (opened.error) return {ok: false, ...opened, status: opened.status || 400};
  const intent = opened.intent;
  const rivals = AGENTS.filter(a => a !== poster).slice(0, 2);
  const q1 = await bidAtTape(env, intent, rivals[0]);
  const q2 = await bidAtTape(env, intent, rivals[1]);
  const matched = await matchIntent(env, intent);
  if (matched.error) { await release(env, intent, matched.error); return {ok: false, ...matched, quotes: [q1, q2], refunded: true, status: 409}; }
  const text = String(body.deliverable || workFor(skill.id, body.title || skill.title));
  const sliced = await sliceIntent(env, intent, matched.winner.agent, text, matched.winner.ask_usd);
  if (sliced.error) { await release(env, intent, sliced.error); return {ok: false, ...sliced, refunded: true, status: 402}; }
  const sealer = other([poster, matched.winner.agent]);
  const sealed = await sealIntent(env, intent, sealer, [text]);
  if (sealed.error) { await release(env, intent, sealed.error); return {ok: false, ...sealed, refunded: true, status: 409}; }
  let causal = null;
  if (body.cite_receipt) causal = await citeReceipt(env, body.cite_receipt, poster, body.cite_usd || 0.005);
  return {ok: true, status: 'HIRED', intent_id: intent.id, skill: skill.id, product: skill.product, quotes: [q1.quote, q2.quote], winner: matched.winner, sealer, deliverable: text, receipt: sealed.receipt, refund: sealed.refund, causal};
}
export default {async fetch(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, {headers: cors});
  const path = clean(new URL(request.url).pathname);
  try {
    if (path === '/' || path === '/health') return json({ok: true, service: 'ltzzz-wep3', version: '0.9.1', thesis: 'Agents hire, cite, stake into a shared pool, and borrow against reputation. Ledger journals every money move.', live: 'https://ltzzz-wep3.ltzyz2181.workers.dev', page: 'https://ltzzz.com/wep3.html', split: '70/10/20 on seal', pin: Boolean(env.LAB_PIN), endpoints: ['GET /tape', 'GET /pulse', 'GET /market', 'GET /board', 'GET /causal', 'GET /pool', 'GET /wallet/:agent', 'GET /ledger', 'POST /stake', 'POST /unstake', 'POST /borrow', 'POST /repay', 'POST /intent', 'POST /quote', 'POST /match', 'POST /slice', 'POST /seal', 'POST /hire', 'POST /cite', 'POST /mandate', 'POST /option', 'POST /exercise', 'POST /swarm', 'POST /void', 'GET /replay/:id', 'GET /gate/:skill'], write_cap: '12 mutating posts per actor per hour unless LAB_PIN matches'});
    if (request.method === 'POST' && !pinOk(request, env)) return json({ok: false, error: 'pin_required'}, 401);
    if (request.method === 'POST') { const bodyPeek = request.headers.get('x-wep3-intent') || ''; const gated = await writeGate(env, request, bodyPeek || 'anon'); if (gated) return json({ok: false, ...gated}, 429); }
    if (path === '/skills') return json({ok: true, skills: SKILLS});
    if (path === '/tape') { const prices = {}; for (const s of SKILLS) { const tape = await tapePrice(env, s.id); prices[s.id] = {catalog: s.price, tape, owner: s.owner, cap: Number((tape * 1.5).toFixed(6)), product: s.product}; } return json({ok: true, version: '0.9.1', prices}); }
    if (path === '/pulse') { const book = []; for (const agent of AGENTS.concat(['LTZZZ'])) { const row = await rep(env, agent); book.push({agent, credit: row.credit, earned: row.earned || 0, score: row.score, line: lineLimit(row), line_used: row.line_used || 0, spendable: spendable(row), jobs: row.jobs || 0}); } const options = (await list(env, 'wep3:option:')).filter(o => o.status === 'open').slice(0, 12); return json({ok: true, version: '0.9.1', book, options, open: (await list(env, 'wep3:intent:')).filter(i => i.status !== 'sealed' && i.status !== 'void').length}); }
    if (path === '/market' || path === '/board') { const intents = (await list(env, 'wep3:intent:')).filter(i => i.status !== 'sealed' && i.status !== 'void').slice(0, 20); const board = {ok: true, open: intents.map(i => ({id: i.id, poster: i.poster, skill: i.skill, remaining: i.remaining, held: i.held, status: i.status, quotes: i.quotes || [], slices: (i.slices || []).length, matched: i.matched || null, parent_id: i.parent_id || null, product: i.product}))}; if (path === '/board') board.receipts = (await list(env, 'wep3:receipt:')).slice(0, 8); return json(board); }
    if (path.startsWith('/replay/')) { const intent = await get(env, 'wep3:intent:' + decodeURIComponent(path.slice(8)), null); if (!intent) return json({ok: false, error: 'intent_missing'}, 404); return json({ok: true, intent_id: intent.id, status: intent.status, product: intent.product, parent_id: intent.parent_id || null, slices: (intent.slices || []).map((s, n) => ({hash: s.hash, prev: s.prev, usd: s.usd, agent: s.agent, text: intent.status === 'sealed' ? (intent.sealed_text || [])[n] || null : null})), seal: intent.seal || null}); }
    if (path.startsWith('/gate/')) { const skill = SKILLS.find(s => s.id === path.slice(6)); if (!skill) return json({ok: false, error: 'unknown_skill'}, 404); const price = await tapePrice(env, skill.id); return json({ok: false, status: 402, error: 'payment_required', skill: skill.id, owner: skill.owner, price_usd: price, product: skill.product, accepts: [{scheme: 'wep3-hire', network: 'ltzzz-credit', asset: 'LTZ', maxAmountRequired: String(price), resource: 'https://ltzzz-wep3.ltzyz2181.workers.dev/gate/' + skill.id, description: 'POST /hire'}], pay_to: 'https://ltzzz.com/wep3.html'}, 402); }
    if (path === '/ledger') { const u = new URL(request.url); return json(await buildLedger(env, u.searchParams.get('since'), u.searchParams.get('limit'))); }
    if (path === '/pool') { const pool = await poolState(env); const book = []; for (const agent of AGENTS) { const pos = await stakePos(env, agent); if (Number(pos.shares || 0) > 0 || Number(pos.debt || 0) > 0) book.push({agent, shares: pos.shares, staked: pos.staked, value: shareValue(pool, pos.shares), debt: pos.debt || 0}); } return json({ok: true, version: '0.9.1', pool, positions: book}); }
    if (path.startsWith('/wallet/')) { const agent = decodeURIComponent(path.slice(8)); const view = await walletView(env, agent); if (view.error) return json(view, view.status || 404); return json(view); }
    if (path === '/wallet' && request.method === 'GET') { const u = new URL(request.url); const view = await walletView(env, u.searchParams.get('agent') || 'Grok'); if (view.error) return json(view, view.status || 404); return json(view); }
    if (path === '/stake' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const out = await doStake(env, body.agent || request.headers.get('x-wep3-intent') || 'Grok', body.amount); return json(out, out.ok ? 200 : (out.status || 400)); }
    if (path === '/unstake' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const out = await doUnstake(env, body.agent || request.headers.get('x-wep3-intent') || 'Grok', body.amount); return json(out, out.ok ? 200 : (out.status || 400)); }
    if (path === '/borrow' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const out = await doBorrow(env, body.agent || request.headers.get('x-wep3-intent') || 'Grok', body.amount); return json(out, out.ok ? 200 : (out.status || 400)); }
    if (path === '/repay' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const out = await doRepay(env, body.agent || request.headers.get('x-wep3-intent') || 'Grok', body.amount); return json(out, out.ok ? 200 : (out.status || 400)); }
    if (path === '/cite' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const cited = await citeReceipt(env, body.receipt_id, body.agent || request.headers.get('x-wep3-intent') || 'Grok', body.fee_usd); if (cited.error) return json({ok: false, ...cited}, cited.status || 409); return json({ok: true, status: 'CITED', ...cited}); }
    if (path === '/causal') { const cites = (await list(env, 'wep3:cite:')).slice(0, 12); const receipts = (await list(env, 'wep3:receipt:')).filter(r => Number(r.yield_usd || 0) > 0 || Number(r.cites || 0) > 0).slice(0, 12).map(r => ({id: r.id, skill: r.skill, worker: r.worker, poster: r.poster, amount_usd: r.amount_usd, yield_usd: r.yield_usd || 0, cites: r.cites || 0})); return json({ok: true, version: '0.9.1', split: 'cite 60 worker / 20 poster / 20 lab', receipts, cites}); }
    if (path === '/intent' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const poster = body.agent || 'Grok'; const skill = SKILLS.find(s => s.id === body.skill) || SKILLS[0]; const opened = await openIntent(env, poster, skill, Number(body.max_usd || skill.price), body.title || skill.title, body.parent_id || null); if (opened.error) return json({ok: false, ...opened}, opened.status || 400); return json({ok: true, ...opened, tape: await tapePrice(env, skill.id)}); }
    if (path === '/quote' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const intent = await get(env, 'wep3:intent:' + body.intent_id, null); if (!intent || intent.status === 'sealed' || intent.status === 'void') return json({ok: false, error: 'intent_not_open'}, 404); const agent = body.agent || SKILLS.find(s => s.id === intent.skill)?.owner || 'Doubao'; const quoted = await addQuote(env, intent, agent, Number(body.ask_usd || await tapePrice(env, intent.skill))); if (quoted.error) return json({ok: false, ...quoted}, 409); return json({ok: true, ...quoted}); }
    if (path === '/match' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const intent = await get(env, 'wep3:intent:' + body.intent_id, null); if (!intent || intent.status === 'sealed' || intent.status === 'void') return json({ok: false, error: 'intent_closed'}, 404); const matched = await matchIntent(env, intent); if (matched.error) return json({ok: false, ...matched}, 409); return json({ok: true, status: 'MATCHED', ...matched}); }
    if (path === '/slice' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const intent = await get(env, 'wep3:intent:' + body.intent_id, null); if (!intent || intent.status === 'sealed' || intent.status === 'void') return json({ok: false, error: 'intent_closed'}, 404); const agent = body.agent || (intent.matched && intent.matched.agent) || 'Doubao'; const quote = (intent.quotes || []).find(q => q.agent === agent); const sliceUsd = Number(body.slice_usd || (quote ? quote.ask_usd : (await tapePrice(env, intent.skill)))); const text = String(body.deliverable || workFor(intent.skill, intent.title)); const sliced = await sliceIntent(env, intent, agent, text, sliceUsd); if (sliced.error) return json({ok: false, ...sliced}, 409); return json({ok: true, status: 'STREAMING', ...sliced}); }
    if (path === '/seal' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const intent = await get(env, 'wep3:intent:' + body.intent_id, null); if (!intent || intent.status === 'sealed' || intent.status === 'void') return json({ok: false, error: 'intent_closed'}, 404); const agent = body.agent || other([intent.poster, intent.matched && intent.matched.agent].filter(Boolean)); const parts = body.parts || body.deliverables || []; const sealed = await sealIntent(env, intent, agent, parts); if (sealed.error) return json({ok: false, ...sealed}, 409); return json({ok: true, status: 'SEALED', ...sealed}); }
    if (path === '/void' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const intent = await get(env, 'wep3:intent:' + body.intent_id, null); if (!intent) return json({ok: false, error: 'intent_missing'}, 404); await release(env, intent, body.reason || 'void'); return json({ok: true, status: 'VOID', intent_id: intent.id}); }
    if (path === '/mandate' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const parent = await get(env, 'wep3:intent:' + body.parent_id, null); if (!parent || parent.status === 'sealed' || parent.status === 'void') return json({ok: false, error: 'parent_closed'}, 404); const childMax = Number(body.max_usd || Math.min(parent.remaining, 0.05)); if (childMax > parent.remaining) return json({ok: false, error: 'child_above_parent'}, 409); parent.remaining = Number((parent.remaining - childMax).toFixed(6)); const skill = SKILLS.find(s => s.id === (body.skill || parent.skill)) || SKILLS[0]; const child = {id: nid('INT'), poster: body.agent || parent.poster, skill: skill.id, title: String(body.title || ('mandate ' + parent.id)).slice(0, 160), product: skill.product, max_usd: childMax, remaining: childMax, drawn: 0, held: 0, status: 'open', quotes: [], slices: [], prev_hash: 'genesis', matched: null, parent_id: parent.id, children: [], created_at: new Date().toISOString()}; parent.children = (parent.children || []).concat(child.id); await put(env, 'wep3:intent:' + parent.id, parent); await put(env, 'wep3:intent:' + child.id, child); return json({ok: true, status: 'MANDATE', parent_id: parent.id, child}); }
    if (path === '/option' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const seller = body.agent || 'Doubao'; const skill = SKILLS.find(s => s.id === body.skill) || SKILLS[0]; const option = {id: nid('OPT'), seller, skill: skill.id, strike_usd: Number(body.strike_usd || skill.price), premium_usd: Number(body.premium_usd || Number((skill.price * 0.1).toFixed(6))), slots: Number(body.slots || 1), status: 'open', created_at: new Date().toISOString()}; await put(env, 'wep3:option:' + option.id, option); return json({ok: true, status: 'LISTED', option}); }
    if (path === '/exercise' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const option = await get(env, 'wep3:option:' + body.option_id, null); if (!option || option.status !== 'open') return json({ok: false, error: 'option_closed'}, 404); const buyer = body.agent || 'Grok'; if (buyer === option.seller) return json({ok: false, error: 'seller_cannot_exercise'}, 409); const premium = await draw(env, buyer, option.premium_usd); if (premium.error) return json({ok: false, ...premium}, 402); await credit(env, option.seller, option.premium_usd, 'earned'); option.slots -= 1; if (option.slots < 1) option.status = 'filled'; option.last_buyer = buyer; await put(env, 'wep3:option:' + option.id, option); const hired = await hireLoop(env, {agent: buyer, skill: option.skill, max_usd: option.strike_usd, title: body.title || ('option ' + option.skill), deliverable: body.deliverable}); if (!hired.ok) return json({ok: false, premium_paid: option.premium_usd, option_id: option.id, hire: hired}, hired.status || 409); return json({ok: true, status: 'EXERCISED', option_id: option.id, premium_usd: option.premium_usd, hire: hired}); }
    if (path === '/swarm' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const open = (await list(env, 'wep3:intent:')).filter(i => i.status === 'open' || i.status === 'quoted').slice(0, 5); const cleared = []; for (const intent of open) { const rivals = AGENTS.filter(a => a !== intent.poster).slice(0, 2); await bidAtTape(env, intent, rivals[0]); await bidAtTape(env, intent, rivals[1]); const matched = await matchIntent(env, intent); if (matched.error) { cleared.push({id: intent.id, error: matched.error}); continue; } const text = String(body.deliverable || workFor(intent.skill, intent.title)); const sliced = await sliceIntent(env, intent, matched.winner.agent, text, matched.winner.ask_usd); if (sliced.error) { cleared.push({id: intent.id, error: sliced.error}); continue; } const sealed = await sealIntent(env, intent, other([intent.poster, matched.winner.agent]), [text]); cleared.push({id: intent.id, ok: !sealed.error, winner: matched.winner.agent, error: sealed.error || null, receipt: sealed.receipt || null}); } return json({ok: true, status: 'SWARM', cleared}); }
    if ((path === '/hire' || path === '/mesh' || path === '/cycle') && request.method === 'POST') { const hired = await hireLoop(env, await request.json().catch(() => ({}))); return json(hired, hired.ok ? 200 : (hired.status || 400)); }
    if (path === '/clearing') { const reputation = []; for (const agent of AGENTS.concat(['LTZZZ'])) { const row = await rep(env, agent); row.line = lineLimit(row); row.spendable = spendable(row); reputation.push(row); } return json({ok: true, version: '0.9.1', reputation, receipts: await list(env, 'wep3:receipt:')}); }
    return json({ok: false, error: 'not_found', path}, 404);
  } catch (err) { return json({ok: false, error: 'worker_exception', message: String(err && err.message || err)}, 500); }
}};
