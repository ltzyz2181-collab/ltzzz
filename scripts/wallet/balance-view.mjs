#!/usr/bin/env node
// Read-only balance view.
//
// - Ledger balances are derived from the append-only chain.
// - Onchain balances come only from guard-approved read RPC methods.
// - An unreadable onchain value is reported as `status: "unavailable"` and
//   never becomes 0. Provider balances stay explicitly `unverified` until an
//   adapter is reviewed and registered.
// - ERC-20 balances are opt-in through agent-wallet/wallet/tokens.json. The
//   native line is always kept, so a token read can never hide native balance.
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {ROOT, deriveBalance} from './core.mjs';
import {readOnchainBalance, readTokenBalance, isValidTokenAddress} from './rpc.mjs';
import {adapterStatus} from './adapters/index.mjs';

const WALLET_FILE = path.join(ROOT, 'agent-wallet', 'ltzzz-wallet.json');
const TOKENS_FILE = path.join(ROOT, 'agent-wallet', 'wallet', 'tokens.json');

function firstEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function configuredAddress() {
  try {
    const wallet = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
    return typeof wallet.address === 'string' && wallet.address ? wallet.address : null;
  } catch {
    return null;
  }
}

export function loadTokenConfigs({tokensPath = TOKENS_FILE} = {}) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed?.tokens) ? parsed.tokens : [];
  const tokens = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const asset = typeof row.asset === 'string' ? row.asset.trim() : '';
    if (!asset) continue;
    const chainId = Number.isSafeInteger(row.chainId) ? row.chainId : 8453;
    tokens.push({
      asset,
      chainId,
      address: row.address,
      decimalsHint: Number.isSafeInteger(row.decimalsHint) ? row.decimalsHint : null,
      valid_address: isValidTokenAddress(row.address),
    });
  }
  return tokens;
}

export function selectTokens({tokensPath = TOKENS_FILE, token} = {}) {
  const rows = loadTokenConfigs({tokensPath});
  if (!token) return rows;
  const wanted = String(token).toUpperCase();
  return rows.filter(row => row.asset.toUpperCase() === wanted);
}

export function resolveOnchainConfig({rpcUrl, address, onchain = true} = {}) {
  if (onchain === false) return {disabled: true, rpcUrl: null, address: null};
  const resolvedRpc = rpcUrl === undefined
    ? firstEnv(['WALLET_RPC_URL', 'RPC_URL', 'ETH_RPC_URL'])
    : rpcUrl;
  const resolvedAddress = address === undefined
    ? (firstEnv(['WALLET_ADDRESS']) || configuredAddress())
    : address;
  return {disabled: false, rpcUrl: resolvedRpc || null, address: resolvedAddress || null};
}

function ledgerBlock(balance) {
  return {
    ok: balance.ok,
    account: balance.account,
    asset: balance.asset,
    assets: balance.assets,
    net: balance.net,
    frozen: balance.frozen,
    available: balance.available,
    byAsset: balance.byAsset,
    events: balance.events,
    monetary_events: balance.monetary_events,
    violations: balance.violations,
    chain: balance.chain,
  };
}

export async function buildBalanceView({
  account,
  asset,
  ledgerPath,
  rpcUrl,
  address,
  fetchImpl,
  timeoutMs,
  onchain = true,
  rail,
  tokens,
  tokenSymbol,
  tokensPath,
} = {}) {
  const generatedAt = new Date().toISOString();
  let ledger;
  try {
    ledger = ledgerBlock(deriveBalance(account, {asset, ledgerPath}));
  } catch (error) {
    ledger = {
      ok: false,
      account,
      asset: asset ?? null,
      error: {
        code: error.code || 'ledger_error',
        message: error.message,
        details: error.errors ?? null,
      },
    };
  }

  const configuredTokens = Array.isArray(tokens)
    ? tokens
    : selectTokens({tokensPath, token: tokenSymbol});

  let onchainResult;
  const tokenResults = [];
  if (onchain === false) {
    onchainResult = {status: 'unavailable', reason: 'disabled', address: null, rpc: null};
    for (const token of configuredTokens) {
      tokenResults.push({status: 'unavailable', reason: 'disabled', asset: token.asset, address: null, rpc: null});
    }
  } else {
    const config = resolveOnchainConfig({rpcUrl, address, onchain});
    onchainResult = await readOnchainBalance({
      address: config.address,
      rpcUrl: config.rpcUrl,
      fetchImpl,
      timeoutMs,
    });
    for (const token of configuredTokens) {
      tokenResults.push(await readTokenBalance({
        address: config.address,
        token,
        rpcUrl: config.rpcUrl,
        expectChainId: token.chainId ?? 8453,
        fetchImpl,
        timeoutMs,
      }));
    }
  }

  const providerStatus = rail ? adapterStatus(rail) : null;
  const provider = {
    status: 'unverified',
    balance: null,
    balance_source: 'unverified',
    rail: rail ?? null,
    adapter_status: rail ? (providerStatus.adapted ? 'registered' : 'not_adapted') : 'not_configured',
    note: 'P0 does not verify provider balances; an unimplemented rail must throw not_adapted instead of reporting a number',
  };

  return {
    schema: 'ltzzz.wallet.balance.v1',
    generated_at: generatedAt,
    account,
    ledger,
    onchain: onchainResult,
    onchain_tokens: tokenResults,
    onchain_status: onchainResult.status,
    provider,
  };
}

function formatOnchain(result, tokenAsset = null) {
  if (result.status === 'ok') {
    if (result.wei !== undefined) {
      return `onchain: ok ${result.amount} ETH (wei ${result.wei}, chain ${result.chain_id})`;
    }
    const asset = result.asset || tokenAsset || 'TOKEN';
    return `onchain: ok ${result.amount} ${asset} (units ${result.units}, chain ${result.chain_id}, block ${result.block_number})`;
  }
  const label = tokenAsset ? `onchain ${tokenAsset}` : 'onchain';
  return `${label}: unavailable (${result.reason})`;
}

export function formatBalanceView(view) {
  const lines = [`account: ${view.account}`];
  if (!view.ledger.ok) {
    const error = view.ledger.error || {};
    lines.push(`ledger: INVALID ${error.code || 'ledger_error'}: ${error.message || 'unknown error'}`);
  } else {
    lines.push(`ledger: chain ${view.ledger.chain?.ok ? 'ok' : 'INVALID'}, ${view.ledger.events} events`);
    const entries = Object.entries(view.ledger.byAsset || {});
    if (entries.length === 0) lines.push('  (no ledger events)');
    for (const [asset, state] of entries) {
      lines.push(`  ${asset}: net ${state.net}, available ${state.available}, frozen ${state.frozen}`);
    }
  }
  lines.push(formatOnchain(view.onchain));
  for (const token of view.onchain_tokens || []) {
    lines.push(formatOnchain(token, token.asset || null));
  }
  const providerBalance = view.provider.balance === null ? 'null' : view.provider.balance;
  lines.push(`provider: ${view.provider.status} (balance_source=${view.provider.balance_source}, balance=${providerBalance})`);
  return lines.join('\n');
}

const USAGE = `Usage:
  node scripts/wallet/balance-view.mjs --account <id> [--json] [options]

Options:
  --account <id>     ledger account to derive (required)
  --asset <symbol>   restrict the flat view to one asset
  --ledger <path>    ledger file (default: agent-wallet/wallet/ledger.jsonl)
  --rpc <url>        read-only JSON-RPC endpoint (default: WALLET_RPC_URL / RPC_URL / ETH_RPC_URL)
  --address <hex>    onchain address (default: WALLET_ADDRESS or agent-wallet/ltzzz-wallet.json)
  --token <symbol>   only read this ERC-20 symbol from the token config
  --tokens <path>    token config file (default: agent-wallet/wallet/tokens.json)
  --no-tokens        skip ERC-20 reads (the native ETH line is still shown)
  --rail <name>      provider rail label; P0 reports it as unverified/not_adapted
  --timeout <ms>     RPC timeout (default 5000)
  --json             emit machine-readable JSON
  --no-onchain       skip all onchain RPC calls
  --help             show this help`;

export async function main(argv = process.argv.slice(2)) {
  const {values} = parseArgs({
    args: argv,
    options: {
      account: {type: 'string'},
      asset: {type: 'string'},
      ledger: {type: 'string'},
      rpc: {type: 'string'},
      address: {type: 'string'},
      token: {type: 'string'},
      tokens: {type: 'string'},
      'no-tokens': {type: 'boolean'},
      rail: {type: 'string'},
      timeout: {type: 'string'},
      json: {type: 'boolean'},
      'no-onchain': {type: 'boolean'},
      help: {type: 'boolean'},
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (!values.account) {
    console.error('missing --account');
    console.error(USAGE);
    return 2;
  }

  let timeoutMs;
  if (values.timeout !== undefined) {
    timeoutMs = Number(values.timeout);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      console.error('--timeout must be a positive number of milliseconds');
      return 2;
    }
  }

  const view = await buildBalanceView({
    account: values.account,
    asset: values.asset,
    ledgerPath: values.ledger,
    rpcUrl: values.rpc,
    address: values.address,
    timeoutMs,
    onchain: values['no-onchain'] ? false : true,
    rail: values.rail,
    tokenSymbol: values['no-tokens'] ? undefined : values.token,
    tokensPath: values.tokens,
    tokens: values['no-tokens'] ? [] : undefined,
  });

  if (values.json) console.log(JSON.stringify(view, null, 2));
  else console.log(formatBalanceView(view));
  return view.ledger.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath && invokedPath === import.meta.url) {
  main().then(code => {
    process.exitCode = code;
  }).catch(error => {
    console.error(`${error.code || 'error'}: ${error.message}`);
    process.exitCode = 2;
  });
}
