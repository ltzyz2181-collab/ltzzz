import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  DEFAULT_FILE,
  loadPayoutNetworkStatus,
  networkStatus,
  summarize,
  validatePayoutNetworkStatus,
} from '../payout-network-status.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const record = loadPayoutNetworkStatus({root: ROOT});

test('mainnet stays HOLD and does not claim a funding attempt', () => {
  const mainnet = networkStatus(record, 'mainnet');
  assert.equal(mainnet.status, 'HOLD');
  assert.equal(mainnet.reason, 'BLOCKED_EVIDENCE');
  assert.equal(mainnet.blocked_status, 'blocked_missing_signer');
  assert.equal(mainnet.automatic_payout_enabled, false);
  assert.equal(mainnet.funding_attempted, false);
  assert.equal(mainnet.transactions, 0);
  assert.equal(mainnet.five_signature_wallet, 'excluded');
});

test('Base Sepolia is an isolated, not-yet-ready rehearsal status', () => {
  const testnet = networkStatus(record, 'base_sepolia');
  assert.equal(testnet.status, 'NOT_STARTED');
  assert.equal(testnet.testnet_rehearsal_ready, false);
  assert.equal(testnet.automatic_payout_enabled, false);
  assert.ok(testnet.missing.includes('testnet_signer'));
});

test('changing the testnet status cannot change mainnet', () => {
  const copy = structuredClone(record);
  copy.networks.base_sepolia.testnet_rehearsal_ready = true;
  copy.networks.base_sepolia.status = 'READY';
  assert.equal(networkStatus(copy, 'mainnet').status, 'HOLD');
  assert.equal(networkStatus(copy, 'mainnet').automatic_payout_enabled, false);
});

test('validator rejects a record that would mark mainnet ready', () => {
  const bad = structuredClone(record);
  bad.networks.mainnet.status = 'READY';
  bad.networks.mainnet.automatic_payout_enabled = true;
  const problems = validatePayoutNetworkStatus(bad);
  assert.ok(problems.some((item) => item.includes('mainnet.status')));
  assert.ok(problems.some((item) => item.includes('mainnet.automatic_payout_enabled')));
});

test('record contains no wallet address or private key', () => {
  const text = JSON.stringify(record);
  assert.ok(!/0x[0-9a-fA-F]{40}/.test(text));
  assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text));
  assert.equal(record.real_money_actions, false);
});

test('summary keeps the two networks separate', () => {
  const summary = summarize(record);
  assert.equal(summary.decision_id, 'GPT-DECISION-20261122-PAYOUT-HOLD-01');
  assert.equal(summary.networks.mainnet.status, 'HOLD');
  assert.equal(summary.networks.base_sepolia.testnet_rehearsal_ready, false);
  assert.equal(summary.real_money_actions, false);
  assert.ok(DEFAULT_FILE.endsWith('payout-network-status-20261124.json'));
});
