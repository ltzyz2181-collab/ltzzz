import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT} from '../core.mjs';
import {loadTokenConfigs, buildBalanceView, formatBalanceView} from '../balance-view.mjs';
import {
  createReadOnlyRpc,
  readOnchainBalance,
  readTokenBalance,
  tokenCallData,
  callTokenView,
  formatUnits,
  isValidTokenAddress,
} from '../rpc.mjs';

const HOLDER = '0x21F502f29294c50d9C37A30dc038D8D95eB97fdc';
const USDC = {
  asset: 'USDC',
  chainId: 8453,
  address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
};
const RPC = 'https://rpc.example.invalid/v1/secret-key';

function mockFetch({
  chainId = '0x2105',
  balance = '0x0',
  nativeBalance = '0xde0b6b3a7640000',
  decimals = '0x6',
  block = '0x10',
  seen,
} = {}) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    if (seen) seen.push({url, body});
    const rows = Array.isArray(body) ? body : [body];
    const payload = rows.map(row => {
      let result;
      if (row.method === 'eth_chainId') result = chainId;
      else if (row.method === 'eth_call') {
        result = String(row.params?.[0]?.data || '').startsWith('0x313ce567') ? decimals : balance;
      } else if (row.method === 'eth_blockNumber') result = block;
      else if (row.method === 'eth_getBalance') result = nativeBalance;
      return {jsonrpc: '2.0', id: row.id, result};
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

test('native path stays unchanged: token omitted still reports wei and 18 decimals', async () => {
  const result = await readOnchainBalance({
    address: HOLDER,
    rpcUrl: RPC,
    fetchImpl: mockFetch(),
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.wei, '1000000000000000000');
  assert.equal(result.amount, '1');
  assert.equal(result.decimals, 18);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'units'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'asset'), false);
});

test('USDC read returns exact units and amount from balanceOf/decimals', async () => {
  const result = await readTokenBalance({
    address: HOLDER,
    token: USDC,
    rpcUrl: RPC,
    fetchImpl: mockFetch({balance: '0x12d687', decimals: '0x6'}),
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.asset, 'USDC');
  assert.equal(result.units, '1234567');
  assert.equal(result.amount, '1.234567');
  assert.equal(result.decimals, 6);
  assert.equal(result.chain_id, '8453');
  assert.equal(result.balance_source, 'onchain_rpc');
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'wei'), false);
  assert.ok(!result.rpc.includes('secret-key'), result.rpc);
});

test('wrong chain returns chain_mismatch and no numeric fields', async () => {
  const seen = [];
  const result = await readTokenBalance({
    address: HOLDER,
    token: USDC,
    rpcUrl: RPC,
    fetchImpl: mockFetch({chainId: '0x1', seen}),
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'chain_mismatch');
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'units'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'amount'), false);
  assert.equal(seen.length, 1, 'only eth_chainId may be requested before aborting');
});

test('unreadable decimals never falls back to 6', async () => {
  for (const decimals of ['0x', '0x0', '0x' + 'f'.repeat(65)]) {
    const result = await readTokenBalance({
      address: HOLDER,
      token: USDC,
      rpcUrl: RPC,
      fetchImpl: mockFetch({decimals}),
    });
    assert.equal(result.status, 'unavailable', decimals);
    assert.equal(result.reason, 'token_decimals_unreadable', decimals);
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'decimals'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'amount'), false);
  }
});

test('invalid token address aborts before any fetch', async () => {
  for (const address of ['0x123', '0xZZ3589fcd6edb6e08f4c7c32d4f71b54bda02913', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913']) {
    let fetches = 0;
    const result = await readTokenBalance({
      address: HOLDER,
      token: {asset: 'USDC', address},
      rpcUrl: RPC,
      fetchImpl: async () => {
        fetches += 1;
        throw new Error('must not fetch');
      },
    });
    assert.equal(result.status, 'unavailable', address);
    assert.equal(result.reason, 'invalid_token_address', address);
    assert.equal(fetches, 0, address);
  }
});

test('unauthorized selectors are rejected before any fetch', async () => {
  assert.throws(() => tokenCallData('0xa9059cbb', HOLDER), error => error.code === 'unauthorized_token_call');
  let fetches = 0;
  const client = createReadOnlyRpc({
    url: RPC,
    fetchImpl: async () => {
      fetches += 1;
      throw new Error('must not fetch');
    },
  });
  assert.throws(() => callTokenView(client, {token: USDC, holder: HOLDER, selector: 'transfer'}), error => error.code === 'unauthorized_token_call');
  assert.throws(() => callTokenView(client, {token: {asset: 'X', address: '0x123'}, holder: HOLDER, selector: 'balanceOf'}), error => error.code === 'invalid_token_address');
  assert.equal(fetches, 0);
});

test('a successful token zero is zero, not unavailable', async () => {
  const result = await readTokenBalance({
    address: HOLDER,
    token: USDC,
    rpcUrl: RPC,
    fetchImpl: mockFetch({balance: '0x0'}),
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.units, '0');
  assert.equal(result.amount, '0');
});

test('formatUnits is exact and refuses invalid decimals', () => {
  assert.equal(formatUnits(0n, 6), '0');
  assert.equal(formatUnits(1n, 18), '0.000000000000000001');
  assert.equal(formatUnits(1234567n, 6), '1.234567');
  assert.throws(() => formatUnits(1n, -1), error => error.code === 'invalid_decimals');
  assert.throws(() => formatUnits(1n, 37), error => error.code === 'invalid_decimals');
  assert.equal(isValidTokenAddress(USDC.address), true);
  assert.equal(isValidTokenAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'), false);
});

test('formatter shows the ERC-20 line in USDC and never calls it ETH', () => {
  const view = {
    account: 'agent:test',
    ledger: {ok: true, chain: {ok: true}, events: 0, byAsset: {}},
    onchain: {status: 'unavailable', reason: 'disabled'},
    onchain_tokens: [{
      status: 'ok', asset: 'USDC', amount: '1.234567', units: '1234567',
      chain_id: '8453', block_number: '16',
    }],
    provider: {status: 'unverified', balance: null, balance_source: 'unverified'},
  };
  const text = formatBalanceView(view);
  assert.match(text, /onchain: ok 1\.234567 USDC/);
  assert.equal(text.includes('ETH'), false);
});

test('default view keeps a native ETH line and adds the configured USDC line', async () => {
  const view = await buildBalanceView({
    account: 'agent:test',
    ledgerPath: path.join(os.tmpdir(), 'does-not-exist-' + process.pid + '.jsonl'),
    rpcUrl: RPC,
    address: HOLDER,
    tokens: [USDC],
    fetchImpl: mockFetch({balance: '0xf4240', decimals: '0x6'}),
  });
  const text = formatBalanceView(view);
  assert.match(text, /onchain: ok 1 ETH/);
  assert.match(text, /onchain: ok 1 USDC/);
  assert.equal(view.onchain_tokens.length, 1);
  assert.equal(view.onchain_tokens[0].units, '1000000');
});

test('token config pins Base USDC without a private key', () => {
  const tokens = loadTokenConfigs();
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].asset, 'USDC');
  assert.equal(tokens[0].chainId, 8453);
  assert.equal(tokens[0].address, USDC.address);
  const raw = fs.readFileSync(path.join(ROOT, 'agent-wallet', 'wallet', 'tokens.json'), 'utf8');
  assert.equal(/private|secret|mnemonic/i.test(raw), false);
});

test('CLI --no-tokens keeps the old single native line', () => {
  const ledgerPath = path.join(os.tmpdir(), 'wallet-token-cli-' + process.pid + '.jsonl');
  const result = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts/wallet/balance-view.mjs'),
    '--account', 'agent:test', '--ledger', ledgerPath, '--no-onchain', '--no-tokens',
  ], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /onchain: unavailable \(disabled\)/);
});
