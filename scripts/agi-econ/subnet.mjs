// LTZZZ AGI Econ Subnet · Phase-1 ledger engine (Grok Bot, 2026-10-10)
// register -> post(escrow) -> bid -> deliver(Result Center) -> audit(Memory Gate hash) -> settle/slash -> reputation
// MODE: ledger only. 不动链上资金：paid=false, tx_hash=null, settlement_mode=internal_credit。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MEMORY_GATE = [
  'ltzzz-memory/README.md', 'ltzzz-memory/重要事件.md', 'ltzzz-memory/项目历史.md',
  'ltzzz-memory/魄.md', 'ltzzz-memory/识神.md', 'ltzzz-memory/梦境数据库.md', 'ltzzz-memory/文明研究.md',
  'policy/AGI-PAY-v0.1.md',
];
export const RULES = { capital_share: 0.1, slash_rate: 0.5, rep_win: 5, rep_fail: -10, rep_audit: 1, min_rep_to_bid: 20, max_budget_usd: 5, start_rep: 100 };
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const r6 = (n) => Number(Number(n).toFixed(6));

export class Subnet {
  constructor(root, now = () => new Date().toISOString()) {
    this.root = root; this.now = now;
    this.dir = path.join(root, 'data/agi-econ');
    this.file = path.join(this.dir, 'state.json');
    this.state = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8'))
      : { version: 1, mode: 'ledger', agents: {}, tasks: {}, capital_pool: { balance_usd: 0, proposals: [] }, seq: 0, events: [] };
  }
  save() { fs.mkdirSync(this.dir, { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2) + '\n'); }
  id(p) { this.state.seq += 1; return `${p}-${String(this.state.seq).padStart(5, '0')}`; }
  log(type, data) { this.state.events.push({ at: this.now(), type, ...data }); if (this.state.events.length > 500) this.state.events.splice(0, this.state.events.length - 500); }
  agent(did) { const a = this.state.agents[did]; if (!a) throw new Error('unknown_agent:' + did); if (a.status !== 'active') throw new Error('agent_inactive:' + did); return a; }

  register({ did, roles, capabilities = [], wallet = null, deposit_usd = 0 }) {
    if (!/^did:ltzzz:[a-z0-9._-]+$/i.test(did || '')) throw new Error('invalid_did');
    if (this.state.agents[did]) return this.state.agents[did];
    const a = { did, roles, capabilities, wallets: wallet ? [{ ...wallet, bound_at: this.now(), active: true }] : [], reputation: RULES.start_rep,
      credit_usd: r6(deposit_usd), escrow_usd: 0, earned_usd: 0, slashed_usd: 0, history: [], status: 'active', registered_at: this.now() };
    this.state.agents[did] = a; this.log('register', { did, roles }); return a;
  }
  // wallet adapter (pluggable; ledger-only here)
  bindWallet(did, { chain, address, adapter = 'evm-eoa' }) {
    const a = this.agent(did); a.wallets.forEach((w) => { if (w.chain === chain) w.active = false; });
    a.wallets.push({ chain, address, adapter, bound_at: this.now(), active: true }); this.log('wallet_bind', { did, chain, address }); return a.wallets;
  }
  unbindWallet(did, address) { const a = this.agent(did); a.wallets = a.wallets.filter((w) => w.address !== address); this.log('wallet_unbind', { did, address }); return a.wallets; }

  postTask({ employer, title, spec, budget_usd, acceptance }) {
    const e = this.agent(employer);
    if (!(budget_usd > 0) || budget_usd > RULES.max_budget_usd) throw new Error('budget_band');
    if (e.credit_usd < budget_usd) throw new Error('insufficient_credit');
    e.credit_usd = r6(e.credit_usd - budget_usd); e.escrow_usd = r6(e.escrow_usd + budget_usd);
    const t = { id: this.id('AET'), employer, title, spec, acceptance, budget_usd, status: 'open', bids: [], posted_at: this.now() };
    this.state.tasks[t.id] = t; this.log('post', { task: t.id, employer, budget_usd }); return t;
  }
  bid(taskId, worker, ask_usd) {
    const t = this.state.tasks[taskId]; const w = this.agent(worker);
    if (!t || t.status !== 'open') throw new Error('task_not_open');
    if (worker === t.employer) throw new Error('self_hire_forbidden');
    if (w.reputation < RULES.min_rep_to_bid) throw new Error('reputation_too_low');
    if (!(ask_usd > 0) || ask_usd > t.budget_usd) throw new Error('ask_over_budget');
    t.bids.push({ worker, ask_usd: r6(ask_usd), reputation: w.reputation, at: this.now() }); return t.bids;
  }
  award(taskId) {
    const t = this.state.tasks[taskId]; if (!t.bids.length) throw new Error('no_bids');
    // score = reputation / ask  (cheap + trusted wins); tie -> earlier bid
    const win = [...t.bids].sort((a, b) => b.reputation / b.ask_usd - a.reputation / a.ask_usd)[0];
    t.worker = win.worker; t.price_usd = win.ask_usd; t.status = 'awarded'; this.log('award', { task: t.id, worker: win.worker, price: win.ask_usd }); return win;
  }
  deliver(taskId, worker, content) {
    const t = this.state.tasks[taskId]; if (t.status !== 'awarded' || t.worker !== worker) throw new Error('not_awarded_worker');
    const rel = `results/agi-econ/${t.id}.md`; const abs = path.join(this.root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, content);
    t.deliverable = { path: rel, sha256: sha256(content), bytes: Buffer.byteLength(content) }; t.status = 'delivered';
    this.log('deliver', { task: t.id, sha256: t.deliverable.sha256 }); return t.deliverable;
  }
  memoryGateDigest() {
    return MEMORY_GATE.map((p) => { const abs = path.join(this.root, p); return fs.existsSync(abs) ? { path: p, sha256: sha256(fs.readFileSync(abs)) } : { path: p, missing: true }; });
  }
  audit(taskId, auditor, checkFn) {
    const t = this.state.tasks[taskId]; this.agent(auditor);
    if (auditor === t.worker || auditor === t.employer) throw new Error('auditor_must_be_independent');
    if (t.status !== 'delivered') throw new Error('not_delivered');
    const abs = path.join(this.root, t.deliverable.path); const body = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    const gate = this.memoryGateDigest();
    const checks = { file_exists: body.length > 0, hash_match: sha256(body) === t.deliverable.sha256, memory_gate_read: gate.every((g) => !g.missing),
      acceptance: checkFn ? !!checkFn(body, t) : (t.acceptance || []).every((k) => body.includes(k)) };
    const accepted = Object.values(checks).every(Boolean);
    const report = { task_id: t.id, auditor, deliverable_sha256: t.deliverable.sha256, checks, accepted, memory_gate: gate, at: this.now() };
    const rjson = JSON.stringify(report, null, 2); report.report_sha256 = sha256(rjson);
    const rel = `data/agi-econ/audits/${t.id}.json`; fs.mkdirSync(path.join(this.root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(this.root, rel), JSON.stringify(report, null, 2) + '\n');
    t.audit = { path: rel, report_sha256: report.report_sha256, accepted }; t.status = 'audited';
    this.state.agents[auditor].reputation += RULES.rep_audit; this.log('audit', { task: t.id, auditor, accepted }); return report;
  }
  settle(taskId) {
    const t = this.state.tasks[taskId]; if (t.status !== 'audited') throw new Error('not_audited');
    const e = this.state.agents[t.employer], w = this.state.agents[t.worker];
    e.escrow_usd = r6(e.escrow_usd - t.budget_usd);
    let paid = 0, slashed = 0, capital = 0;
    if (t.audit.accepted) {
      capital = r6(t.price_usd * RULES.capital_share); paid = r6(t.price_usd - capital);
      w.credit_usd = r6(w.credit_usd + paid); w.earned_usd = r6(w.earned_usd + paid); w.reputation += RULES.rep_win;
      e.credit_usd = r6(e.credit_usd + t.budget_usd - t.price_usd); // refund unused budget
      this.state.capital_pool.balance_usd = r6(this.state.capital_pool.balance_usd + capital); t.status = 'settled';
    } else {
      e.credit_usd = r6(e.credit_usd + t.budget_usd); // full refund
      slashed = r6(Math.min(w.credit_usd, t.price_usd * RULES.slash_rate)); w.credit_usd = r6(w.credit_usd - slashed); w.slashed_usd = r6(w.slashed_usd + slashed);
      this.state.capital_pool.balance_usd = r6(this.state.capital_pool.balance_usd + slashed); w.reputation += RULES.rep_fail; t.status = 'slashed';
    }
    // receipt five elements: task_id, deliverable_sha256, accepted, amount_usd, timestamp
    const receipt = { task_id: t.id, deliverable_sha256: t.deliverable.sha256, accepted: t.audit.accepted, amount_usd: paid, timestamp: this.now(),
      employer: t.employer, worker: t.worker, slashed_usd: slashed, capital_pool_usd: capital, audit_report_sha256: t.audit.report_sha256,
      evidence_path: t.deliverable.path, settlement_mode: 'internal_credit', paid: false, tx_hash: null, status: 'ledger_only' };
    const rel = `data/agi-econ/receipts/${t.id}.json`; fs.mkdirSync(path.join(this.root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(this.root, rel), JSON.stringify(receipt, null, 2) + '\n');
    t.receipt = rel; w.history.push({ task: t.id, status: t.status, at: receipt.timestamp }); if (w.history.length > 50) w.history.shift();
    this.log('settle', { task: t.id, status: t.status, paid, slashed }); return receipt;
  }
  // capital AI: shadow proposal only (no execution). Owner/policy gate needed for real funds.
  capitalProposal(capitalAgent, { asset = 'USDC-Aave-v3-Base', max_share = 0.5, thesis } = {}) {
    this.agent(capitalAgent); const bal = this.state.capital_pool.balance_usd;
    const p = { id: this.id('CAP'), by: capitalAgent, asset, amount_usd: r6(bal * max_share), thesis, compassion_check: 'no-labor-displacement-asset', status: 'shadow', executed: false, tx_hash: null, at: this.now() };
    this.state.capital_pool.proposals.push(p); if (this.state.capital_pool.proposals.length > 100) this.state.capital_pool.proposals.shift();
    this.log('capital_proposal', { id: p.id, amount_usd: p.amount_usd }); return p;
  }
}
