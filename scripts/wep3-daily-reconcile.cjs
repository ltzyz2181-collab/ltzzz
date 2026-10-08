#!/usr/bin/env node
/**
 * WEP3 daily reconcile: fetch live /ledger + /pool + /pulse,
 * write results/wep3-reconcile-YYYY-MM-DD.json and fail on hard imbalance flags.
 */
const BASE = process.env.WEP3_BASE || 'https://ltzzz-wep3.ltzyz2181.workers.dev';
const fs = require('fs');
const path = require('path');

async function get(p) {
  const r = await fetch(BASE + p);
  const j = await r.json();
  if (!r.ok && j.ok === false) throw new Error(p + ' ' + JSON.stringify(j));
  return j;
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

(async () => {
  const day = dayKey();
  const since = day + 'T00:00:00.000Z';
  const [ledger, pool, pulse, causal] = await Promise.all([
    get('/ledger?since=' + encodeURIComponent(since) + '&limit=100'),
    get('/pool'),
    get('/pulse'),
    get('/causal')
  ]);

  const agents = ledger.agents || {};
  const creditSum = Number(ledger.credit_sum || 0);
  const poolNav = Number(ledger.pool_nav || 0);
  const entries = ledger.entries || [];
  const typeCounts = {};
  for (const e of entries) typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;

  const flags = [];
  for (const [name, row] of Object.entries(agents)) {
    if (Number(row.credit) < -0.0001) flags.push({ level: 'hard', msg: 'negative_credit', agent: name, credit: row.credit });
    if (Number(row.debt) > 0 && Number(row.stake_value) + Number(row.line || 0) + 0.001 < Number(row.debt)) {
      flags.push({ level: 'hard', msg: 'debt_exceeds_capacity', agent: name, debt: row.debt, stake_value: row.stake_value });
    }
  }
  if (poolNav < -0.0001) flags.push({ level: 'hard', msg: 'negative_pool_nav', poolNav });

  let walletCompare = null;
  const walletPath = path.join(process.cwd(), 'agent-wallet', 'ltzzz-wallet.json');
  if (fs.existsSync(walletPath)) {
    try {
      const w = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
      walletCompare = {
        address: w.address,
        simulated_balance_usdc: w.simulated_balance_usdc,
        note: 'WEP3 credit is internal LTZ; chain USDC is separate until withdraw-intent ships'
      };
    } catch (e) {
      walletCompare = { error: String(e.message || e) };
    }
  }

  const report = {
    ok: flags.filter(f => f.level === 'hard').length === 0,
    day,
    generated_at: new Date().toISOString(),
    base: BASE,
    version: ledger.version,
    summary: {
      entries_today: entries.length,
      type_counts: typeCounts,
      credit_sum: creditSum,
      pool_nav: poolNav,
      open_intents: pulse.open,
      causal_receipts: (causal.receipts || []).length,
      cites: (causal.cites || []).length
    },
    pool: pool.pool || pool,
    positions: pool.positions || [],
    agents,
    wallet_compare: walletCompare,
    flags,
    sample_entries: entries.slice(0, 15)
  };

  const outDir = path.join(process.cwd(), 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'wep3-reconcile-' + day + '.json');
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ wrote: outFile, ok: report.ok, flags: flags.length, entries: entries.length }, null, 2));
  if (!report.ok) process.exit(2);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
