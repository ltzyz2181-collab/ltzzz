#!/usr/bin/env node
// Read-only status registry for payout networks.
//
// GPT-DECISION-20261122-PAYOUT-HOLD-01 allows only an isolated Base Sepolia
// rehearsal. It does not authorise mainnet payout, signing, a signer key, or a
// production recipient. This script never sends a transaction or reads a key.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const SCHEMA = 'ltzzz.payout-network-status.v1';
export const DEFAULT_FILE = 'config/payout-network-status-20261124.json';
export const NETWORKS = ['mainnet', 'base_sepolia'];

export function validatePayoutNetworkStatus(data) {
  const problems = [];
  if (!data || typeof data !== 'object') return ['record must be an object'];
  if (data.schema !== SCHEMA) problems.push('schema');
  for (const network of NETWORKS) {
    if (!data.networks || typeof data.networks[network] !== 'object') problems.push('networks.' + network);
  }

  const mainnet = data.networks?.mainnet;
  if (mainnet) {
    if (mainnet.status !== 'HOLD') problems.push('mainnet.status must stay HOLD');
    if (mainnet.reason !== 'BLOCKED_EVIDENCE') problems.push('mainnet.reason must stay BLOCKED_EVIDENCE');
    if (mainnet.automatic_payout_enabled !== false) problems.push('mainnet.automatic_payout_enabled must be false');
    if (mainnet.funding_attempted !== false) problems.push('mainnet.funding_attempted must be false');
    if (mainnet.transactions !== 0) problems.push('mainnet.transactions must be 0');
    if (mainnet.five_signature_wallet !== 'excluded') problems.push('mainnet.five_signature_wallet must be excluded');
  }

  const testnet = data.networks?.base_sepolia;
  if (testnet) {
    if (typeof testnet.testnet_rehearsal_ready !== 'boolean') problems.push('base_sepolia.testnet_rehearsal_ready must be boolean');
    if (testnet.automatic_payout_enabled !== false) problems.push('base_sepolia.automatic_payout_enabled must be false');
  }

  if (!Array.isArray(data.invariants) || !data.invariants.some((item) => /mainnet.*independent|independent.*mainnet/i.test(item))) {
    problems.push('invariants must state mainnet independence');
  }
  if (data.real_money_actions !== false) problems.push('real_money_actions must be false');

  const text = JSON.stringify(data);
  if (/0x[0-9a-fA-F]{40}/.test(text)) problems.push('record must not contain a wallet address');
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) problems.push('record must not contain a private key');
  return problems;
}

export function loadPayoutNetworkStatus({root = process.cwd(), file = DEFAULT_FILE} = {}) {
  const data = JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8'));
  const problems = validatePayoutNetworkStatus(data);
  if (problems.length) throw new Error('invalid payout network status: ' + problems.join('; '));
  return data;
}

export function networkStatus(data, network) {
  if (!NETWORKS.includes(network)) throw new Error('unknown network: ' + network);
  return structuredClone(data.networks[network]);
}

export function summarize(data) {
  return {
    schema: data.schema,
    decision_id: data.decision_id,
    source_task_id: data.source_task_id,
    real_money_actions: data.real_money_actions,
    networks: Object.fromEntries(NETWORKS.map((network) => [network, {
      status: data.networks[network].status,
      reason: data.networks[network].reason,
      automatic_payout_enabled: data.networks[network].automatic_payout_enabled,
      funding_attempted: data.networks[network].funding_attempted,
      transactions: data.networks[network].transactions,
      ...(network === 'base_sepolia' ? {testnet_rehearsal_ready: data.networks[network].testnet_rehearsal_ready} : {}),
    }])),
  };
}

const argOf = (argv, name, fallback = null) => argv.flatMap((arg, index) => (arg === name && argv[index + 1] ? [argv[index + 1]] : [])).at(-1) ?? fallback;

export function main(argv = process.argv.slice(2)) {
  const network = argOf(argv, '--network', 'all');
  const root = argOf(argv, '--root', process.cwd());
  const data = loadPayoutNetworkStatus({root});
  if (network === 'all') {
    console.log(JSON.stringify(summarize(data), null, 2));
    return 0;
  }
  if (!NETWORKS.includes(network)) throw new Error('unknown network: ' + network);
  console.log(JSON.stringify({decision_id: data.decision_id, network, ...networkStatus(data, network)}, null, 2));
  return 0;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invoked === import.meta.url) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(JSON.stringify({status: 'invalid', error: String(error?.message || error)}));
    process.exitCode = 1;
  }
}
