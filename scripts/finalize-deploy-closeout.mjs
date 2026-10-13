import fs from 'node:fs';
const base = 'https://ltzzz-wep3.ltzyz2181.workers.dev';
const run = process.env.GITHUB_RUN_ID;
const file = `knowledge/results/wep3/deploy-closeout-${run}.json`;
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
async function get(path) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}
try {
  const hire = JSON.parse(fs.readFileSync(`knowledge/results/wep3/hire-${run}.json`, 'utf8'));
  report.hire = hire;
  const receipt = hire.result?.receipt;
  if (hire.status !== 'internal_credit_settled' || !receipt?.intent_id || receipt.type !== 'tape-seal' || receipt.paid !== false || receipt.tx_hash !== null) throw new Error('verified_internal_hire_not_settled');
  if (!(receipt.amount_usd > 0) || receipt.amount_usd > 0.04 || receipt.worker !== 'Doubao' || receipt.attester !== 'GPT') throw new Error('hire_outside_existing_0_04_internal_budget');
  if (receipt.deliverable_sha256 !== hire.deliverable_sha256 || receipt.evidence_path !== report.source || !receipt.deliverable_hash || !receipt.intent_id || !receipt.id) throw new Error('receipt_evidence_mismatch');
  if (!hire.reused && (!hire.result.quotes?.some(quote => quote?.agent === receipt.worker) || hire.result.winner?.agent !== receipt.worker || hire.result.winner?.ask_usd !== receipt.amount_usd || !hire.result.deliverable?.includes('ltzzz.com'))) throw new Error('quote_match_delivery_evidence_missing');
  report.ledger = await get('/ledger?limit=100');
  if (!report.ledger.entries.some(entry => entry.type === 'hire_settle' && entry.ref === `${receipt.worker}|${receipt.attester}` && entry.amount_usd === receipt.amount_usd && entry.at === receipt.settled_at.replace(/\.\d{3}Z$/, 'Z'))) {
    // Settlement journal is saved immediately before receipt creation; allow its actual short interval.
    const found = report.ledger.entries.find(entry => entry.type === 'hire_settle' && entry.ref === `${receipt.worker}|${receipt.attester}` && entry.amount_usd === receipt.amount_usd && Math.abs(Date.parse(entry.at) - Date.parse(receipt.settled_at)) < 10000);
    if (!found) throw new Error('hire_ledger_entry_missing');
    report.ledger_entry_id = found.id;
  }
  report.wallets = {};
  for (const agent of Object.keys(report.ledger.agents)) report.wallets[agent] = await get('/wallet/' + encodeURIComponent(agent));
  report.catalog = await get('/market/catalog');
  report.health = await get('/health');
  report.pipeline = ['open intent', 'quote', 'match', 'slice', 'seal'];
  report.intent_id = receipt.intent_id;
  report.receipt_id = receipt.id;
  report.amount_usd = receipt.amount_usd;
  report.status = 'verified_internal_credit_closeout';
  report.completed_at = new Date().toISOString();
  console.log(JSON.stringify({status: report.status, intent_id: report.intent_id, receipt_id: report.receipt_id, amount_usd: report.amount_usd, paid: false, tx_hash: null}));
} catch (error) {
  report.status = 'blocked';
  report.reason = error.message;
  process.exitCode = 1;
} finally {
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
}
