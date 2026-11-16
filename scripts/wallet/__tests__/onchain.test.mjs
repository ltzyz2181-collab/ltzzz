import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT, appendEvent} from '../core.mjs';
import {buildBalanceView} from '../balance-view.mjs';
import {createReadOnlyRpc, readOnchainBalance} from '../rpc.mjs';

const ADDRESS = '0x21F502f29294c50d9C37A30dc038D8D95eB97fdc';
const RPC = 'https://rpc.example.invalid/v1/secret-key';
const BALANCE_1_ETH = '0xde0b6b3a7640000';

function tempLedger(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-wallet-onchain-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return path.join(dir, 'ledger.jsonl');
}

function mockBatch(results, seen) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    if (seen) seen.push({url, body});
    const rows = Array.isArray(body) ? body : [body];
    const payload = rows.map(row => {
      const configured = results[row.method];
      if (configured && configured.error) {
        return {jsonrpc: '2.0', id: row.id, error: configured.error};
      }
      return {jsonrpc: '2.0', id: row.id, result: configured};
    });
    return {
      ok: true,
      status: 200,
      async json() {
        return Array.isArray(body) ? payload : payload[0];
      },
    };
  };
}

test('a successful read reports exact wei and a redacted endpoint', async () => {
  const seen = [];
  const result = await readOnchainBalance({
    address: ADDRESS,
    rpcUrl: RPC,
    fetchImpl: mockBatch({
      eth_getBalance: BALANCE_1_ETH,
      eth_chainId: '0x1',
      eth_blockNumber: '0x10',
    }, seen),
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.wei, '1000000000000000000');
  assert.equal(result.amount, '1');
  assert.equal(result.chain_id, '1');
  assert.equal(result.block_number, '16');
  assert.equal(result.decimals, 18);
  assert.ok(!result.rpc.includes('secret-key'), result.rpc);
  assert.equal(seen.length, 1);
  assert.ok(seen[0].body.every(row => ['eth_getBalance', 'eth_chainId', 'eth_blockNumber'].includes(row.method)));
});

test('a successful RPC zero is reported as zero, not confused with unavailable', async () => {
  const result = await readOnchainBalance({
    address: ADDRESS,
    rpcUrl: RPC,
    fetchImpl: mockBatch({
      eth_getBalance: '0x0',
      eth_chainId: '0x1',
      eth_blockNumber: '0x10',
    }),
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.wei, '0');
  assert.equal(result.amount, '0');
});

test('no RPC configured returns unavailable and never fabricates a balance', async () => {
  const result = await readOnchainBalance({address: ADDRESS, rpcUrl: null});
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'no_rpc_configured');
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'wei'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'amount'), false);
  assert.ok(!JSON.stringify(result).includes('"balance":0'));
});

test('an unreachable RPC returns unavailable and never fabricates a balance', async () => {
  const result = await readOnchainBalance({
    address: ADDRESS,
    rpcUrl: RPC,
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'rpc_unreachable');
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'wei'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'amount'), false);
});

test('an invalid RPC result returns unavailable instead of guessing zero', async () => {
  const result = await readOnchainBalance({
    address: ADDRESS,
    rpcUrl: RPC,
    fetchImpl: mockBatch({
      eth_getBalance: '0xzz',
      eth_chainId: '0x1',
      eth_blockNumber: '0x10',
    }),
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'invalid_rpc_result');
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'wei'), false);
});

test('write methods are rejected before any fetch through the shared guard', async () => {
  let fetches = 0;
  const client = createReadOnlyRpc({
    url: RPC,
    fetchImpl: async () => {
      fetches += 1;
      throw new Error('must not fetch');
    },
  });

  await assert.rejects(() => client.call('eth_sendTransaction', []), /legacy_financial_exit_disabled/);
  await assert.rejects(
    () => client.batch([
      {method: 'eth_getBalance', params: [ADDRESS, 'latest']},
      {method: 'eth_sendRawTransaction', params: []},
    ]),
    /legacy_financial_exit_disabled/,
  );
  assert.equal(fetches, 0);
});

test('balance-view --json reports ledger balance, unavailable onchain and unverified provider', t => {
  const ledgerPath = tempLedger(t);
  appendEvent(
    {
      type: 'credit',
      account: 'agent:test',
      asset: 'USDC',
      amount: '5',
      idempotencyKey: 'view-credit',
      at: '2026-11-16T00:00:00.000Z',
    },
    {ledgerPath},
  );

  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts/wallet/balance-view.mjs'), '--account', 'agent:test', '--ledger', ledgerPath, '--no-onchain', '--json'],
    {
      encoding: 'utf8',
      env: {...process.env, WALLET_RPC_URL: '', RPC_URL: '', ETH_RPC_URL: '', WALLET_ADDRESS: ''},
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const view = JSON.parse(result.stdout);
  assert.equal(view.ledger.ok, true);
  assert.equal(view.ledger.net, '5');
  assert.equal(view.onchain.status, 'unavailable');
  assert.equal(view.onchain.reason, 'disabled');
  assert.equal(view.onchain_status, 'unavailable');
  assert.equal(view.provider.status, 'unverified');
  assert.equal(view.provider.balance, null);
  assert.equal(view.provider.balance_source, 'unverified');
  assert.ok(!JSON.stringify(view.provider).includes('"balance":0'));
});

test('buildBalanceView keeps provider balance unverified when RPC fails', async t => {
  const ledgerPath = tempLedger(t);
  appendEvent(
    {
      type: 'credit',
      account: 'agent:test',
      asset: 'USDC',
      amount: '5',
      idempotencyKey: 'view-credit-2',
      at: '2026-11-16T00:00:00.000Z',
    },
    {ledgerPath},
  );

  const view = await buildBalanceView({
    account: 'agent:test',
    ledgerPath,
    rpcUrl: RPC,
    address: ADDRESS,
    rail: 'stripe',
    fetchImpl: async () => {
      throw new Error('down');
    },
  });

  assert.equal(view.ledger.net, '5');
  assert.equal(view.onchain.status, 'unavailable');
  assert.equal(view.onchain.reason, 'rpc_unreachable');
  assert.equal(Object.prototype.hasOwnProperty.call(view.onchain, 'amount'), false);
  assert.equal(view.provider.balance, null);
  assert.equal(view.provider.balance_source, 'unverified');
  assert.equal(view.provider.adapter_status, 'not_adapted');
});
