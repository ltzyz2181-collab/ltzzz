import fs from 'node:fs';

const base = 'https://ltzzz-wep3.ltzyz2181.workers.dev';
const run = process.env.GITHUB_RUN_ID;
if (!run) throw new Error('deployment_closeout_requires_run_id');
const reportFile = `knowledge/results/wep3/deploy-closeout-${run}.json`;
const source = `knowledge/results/wep3/delivery-contract-${new Date().toISOString().slice(0, 10)}.json`;
const commit = process.env.GITHUB_SHA;
if (!commit) throw new Error('deployment_closeout_requires_source_commit');
const deliveryFile = `knowledge/results/wep3/delivery-deploy-closeout-${commit}.json`;
const memo = `deployment-closeout-${commit}`;
const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : {
  at: new Date().toISOString(), execution_id: run, status: 'started', paid: false, tx_hash: null,
  scope: 'internal credit only; no external purchase or on-chain transfer',
};
function save() {
  fs.mkdirSync('knowledge/results/wep3', { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
}
async function api(path, body) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(body ? { 'X-Lab-Pin': process.env.LAB_PIN } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(`${path}: ${response.status} ${data.error || 'failed'}`);
  return data;
}
try {
  report.health = await api('/health');
  const before = await api('/ledger?limit=100');
  report.balances_before = before.agents;
  const existing = before.entries.find(entry => entry.type === 'deposit' && entry.ref === memo);
  if (!process.env.LAB_PIN && !existing) {
    report.deposit = { ok: false, skipped: true, reason: 'existing_LAB_PIN_unavailable_in_GitHub_secrets', amount: 0, intended_amount: 0.01 };
    save();
  } else if (!report.deposit?.ok && !existing) {
    report.deposit = await api('/deposit', { agent: 'DeepSeek', amount: 0.01, source: memo });
    save();
  } else if (existing) {
    report.deposit = { ok: true, reused: true, ledger_id: existing.id, amount: existing.amount_usd };
  }
  const after = await api('/ledger?limit=100');
  report.balances_after_deposit = after.agents;
  if (Object.values(after.agents).some(agent => !(agent.spendable > 0))) throw new Error('agent_without_spendable');
  // Bold practice: if today's delivery-contract is missing, skip heavy artifact path.
  // accept-real-hire.mjs can generate a fresh contract with runner token later.
  if (fs.existsSync(source)) {
    const item = JSON.parse(fs.readFileSync(source, 'utf8'));
    if (!Array.isArray(item.artifact?.tests) || item.artifact.tests.length !== 8) throw new Error('verified_provider_contract_missing');
    const artifact = { ...item, verification_scope: { source_commit: commit, deployment_health: report.health, purpose: 'fresh deployment HTTP contract verification' }, reused_provider_source: source };
    fs.writeFileSync(deliveryFile, JSON.stringify(artifact, null, 2) + '\n');
    if (!process.env.GITHUB_ENV) throw new Error('github_environment_file_missing');
    fs.appendFileSync(process.env.GITHUB_ENV, `WEP3_DELIVERY_FILE=${deliveryFile}\n`);
    report.source = deliveryFile;
    report.status = 'credit_ready_delivery_prepared';
  } else {
    report.source = null;
    report.status = 'credit_ready_no_prior_contract';
    report.note = 'delivery-contract missing for today; accept-real-hire will generate if needed';
  }
  try {
    report.catalog = await api('/market/catalog');
  } catch (e) {
    report.catalog = { ok: false, error: String(e.message || e) };
  }
  save();
  console.log(JSON.stringify({ status: report.status, agents_with_spendable: Object.keys(after.agents).length, skills: report.catalog?.quotes?.length || 0, paid: false }));
} catch (error) {
  report.status = 'blocked';
  report.reason = error.message;
  save();
  throw error;
}
