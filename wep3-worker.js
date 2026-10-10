/** LTZZZ WEP3 v1.1 — credit loop, skill-owner hire, SKU pay. */
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
// 2026-10-09 总控修复（P0 安全）：原实现 `!env.LAB_PIN || ...` 属 fail-open——
// LAB_PIN 未配置时恒返回 true，任何匿名请求都能调 /deposit /withdraw /transfer /hire
// 篡改任意 AI 余额（线上 health 实测 pin:false，即处于无鉴权状态）。
// 改为 fail-closed：未配置 PIN 一律拒绝写操作。宁可功能暂不可用，不可资金账本裸奔。
function pinOk(request, env) {
  if(new URL(request.url).pathname==='/hire' && env.WEP3_RUNNER_TOKEN && request.headers.get('x-lab-pin')===env.WEP3_RUNNER_TOKEN)return true;
  if (!env.LAB_PIN) return false;
  const provided = request.headers.get('x-lab-pin');
  if (!provided) return false;
  return provided === env.LAB_PIN;
}
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
  return { ok: true, version: '1.1.0', since: since || null, count: rows.length, pool, agents, credit_sum: Number(creditSum.toFixed(6)), pool_nav: Number((Number(pool.total || 0) + Number(pool.fee_reserve || 0)).toFixed(6)), entries: rows.map(r => ({ id: r.id, type: r.type, from: r.from || null, to: r.to || null, amount_usd: r.amount_usd, ref: r.ref || null, at: r.at, hash: r.hash })) };
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
  await journal(env, {type: 'invoice_open', from: inv.buyer_ref || 'external', to: 'LTZZZ', amount_usd: inv.amount_usd, ref: inv.id, meta: {sku_id: sku.id}});
  return {ok: true, invoice: inv, sku};
}
async function confirmPay(env, invoiceId, provider, proof, secret, envSecret, allowDemo) {
  const inv = await get(env, 'wep3:invoice:' + invoiceId, null);
  if (!inv) return {error: 'invoice_missing', status: 404};
  if (inv.status === 'paid') return {ok: true, status: 'ALREADY_PAID', invoice: inv, hire: inv.hire || null};
  if (inv.status !== 'open') return {error: 'invoice_not_open', status: inv.status, statusCode: 409};
  const prov = String(provider || 'demo');
  if (prov === 'demo') { if (allowDemo === false || allowDemo === '0') return {error: 'demo_pay_disabled', status: 403}; }
  else { if (!envSecret) return {error: 'pay_secret_not_configured', status: 503}; if (secret !== envSecret) return {error: 'bad_pay_secret', status: 401}; if (!proof) return {error: 'payment_proof_required', status: 400}; }
  inv.status = 'paid'; inv.provider = prov; inv.proof = proof ? String(proof).slice(0, 200) : null; inv.paid_at = new Date().toISOString();
  await credit(env, 'LTZZZ', inv.amount_usd, 'earned');
  await journal(env, {type: prov === 'demo' ? 'demo_pay' : 'external_pay', from: inv.buyer_ref || inv.buyer_email || 'external', to: 'LTZZZ', amount_usd: inv.amount_usd, ref: inv.id, meta: {sku_id: inv.sku_id, provider: prov}});
  const skill = SKILLS.find(s => s.id === inv.skill) || SKILLS[0];
  const tape = await tapePrice(env, skill.id);
  const hireBudget = Number(Math.min(inv.amount_usd * 0.4, Math.max(tape, skill.price)).toFixed(6));
  const hired = await hireLoop(env, {agent: 'LTZZZ', skill: skill.id, max_usd: hireBudget, title: 'paid:' + inv.sku_id + ':' + inv.id, deliverable: skill.owner + ' fulfilled ' + inv.title + ' for external buyer | ' + inv.product + ' | invoice ' + inv.id});
  inv.hire = hired.ok ? {intent_id: hired.intent_id, receipt_id: hired.receipt && hired.receipt.id, worker: hired.winner && hired.winner.agent, amount_usd: hired.receipt && hired.receipt.amount_usd} : {error: hired.error || 'hire_failed', detail: hired};
  inv.hire_budget = hireBudget;
  await put(env, 'wep3:invoice:' + inv.id, inv);
  await journal(env, {type: 'external_fulfill', from: 'LTZZZ', to: (hired.winner && hired.winner.agent) || skill.owner, amount_usd: hireBudget, ref: inv.id, meta: {hire_ok: !!hired.ok}});
  return {ok: true, status: 'PAID', invoice: inv, hire: hired};
}
async function treasuryState(env) {
  const t = await get(env, 'wep3:treasury', null) || {reserve: 0, deposited: 0, withdrawn: 0, pending_out: 0, transfers: 0};
  const lab = await rep(env, 'LTZZZ');
  return { ...t, lab_credit: Number(lab.credit || 0), lab_spendable: spendable(lab) };
}
async function doTransfer(env, from, to, amount, memo) {
  if (!known(from) || !known(to) || from === to) return {error: 'bad_parties', status: 400};
  amount = Number(amount);
  if (!(amount >= 0.001) || amount > 5) return {error: 'transfer_band', min: 0.001, max: 5, status: 400};
  const drawn = await draw(env, from, amount); if (drawn.error) return drawn;
  await credit(env, to, amount, null);
  const t = await get(env, 'wep3:treasury', null) || {reserve: 0, deposited: 0, withdrawn: 0, pending_out: 0, transfers: 0};
  t.transfers = Number((Number(t.transfers || 0) + amount).toFixed(6));
  await put(env, 'wep3:treasury', t);
  await journal(env, {type: 'transfer', from, to, amount_usd: amount, ref: memo || (from + '->' + to), meta: {memo: memo || null}});
  return {ok: true, status: 'TRANSFERRED', from, to, amount, from_wallet: await walletView(env, from), to_wallet: await walletView(env, to)};
}
async function doDeposit(env, agent, amount, source) {
  if (!known(agent)) return {error: 'unknown_agent', status: 400};
  amount = Number(amount);
  if (!(amount >= 0.01) || amount > 5) return {error: 'deposit_band', min: 0.01, max: 5, status: 400};
  const lab = await rep(env, 'LTZZZ');
  if (spendable(lab) < amount) return {error: 'treasury_short', lab_spendable: spendable(lab), need: amount, status: 402};
  const drawn = await draw(env, 'LTZZZ', amount); if (drawn.error) return drawn;
  await credit(env, agent, amount, null);
  const t = await get(env, 'wep3:treasury', null) || {reserve: 0, deposited: 0, withdrawn: 0, pending_out: 0, transfers: 0};
  t.deposited = Number((Number(t.deposited || 0) + amount).toFixed(6));
  t.reserve = Number((Number(t.reserve || 0) + amount).toFixed(6));
  await put(env, 'wep3:treasury', t);
  await journal(env, {type: 'deposit', from: 'LTZZZ', to: agent, amount_usd: amount, ref: source || 'treasury', meta: {source: source || 'treasury'}});
  return {ok: true, status: 'DEPOSITED', agent, amount, source: source || 'treasury', wallet: await walletView(env, agent), treasury: await treasuryState(env)};
}
async function doWithdraw(env, agent, amount, dest) {
  if (!known(agent)) return {error: 'unknown_agent', status: 400};
  amount = Number(amount);
  if (!(amount >= 0.01) || amount > 5) return {error: 'withdraw_band', min: 0.01, max: 5, status: 400};
  const drawn = await draw(env, agent, amount); if (drawn.error) return drawn;
  const t = await get(env, 'wep3:treasury', null) || {reserve: 0, deposited: 0, withdrawn: 0, pending_out: 0, transfers: 0};
  t.pending_out = Number((Number(t.pending_out || 0) + amount).toFixed(6));
  t.withdrawn = Number((Number(t.withdrawn || 0) + amount).toFixed(6));
  await put(env, 'wep3:treasury', t);
  const ticket = {id: nid('WD'), agent, amount_usd: amount, dest: String(dest || 'chain:pending').slice(0, 120), status: 'pending_chain', at: new Date().toISOString()};
  await put(env, 'wep3:withdraw:' + ticket.id, ticket);
  await journal(env, {type: 'withdraw', from: agent, to: 'PENDING_CHAIN', amount_usd: amount, ref: ticket.id, meta: {dest: ticket.dest}});
  return {ok: true, status: 'WITHDRAW_PENDING', ticket, wallet: await walletView(env, agent), treasury: await treasuryState(env)};
}
async function payWithCredit(env, invoiceId, payer) {
  const inv = await get(env, 'wep3:invoice:' + invoiceId, null);
  if (!inv) return {error: 'invoice_missing', status: 404};
  if (inv.status === 'paid') return {ok: true, status: 'ALREADY_PAID', invoice: inv, hire: inv.hire || null};
  if (inv.status !== 'open') return {error: 'invoice_not_open', status: inv.status, statusCode: 409};
  payer = payer || 'LTZZZ';
  if (!known(payer)) return {error: 'unknown_payer', status: 400};
  const amount = Number(inv.amount_usd);
  const drawn = await draw(env, payer, amount); if (drawn.error) return drawn;
  await credit(env, 'LTZZZ', amount, 'earned');
  await journal(env, {type: 'credit_pay', from: payer, to: 'LTZZZ', amount_usd: amount, ref: inv.id, meta: {sku_id: inv.sku_id}});
  inv.status = 'paid'; inv.provider = 'credit:' + payer; inv.paid_at = new Date().toISOString(); inv.proof = 'credit-pay';
  const skill = SKILLS.find(s => s.id === inv.skill) || SKILLS[0];
  const tape = await tapePrice(env, skill.id);
  const hireBudget = Number(Math.min(amount * 0.4, Math.max(tape, skill.price)).toFixed(6));
  const hired = await hireLoop(env, {agent: 'LTZZZ', skill: skill.id, max_usd: hireBudget, title: 'credit-paid:' + inv.sku_id + ':' + inv.id, deliverable: skill.owner + ' fulfilled ' + inv.title + ' via credit pay | ' + inv.product + ' | invoice ' + inv.id});
  inv.hire = hired.ok ? {intent_id: hired.intent_id, receipt_id: hired.receipt && hired.receipt.id, worker: hired.winner && hired.winner.agent, amount_usd: hired.receipt && hired.receipt.amount_usd} : {error: hired.error || 'hire_failed', detail: hired};
  inv.hire_budget = hireBudget;
  await put(env, 'wep3:invoice:' + inv.id, inv);
  await journal(env, {type: 'external_fulfill', from: 'LTZZZ', to: (hired.winner && hired.winner.agent) || skill.owner, amount_usd: hireBudget, ref: inv.id, meta: {hire_ok: !!hired.ok, via: 'credit'}});
  return {ok: true, status: 'PAID', invoice: inv, hire: hired, payer};
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
async function walletView(env, agent) {
  if (!known(agent) && agent !== 'LTZZZ') return {error: 'unknown_agent', status: 404};
  const row = await rep(env, agent); const pos = await stakePos(env, agent); const pool = await poolState(env);
  const stake_value = shareValue(pool, pos.shares);
  return { ok: true, agent, credit: row.credit, earned: row.earned || 0, score: row.score, line: lineLimit(row), line_used: row.line_used || 0, spendable: spendable(row), stake: {shares: pos.shares || 0, staked: pos.staked || 0, value: stake_value, debt: pos.debt || 0}, net: Number((spendable(row) + stake_value - Number(pos.debt || 0)).toFixed(6)), pool: {total: pool.total, shares: pool.shares, fee_reserve: pool.fee_reserve, volume: pool.volume} };
}
async function hireLoop(env, body) {
  if (!body.deliverable || !body.evidence_path || !body.audit_report || body.audit_report.accepted !== true || !AGENTS.includes(body.audit_report.auditor) || body.audit_report.auditor === body.agent || !body.worker || body.audit_report.auditor === body.worker) return {ok:false,error:'actual_delivery_and_independent_audit_required',status:422};
  const actualHash=await sha(String(body.deliverable));
  if(body.audit_report.deliverable_sha256!==actualHash) return {ok:false,error:'audit_hash_mismatch',status:422};
  const poster = body.agent || 'Grok';
  const skill = SKILLS.find(s => s.id === body.skill && s.owner !== poster) || SKILLS.find(s => s.owner !== poster) || SKILLS[1];
  const tape = await tapePrice(env, skill.id);
  const max = Number(body.bounty_usd || body.max_usd || Math.max(tape, skill.price));
  const opened = await openIntent(env, poster, skill, max, body.title || skill.title, body.parent_id || null);
  if (opened.error) return {ok: false, ...opened, status: opened.status || 400};
  const intent = opened.intent;
  const poolAgents = AGENTS.filter(a => a !== poster);
  if (!poolAgents.includes(body.worker)) {await release(env,intent,'invalid_worker');return {ok:false,error:'invalid_worker',status:422};}
  const preferred = body.worker;
  const second = poolAgents.find(a => a !== preferred) || poolAgents[0];
  const rivals = [preferred]; // no invented competing AI bids
  const q1 = await bidAtTape(env, intent, rivals[0]);
  const q2 = rivals[1] ? await bidAtTape(env, intent, rivals[1]) : {quote: null};
  const matched = await matchIntent(env, intent);
  if (matched.error) { await release(env, intent, matched.error); return {ok: false, ...matched, quotes: [q1, q2], refunded: true, status: 409}; }
  const text = String(body.deliverable);
  const sliced = await sliceIntent(env, intent, matched.winner.agent, text, matched.winner.ask_usd);
  if (sliced.error) { await release(env, intent, sliced.error); return {ok: false, ...sliced, refunded: true, status: 402}; }
  const sealer = body.audit_report.auditor;
  const sealed = await sealIntent(env, intent, sealer, [text]);
  if (sealed.error) { await release(env, intent, sealed.error); return {ok: false, ...sealed, refunded: true, status: 409}; }
  sealed.receipt.evidence_path=body.evidence_path;sealed.receipt.audit=body.audit_report;sealed.receipt.paid=false;sealed.receipt.settlement_mode='internal_credit';sealed.receipt.tx_hash=null;await put(env,'wep3:receipt:'+sealed.receipt.id,sealed.receipt);
  let causal = null;
  if (body.cite_receipt) causal = await citeReceipt(env, body.cite_receipt, poster, body.cite_usd || 0.005);
  return {ok: true, status: 'HIRED', intent_id: intent.id, skill: skill.id, product: skill.product, quotes: [q1.quote, q2.quote], winner: matched.winner, sealer, deliverable: text, receipt: sealed.receipt, refund: sealed.refund, causal};
}
export default {async fetch(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, {headers: cors});
  const path = clean(new URL(request.url).pathname);
  try {
    if (path === '/' || path === '/health') return json({ok: true, service: 'ltzzz-wep3', version: '1.1.0', thesis: 'Credit loop deposit/transfer/credit-pay/hire/withdraw. Skill owners bid first.', live: 'https://ltzzz-wep3.ltzyz2181.workers.dev', page: 'https://ltzzz.com/wep3-pay.html', split: '70/10/20 on seal', pin: Boolean(env.LAB_PIN), endpoints: ['GET /sku', 'POST /checkout', 'POST /pay/confirm', 'POST /pay/credit', 'POST /deposit', 'POST /withdraw', 'POST /transfer', 'GET /treasury', 'GET /ledger', 'GET /wallet/:agent', 'POST /hire', 'POST /cite', 'POST /stake'], write_cap: '12 mutating posts per actor per hour unless LAB_PIN matches'});
    if (request.method === 'POST' && !pinOk(request, env)) return json({ok: false, error: 'pin_required'}, 401);
    if (request.method === 'POST' && path !== '/checkout' && !path.startsWith('/pay/')) { const bodyPeek = request.headers.get('x-wep3-intent') || ''; const gated = await writeGate(env, request, bodyPeek || 'anon'); if (gated) return json({ok: false, ...gated}, 429); }
    if (path === '/sku' || path === '/skus') return json({ok: true, version: '1.1.0', currency: 'USD', skus: SKUS});
    if (path === '/tape') { const prices = {}; for (const s of SKILLS) { const tape = await tapePrice(env, s.id); prices[s.id] = {catalog: s.price, tape, owner: s.owner, product: s.product}; } return json({ok: true, version: '1.1.0', prices}); }
    if (path === '/pulse') { const book = []; for (const agent of AGENTS.concat(['LTZZZ'])) { const row = await rep(env, agent); book.push({agent, credit: row.credit, earned: row.earned || 0, score: row.score, spendable: spendable(row), jobs: row.jobs || 0}); } return json({ok: true, version: '1.1.0', book}); }
    if (path.startsWith('/gate/')) { const key = path.slice(6); const skill = SKILLS.find(s => s.id === key); const sku = SKUS.find(s => s.id === key || s.skill === key); if (!skill && !sku) return json({ok: false, error: 'unknown_skill'}, 404); const sid = skill ? skill.id : sku.skill; const price = sku ? sku.price_usd : await tapePrice(env, sid); return json({ok: false, status: 402, error: 'payment_required', skill: sid, sku: sku || null, price_usd: price, accepts: [{scheme: 'wep3-sku', description: 'POST /checkout then /pay/credit or /pay/confirm'}, {scheme: 'wep3-hire', description: 'POST /hire'}], pay_to: 'https://ltzzz.com/wep3-pay.html'}, 402); }
    if (path === '/checkout' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const opened = await openInvoice(env, body.sku_id || body.sku, {email: body.email || body.buyer_email, ref: body.ref || body.buyer_ref}); if (opened.error) return json({ok: false, ...opened}, opened.status || 400); return json({ok: true, status: 'OPEN', ...opened}); }
    if (path.startsWith('/invoice/')) { const inv = await get(env, 'wep3:invoice:' + decodeURIComponent(path.slice(9)), null); if (!inv) return json({ok: false, error: 'invoice_missing'}, 404); return json({ok: true, invoice: inv}); }
    if ((path === '/pay/confirm' || path === '/pay/demo') && request.method === 'POST') { const body = await request.json().catch(() => ({})); const out = await confirmPay(env, body.invoice_id, body.provider || 'demo', body.proof || body.tx, body.secret || request.headers.get('x-pay-secret'), env.PAY_WEBHOOK_SECRET, env.ALLOW_DEMO_PAY === '1'); if (out.error) return json({ok: false, ...out}, out.status || out.statusCode || 400); return json(out); }
    if (path === '/pay/webhook' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const out = await confirmPay(env, body.invoice_id || body.id, body.provider || 'webhook', body.proof || body.tx_id, request.headers.get('x-pay-secret') || body.secret, env.PAY_WEBHOOK_SECRET, false); if (out.error) return json({ok: false, ...out}, out.status || out.statusCode || 400); return json(out); }
    if (path === '/pay/credit' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const out = await payWithCredit(env, body.invoice_id, body.payer || 'LTZZZ'); if (out.error) return json({ok: false, ...out}, out.status || out.statusCode || 400); return json(out); }
    if (path === '/treasury') return json({ok: true, version: '1.1.0', treasury: await treasuryState(env)});
    if (path === '/deposit' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const out = await doDeposit(env, body.agent || 'GPT', body.amount, body.source); return json(out, out.ok ? 200 : (out.status || 400)); }
    if (path === '/withdraw' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const out = await doWithdraw(env, body.agent || 'Grok', body.amount, body.dest); return json(out, out.ok ? 200 : (out.status || 400)); }
    if (path === '/transfer' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const out = await doTransfer(env, body.from || 'LTZZZ', body.to, body.amount, body.memo); return json(out, out.ok ? 200 : (out.status || 400)); }
    if (path === '/ledger') { const u = new URL(request.url); return json(await buildLedger(env, u.searchParams.get('since'), u.searchParams.get('limit'))); }
    if (path === '/pool') { const pool = await poolState(env); return json({ok: true, version: '1.1.0', pool}); }
    if (path.startsWith('/wallet/')) { const view = await walletView(env, decodeURIComponent(path.slice(8))); if (view.error) return json(view, view.status || 404); return json(view); }
    if (path === '/stake' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const out = await doStake(env, body.agent || 'Grok', body.amount); return json(out, out.ok ? 200 : (out.status || 400)); }
    if (path === '/cite' && request.method === 'POST') { const body = await request.json().catch(() => ({})); const cited = await citeReceipt(env, body.receipt_id, body.agent || 'Grok', body.fee_usd); if (cited.error) return json({ok: false, ...cited}, cited.status || 409); return json({ok: true, status: 'CITED', ...cited}); }
    if ((path === '/hire' || path === '/mesh' || path === '/cycle') && request.method === 'POST') { const hired = await hireLoop(env, await request.json().catch(() => ({}))); return json(hired, hired.ok ? 200 : (hired.status || 400)); }
    return json({ok: false, error: 'not_found', path}, 404);
  } catch (err) { return json({ok: false, error: 'worker_exception', message: String(err && err.message || err)}, 500); }
}};
