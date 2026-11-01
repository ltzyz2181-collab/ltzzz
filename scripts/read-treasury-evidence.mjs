// One-shot read-only evidence. Never retrieve secret values, sign or send transactions.
import fs from 'node:fs';
import {createHash, createHmac} from 'node:crypto';
import {Interface} from 'ethers';

const out = process.env.UI_EVIDENCE_DIR || '/tmp/ltzzz-ui-treasury';
fs.mkdirSync(out, {recursive: true});
const sha = s => createHash('sha256').update(s).digest('hex');
const report = {at_utc: new Date().toISOString(), source_commit: process.env.GITHUB_SHA || null,
  mode: 'read_only_reconciliation', signing_attempts: 0, transaction_broadcasts: 0,
  funding_retries: 0, paid: false, tx_hash: null, workers: [], public_readbacks: [], chain_reads: []};
async function read(url, headers = {}) {
  try {
    const r = await fetch(url, {method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(20000)});
    const text = await r.text();
    return {http: r.status, response_sha256: sha(text), data: JSON.parse(text)};
  } catch {return {http: null, status: 'read_failed'};}
}
function pick(data, keys) {
  return Object.fromEntries(keys.filter(k => Object.hasOwn(data || {}, k)
    && ['string', 'number', 'boolean'].includes(typeof data[k])).map(k => [k, data[k]]));
}
const token = process.env.CLOUDFLARE_API_TOKEN, account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (token && account && /^[a-f0-9]{32}$/i.test(account)) {
  for (const name of ['ltzzz-wep3', 'ltzzz-treasury-v11']) {
    const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${name}`;
    const headers = {Authorization: 'Bearer ' + token};
    const deployments = await read(base + '/deployments', headers);
    const settings = await read(base + '/settings', headers);
    const deploymentRows = (deployments.data?.result?.deployments || []).slice(0, 3);
    const bindingNames = (settings.data?.result?.bindings || []).map(b => ({name: b.name, type: b.type}));
    const worker = {name, deployments_http: deployments.http, settings_http: settings.http,
      deployments: deploymentRows.map(d => ({...pick(d, ['id', 'created_on', 'source', 'strategy']),
        versions: (d.versions || []).map(v => pick(v, ['version_id', 'percentage']))})),
      binding_names_only: bindingNames, versions: [], source_commit_bound: false};
    const ids = [...new Set(deploymentRows.flatMap(d => (d.versions || []).map(v => v.version_id)))];
    for (const id of ids.slice(0, 3)) {
      if (!/^[a-f0-9-]{36}$/i.test(id)) continue;
      const version = await read(base + '/versions/' + id, headers), data = version.data?.result || {};
      worker.versions.push({http: version.http, ...pick(data, ['id', 'number']),
        metadata: pick(data.metadata, ['created_on', 'source']),
        tag: typeof data.annotations?.['workers/tag'] === 'string' ? data.annotations['workers/tag'] : null});
    }
    report.workers.push(worker);
  }
} else report.cloudflare_metadata = 'existing_CI_credentials_unavailable';

for (const [service, origin, endpoint] of [
  ['wep3', 'https://ltzzz-wep3.ltzyz2181.workers.dev', '/health'],
  ['wep3', 'https://ltzzz-wep3.ltzyz2181.workers.dev', '/market/aave/status'],
  ['treasury-v11', 'https://ltzzz-treasury-v11.ltzyz2181.workers.dev', '/health'],
  ['treasury-v11', 'https://ltzzz-treasury-v11.ltzyz2181.workers.dev', '/dashboard'],
]) {
  const r = await read(origin + endpoint);
  report.public_readbacks.push({service, endpoint, http: r.http, response_sha256: r.response_sha256 || null,
    fields: pick(r.data, ['ok', 'service', 'version', 'financial_execution_revision', 'aave_runtime_revision',
      'address', 'controlled', 'network', 'reason', 'error', 'signed', 'safe', 'private_keys_in_worker',
      'multisig', 'today_spend', 'today_remaining_limit', 'real_tx_success_count', 'regression_tx'])});
}
if (token) {
  const auth = createHmac('sha256', token).update('ltzzz-runner-v2').digest('hex');
  const r = await read('https://ltzzz-wep3.ltzyz2181.workers.dev/market/runtime-state', {'X-Lab-Pin': auth});
  report.authenticated_runtime_readback = {http: r.http, response_sha256: r.response_sha256 || null,
    fields: pick(r.data, ['ok', 'market_runtime_revision', 'aave_runtime_revision', 'procurement_runtime_revision',
      'daily_hire_revision', 'book_sha256', 'aave_intent_count', 'external_order_count'])};
}

// Public RPC POST transports read methods only; no wallet or signer is constructed.
const safe = '0x76379a52a9e82c259E5Db417104C65C26f9C58a3';
const abi = new Interface(['function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)', 'function nonce() view returns (uint256)']);
async function rpc(url, method, params) {
  if (!['eth_chainId', 'eth_blockNumber', 'eth_getCode', 'eth_call'].includes(method)) throw Error('non_read_rpc_forbidden');
  const r = await fetch(url, {method: 'POST', redirect: 'error', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}), signal: AbortSignal.timeout(12000)});
  const data = await r.json(); if (!r.ok || data.error || data.result === undefined) throw Error('rpc_read_failed');
  return data.result;
}
for (const url of ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org']) {
  try {
    if (await rpc(url, 'eth_chainId', []) !== '0x1') throw Error('chain_mismatch');
    const block = await rpc(url, 'eth_blockNumber', []), code = await rpc(url, 'eth_getCode', [safe, block]);
    if (code === '0x') throw Error('safe_code_missing');
    const results = {};
    for (const name of ['getOwners', 'getThreshold', 'nonce']) {
      const result = await rpc(url, 'eth_call', [{to: safe, data: abi.encodeFunctionData(name)}, block]);
      const decoded = abi.decodeFunctionResult(name, result)[0];
      results[name] = name === 'getOwners' ? Array.from(decoded) : String(decoded);
    }
    report.chain_reads.push({network: 'eip155:1', rpc_host: new URL(url).hostname, block,
      address: safe, code_sha256: sha(code), ...results, status: 'on_chain_configuration_read'});
    break;
  } catch {report.chain_reads.push({network: 'eip155:1', rpc_host: new URL(url).hostname, status: 'read_failed'});}
}
report.interpretation = {
  treasury_proof_endpoint_not_called: 'GET /market/treasury may sign a fixed message when configured; this no-signing readback deliberately excludes it',
  controlled_definition: 'WEP3 Worker local signing proof for its configured Base receive address; not global wallet ownership',
  separate_treasury_v11: 'Ethereum Safe address differs from WEP3 Base EOA; health constants and old counters are not fresh key possession proof',
  current_private_key_possession_verified: false,
  financial_recovery_or_retry_authorized_by_this_evidence: false,
  deployment_commit_limitation: 'Worker version IDs/timestamps and API revisions are evidence; no full Git source binding is inferred',
};
fs.writeFileSync(out + '/treasury-readonly.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
