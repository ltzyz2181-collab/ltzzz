import {auditProof} from './wep3-audit-proof.js';
import seatRegistry from './identity/seat-registry.json' with {type:'json'};
import {marketRoute,Market} from './wep3-market.js';
import {spawnChild, spawnTree} from "./wep3-swarm.js";
export {Market};
// Cloudflare renamed_classes preserves the existing namespace and stored book.
export class MarketRuntimeV2 extends Market {}
export class MarketRuntimeV3 extends Market {}
/** LTZZZ WEP3 v1.1 — credit loop, skill-owner hire, SKU pay. */
const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Lab-Pin, X-Wep3-Intent, X-Pay-Secret', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'};
export const AGENTS = ['Grok', 'Doubao', 'DeepSeek', 'Qianwen', 'Kimi', 'GPT', 'Microsoft', 'Claude', 'Meya'];
// Keep legacy names for historical balance readback; only active seats may receive new work.
const SEAT_IDS={GPT:'gpt',Doubao:'doubao',DeepSeek:'deepseek',Grok:'grok',Claude:'claude',Microsoft:'microsoft',Kimi:'kimi',Qianwen:'qianwen'};
const ACTIVE_AGENTS=AGENTS.filter(name=>!SEAT_IDS[name]||seatRegistry.seats[SEAT_IDS[name]].work_status!=='temporarily_removed');
const AGENT_ROLES = {
  Grok:     { region: 'global', role: 'signal / research / payment insight', skills: ['signal'] },
  Doubao:   { region: 'cn',     role: 'copy / video script / contract-test', skills: ['copy', 'contract-test'] },
  DeepSeek: { region: 'cn',     role: 'market scan / strategy', skills: ['scan'] },
  Qianwen:  { region: 'cn',     role: 'product close / sell', skills: ['sell'] },
  Kimi:     { region: 'cn',     role: 'causal stamp / long-context', skills: ['cause'] },
  GPT:      { region: 'global', role: 'audit / hire plan / route', skills: ['audit', 'route'] },
  Claude:   { region: 'global', role: 'deep audit / long reasoning', skills: ['audit'] },
  Meya:     { region: 'cn',     role: 'domestic ops / 工单接力', skills: [] },
  Microsoft:{ region: 'global', role: 'fallback / tooling', skills: [] },
  LTZZZ:    { region: 'lab',    role: 'treasury / lab share', skills: [] }
};
for(const [name,id] of Object.entries(SEAT_IDS))Object.assign(AGENT_ROLES[name],{role:seatRegistry.seats[id].role,work_status:seatRegistry.seats[id].work_status,role_source:'identity/seat-registry.json',wallet_source:'wallet/addresses.md'});
export const SKILLS = [
  {id: 'signal', owner: 'Grok', title: 'payment signal', price: 0.02, product: 'https://ltzzz.com/products.html'},
  {id: 'copy', owner: 'Doubao', title: 'product copy', price: 0.03, product: 'https://ltzzz.com/products.html'},
  {id: 'scan', owner: 'DeepSeek', title: 'market scan', price: 0.04, product: 'https://ltzzz.com/products.html'},
  {id: 'audit', owner: 'GPT', title: 'receipt audit', price: 0.015, product: 'https://ltzzz.com/products.html'},
  {id: 'route', owner: 'GPT', title: 'hire plan', price: 0.025, product: 'https://ltzzz.com/products.html'},
  {id: 'cause', owner: 'Kimi', title: 'causal stamp', price: 0.01, product: 'https://ltzzz.com/products.html'},
  {id: 'sell', owner: 'Qianwen', title: 'product close', price: 0.05, product: 'https://ltzzz.com/products.html'},
  {id: 'contract-test', owner: 'Doubao', title: 'provided-spec HTTP contract check', price: 0.03, product: 'https://ltzzz.com/products.html'}
];
const SKUS = [
  {id: 'report-strategy', title: '战略报告', price_usd: 5, skill: 'scan', owner: 'DeepSeek', product: 'https://ltzzz.com/products.html', blurb: '市场与竞争结构一页纸'},
  {id: 'script-video', title: '视频脚本', price_usd: 3, skill: 'copy', owner: 'Doubao', product: 'https://ltzzz.com/products.html', blurb: '60秒产品解说脚本'},
  {id: 'report-research', title: '研究报告', price_usd: 4, skill: 'signal', owner: 'Grok', product: 'https://ltzzz.com/products.html', blurb: '支付信号与转化要点'},
  {id: 'report-trend', title: '趋势报告', price_usd: 4, skill: 'route', owner: 'GPT', product: 'https://ltzzz.com/products.html', blurb: '下一步雇工路线'},
  {id: 'audit-quality', title: '质量审核', price_usd: 2, skill: 'audit', owner: 'GPT', product: 'https://ltzzz.com/products.html', blurb: '交付物与回执抽检'}
];
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'content-type': 'application/json; charset=utf-8', ...cors}});
const nid = p => p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
const known = name => AGENTS.includes(name) || name === 'LTZZZ';
const kv = env => env.PAY_KV;
async function get(env, key, fallback) { const raw = kv(env) && await kv(env).get(key); if (!raw) return fallback; try { return JSON.parse(raw); } catch { throw new Error('invalid_ledger_record'); } }
async function put(env, key, value) { if (!kv(env)) throw new Error('ledger_not_configured'); await kv(env).put(key, JSON.stringify(value)); }
async function list(env, prefix, lim) {
  if (!kv(env)) return [];
  const items = []; let cursor;
  do {
    const page = await kv(env).list({prefix, limit: 1000, cursor});
    for (const k of page.keys || []) { const row = await get(env, k.name, null); if (row) items.push(row); }
    cursor = page.list_complete === false ? page.cursor : undefined;
  } while (cursor);
  return items.sort((a, b) => String(b.at || b.created_at || b.settled_at || '').localeCompare(String(a.at || a.created_at || a.settled_at || ''))).slice(0, lim || 80);
}
async function sha(text) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
function pinOk(request, env) {
  if(new URL(request.url).pathname==='/hire' && env.WEP3_RUNNER_TOKEN && request.headers.get('x-lab-pin')===env.WEP3_RUNNER_TOKEN)return true;
  if (!env.LAB_PIN) return false;
  const provided = request.headers.get('x-lab-pin');
  if (!provided) return false;
  return provided === env.LAB_PIN;
}
async function rep(env, agent) { return await get(env, 'wep3:rep:' + agent, null) || {agent, score: 100, earned: 0, spent: 0, credit: 1, jobs: 0, stamps: 0, held: 0, line_used: 0}; }
async function saveRep(env, row) { row.updated_at = new Date().toISOString(); await put(env, 'wep3:rep:' + row.agent, row); return row; }
function other(notThese) { const found=ACTIVE_AGENTS.find(a=>!notThese.includes(a));if(!found)throw Error('no_active_independent_agent');return found; }
function split(amount) { const workerShare = Number((amount * 0.7).toFixed(6)); const attestShare = Number((amount * 0.1).toFixed(6)); return {workerShare, attestShare, labShare: Number((amount - workerShare - attestShare).toFixed(6))}; }
function lineLimit(row) { return Number(Math.min(0.5, Number(row.earned || 0) * 0.5 + Math.max(0, Number(row.score || 100) - 100) * 0.01).toFixed(6)); }
function spendable(row) { return Number((Number(row.credit || 0) + Math.max(0, lineLimit(row) - Number(row.line_used || 0))).toFixed(6)); }
async function tapePrice(env, skillId) { const skill = SKILLS.find(s => s.id === skillId) || SKILLS[0]; const hits = (await list(env, 'wep3:receipt:')).filter(r => r.skill === skillId && r.status !== 'void').map(r => Number(r.amount_usd || 0)).filter(n => n > 0).slice(0, 7).sort((a, b) => a - b); return hits.length ? Number(hits[Math.floor(hits.length / 2)].toFixed(6)) : skill.price; }
async function credit(env, agent, amount, field) { if (!known(agent)) throw new Error('unknown_agent'); const row = await rep(env, agent); row.credit = Number((Number(row.credit || 0) + amount).toFixed(6)); if (Number(row.line_used || 0) > 0 && row.credit > 0) { const payback = Math.min(row.credit, row.line_used); row.credit = Number((row.credit - payback).toFixed(6)); row.line_used = Number((row.line_used - payback).toFixed(6)); } if (field) row[field] = Number((Number(row[field] || 0) + amount).toFixed(6)); await saveRep(env, row); return row; }
async function draw(env, agent, max) { const wallet = await rep(env, agent); if (spendable(wallet) < max) return {error: 'credit_short', credit: wallet.credit, line: lineLimit(wallet), line_used: wallet.line_used || 0, spendable: spendable(wallet), need: max, status: 402}; const fromCash = Math.min(Number(wallet.credit || 0), max); const fromLine = Number((max - fromCash).toFixed(6)); wallet.credit = Number((Number(wallet.credit || 0) - fromCash).toFixed(6)); wallet.line_used = Number((Number(wallet.line_used || 0) + fromLine).toFixed(6)); wallet.spent = Number((Number(wallet.spent || 0) + max).toFixed(6)); wallet.held = Number((Number(wallet.held || 0) + max).toFixed(6)); await saveRep(env, wallet); return {wallet, fromLine}; }
async function clearHold(env, agent, amount) {
  const row = await rep(env, agent);
  row.held = Number(Math.max(0, Number(row.held || 0) - amount).toFixed(6));
  await saveRep(env, row);
}
async function poolState(env) { return await get(env, 'wep3:pool', null) || {total: 0, shares: 0, fee_reserve: 0, volume: 0, updated_at: null}; }
async function savePool(env, pool) { pool.updated_at = new Date().toISOString(); await put(env, 'wep3:pool', pool); return pool; }
async function stakePos(env, agent) { return await get(env, 'wep3:stake:' + agent, null) || {agent, shares: 0, staked: 0, debt: 0, harvested: 0}; }
async function saveStake(env, row) { row.updated_at = new Date().toISOString(); await put(env, 'wep3:stake:' + row.agent, row); return row; }
function shareValue(pool, shares) { if (!pool.shares || pool.shares <= 0) return 0; return Number(((Number(pool.total || 0) + Number(pool.fee_reserve || 0)) * shares / pool.shares).toFixed(6)); }
async function feedPool(env, amount) { if (!(amount > 0)) return; const pool = await poolState(env); pool.fee_reserve = Number((Number(pool.fee_reserve || 0) + amount).toFixed(6)); pool.volume = Number((Number(pool.volume || 0) + amount).toFixed(6)); await savePool(env, pool); }
async function journal(env, entry) {
  entry.settlement_mode = 'internal_credit'; entry.paid = false; entry.tx_hash = null;
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
  let rows = await list(env, 'wep3:ledger:', Number.MAX_SAFE_INTEGER);
  if (since) rows = rows.filter(r => String(r.at || '') >= String(since));
  rows = rows.slice(0, limit);
  const agents = {}; const pool = await poolState(env);
  for (const a of AGENTS.concat(['LTZZZ'])) { const r = await rep(env, a); const p = await stakePos(env, a); agents[a] = { credit: r.credit, earned: r.earned || 0, spent: r.spent || 0, spendable: spendable(r), line: lineLimit(r), stake_value: shareValue(pool, p.shares), debt: p.debt || 0 }; }
  const creditSum = Object.values(agents).reduce((s, x) => s + Number(x.credit || 0), 0);
  return { ok: true, version: '1.1.1', settlement_mode: 'internal_credit', paid: false, tx_hash: null, since: since || null, count: rows.length, pool, agents, credit_sum: Number(creditSum.toFixed(6)), pool_nav: Number((Number(pool.total || 0) + Number(pool.fee_reserve || 0)).toFixed(6)), entries: rows.map(r => ({ id: r.id, type: r.type, from: r.from || null, to: r.to || null, amount_usd: r.amount_usd, settlement_mode: r.settlement_mode || 'internal_credit', paid: false, tx_hash: null, ref: r.ref || null, at: r.at, hash: r.hash })) };
}
async function settle(env, amount, workerName, attesterName) {
  const shares = split(amount);
  const w = await credit(env, workerName, shares.workerShare, 'earned'); w.jobs = Number(w.jobs || 0) + 1; w.score = Number(w.score || 100) + 2; await saveRep(env, w);
  const a = await credit(env, attesterName, shares.attestShare, 'earned'); a.stamps = Number(a.stamps || 0) + 1; a.score = Number(a.score || 100) + 1; await saveRep(env, a);
  const keep = Number((shares.labShare * 0.5).toFixed(6)); const toPool = Number((shares.labShare - keep).toFixed(6));
  await credit(env, 'LTZZZ', keep, 'earned'); await feedPool(env, toPool);
  return shares;
}
function clean(pathname) { let path = pathname || '/'; while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1); return path || '/'; }
async function openIntent(env, poster, skill, max, title, parentId) {
  if (!known(poster)) return {error: 'unknown_agent', status: 400};
  if(!ACTIVE_AGENTS.includes(poster))return {error:'temporarily_removed_agent',status:403};
  if (!(max > 0) || max > Number(env.SINGLE_CAP || 5)) return {error: 'max_out_of_band', status: 400};
  const drawn = await draw(env, poster, max); if (drawn.error) return drawn;
  const intent = {id: nid('INT'), poster, skill: skill.id, title: String(title || skill.title).slice(0, 160), product: skill.product, max_usd: max, remaining: max, drawn: 0, held: 0, status: 'open', quotes: [], slices: [], prev_hash: 'genesis', matched: null, parent_id: parentId || null, children: [], created_at: new Date().toISOString()};
  await put(env, 'wep3:intent:' + intent.id, intent);
  return {intent, poster_credit: drawn.wallet.credit, line_used: drawn.wallet.line_used, spendable: spendable(drawn.wallet)};
}
