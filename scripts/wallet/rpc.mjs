// Read-only JSON-RPC client for onchain balance observation.
//
// Every outgoing request is checked by lib/financial-exit-guard.js before the
// fetch call. There is deliberately no write-capable method path here: an
// outgoing or unknown method aborts before the network is touched.
import {assertReadOnlyRpc, assertReadOnlyRpcBody} from '../../lib/financial-exit-guard.js';
import {WalletError, unitsToAmount} from './core.mjs';

export const ONCHAIN_DECIMALS = 18;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_QUANTITY_RE = /^0x[0-9a-fA-F]+$/;

export function redactRpcUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(String(raw));
    url.username = '';
    url.password = '';
    url.hash = '';
    if (url.search) url.search = '?redacted';
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length > 1) url.pathname = `/${parts[0]}/***`;
    else if (parts.length === 1 && /^[A-Za-z0-9_-]{16,}$/.test(parts[0])) url.pathname = '/***';
    return url.toString();
  } catch {
    return '[invalid-url]';
  }
}

function normalizeRpcUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new WalletError('invalid_rpc_url', 'rpc url is required');
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new WalletError('invalid_rpc_url', 'rpc url is not a valid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new WalletError('invalid_rpc_url', 'rpc url must use http or https');
  }
  return url;
}

export function createReadOnlyRpc({url, fetchImpl = globalThis.fetch, timeoutMs = 5000, headers = {}} = {}) {
  const endpoint = normalizeRpcUrl(url).toString();
  if (typeof fetchImpl !== 'function') throw new WalletError('invalid_rpc_client', 'fetch implementation is required');
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;
  let nextId = 0;

  async function request(body) {
    const serialized = JSON.stringify(body);
    // Defense in depth: the guard inspects the actual wire body, including batches.
    assertReadOnlyRpcBody(serialized);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {'content-type': 'application/json', accept: 'application/json', ...headers},
        body: serialized,
        signal: controller.signal,
      });
    } catch (error) {
      const code = error?.name === 'AbortError' ? 'rpc_timeout' : 'rpc_unreachable';
      throw new WalletError(code, `RPC request failed: ${error?.message || error}`, {cause: error});
    } finally {
      clearTimeout(timer);
    }
    if (!response || response.ok === false) {
      throw new WalletError('rpc_http_error', `RPC HTTP ${response?.status ?? 'unknown'}`, {status: response?.status});
    }
    try {
      return await response.json();
    } catch (error) {
      throw new WalletError('rpc_invalid_json', `RPC response was not JSON: ${error?.message || error}`);
    }
  }

  async function call(method, params = []) {
    assertReadOnlyRpc(method);
    const body = {jsonrpc: '2.0', id: ++nextId, method, params};
    const json = await request(body);
    if (json?.error) throw new WalletError('rpc_error', json.error.message || 'RPC returned an error', {method, rpcError: json.error});
    if (!json || !Object.prototype.hasOwnProperty.call(json, 'result')) {
      throw new WalletError('rpc_invalid_response', `RPC response has no result for ${method}`, {method});
    }
    return json.result;
  }

  async function batch(calls) {
    if (!Array.isArray(calls) || calls.length === 0) throw new WalletError('rpc_batch_empty', 'batch requires at least one call');
    const bodies = calls.map(entry => {
      assertReadOnlyRpc(entry?.method);
      return {jsonrpc: '2.0', id: ++nextId, method: entry.method, params: entry.params ?? []};
    });
    const json = await request(bodies);
    if (!Array.isArray(json)) throw new WalletError('rpc_invalid_response', 'batch response must be an array');
    const byId = new Map(json.map(row => [row?.id, row]));
    return bodies.map(body => {
      const row = byId.get(body.id);
      if (!row) throw new WalletError('rpc_invalid_response', `missing batch result for ${body.method}`, {method: body.method});
      if (row.error) throw new WalletError('rpc_error', row.error.message || 'RPC returned an error', {method: body.method, rpcError: row.error});
      if (!Object.prototype.hasOwnProperty.call(row, 'result')) {
        throw new WalletError('rpc_invalid_response', `missing result for ${body.method}`, {method: body.method});
      }
      return row.result;
    });
  }

  return Object.freeze({url: redactRpcUrl(endpoint), call, batch});
}

export function parseHexQuantity(value, label = 'value') {
  if (typeof value !== 'string' || !HEX_QUANTITY_RE.test(value)) {
    throw new WalletError('invalid_rpc_result', `${label} must be a hexadecimal quantity`, {value});
  }
  return BigInt(value);
}

// Returns either {status:'ok', wei, amount, ...} or {status:'unavailable', reason}.
// A successful RPC zero is reported as `wei:'0'`; an unreadable value never
// becomes a zero.
export async function readOnchainBalance({address, rpcUrl, fetchImpl, timeoutMs = 5000, headers} = {}) {
  const redacted = redactRpcUrl(rpcUrl);
  const readAt = new Date().toISOString();
  if (!address) {
    return {status: 'unavailable', reason: 'no_address_configured', address: null, rpc: redacted, read_at: readAt};
  }
  if (typeof address !== 'string' || !ADDRESS_RE.test(address)) {
    return {status: 'unavailable', reason: 'invalid_address', address, rpc: redacted, read_at: readAt};
  }
  if (!rpcUrl) {
    return {status: 'unavailable', reason: 'no_rpc_configured', address, rpc: null, read_at: readAt};
  }

  let client;
  try {
    client = createReadOnlyRpc({url: rpcUrl, fetchImpl, timeoutMs, headers});
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error.code || 'invalid_rpc_url',
      address,
      rpc: redacted,
      detail: error.message,
      read_at: readAt,
    };
  }

  try {
    const [balanceHex, chainIdHex, blockNumberHex] = await client.batch([
      {method: 'eth_getBalance', params: [address, 'latest']},
      {method: 'eth_chainId', params: []},
      {method: 'eth_blockNumber', params: []},
    ]);
    const wei = parseHexQuantity(balanceHex, 'eth_getBalance');
    const chainId = parseHexQuantity(chainIdHex, 'eth_chainId');
    const blockNumber = parseHexQuantity(blockNumberHex, 'eth_blockNumber');
    return {
      status: 'ok',
      address,
      rpc: redacted,
      chain_id: chainId.toString(),
      block_number: blockNumber.toString(),
      wei: wei.toString(),
      amount: unitsToAmount(wei),
      decimals: ONCHAIN_DECIMALS,
      balance_source: 'onchain_rpc',
      read_at: readAt,
    };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error.code || 'onchain_unavailable',
      address,
      rpc: redacted,
      detail: error.message,
      read_at: readAt,
    };
  }
}

// ---------- ERC-20 read-only view (P1-1) ----------
//
// The product target is USDC on Base, but the native path above stays the
// default so existing callers do not change meaning. A token read must pass
// through callTokenView(), which refuses any selector other than balanceOf /
// decimals and any `to` other than the configured token contract: eth_call is
// otherwise a general-purpose probe.

export const TOKEN_SELECTORS = Object.freeze({
  balanceOf: '0x70a08231',
  decimals: '0x313ce567',
});

const TOKEN_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isValidTokenAddress(value) {
  if (typeof value !== 'string' || !TOKEN_ADDRESS_RE.test(value)) return false;
  const body = value.slice(2);
  // A mixed-case address is an EIP-55 checksum claim. Without a keccak256
  // verifier in this module we cannot confirm it, so mixed case is rejected
  // rather than trusted. Config uses the uniform-case form.
  return body === body.toLowerCase() || body === body.toUpperCase();
}

export function formatUnits(units, decimals) {
  if (typeof units !== 'bigint') throw new WalletError('invalid_amount', 'units must be a bigint');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new WalletError('invalid_decimals', 'decimals must be an integer between 0 and 36');
  }
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = (absolute % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

function padAddress(address) {
  return address.slice(2).toLowerCase().padStart(64, '0');
}

export function tokenCallData(selector, address) {
  if (selector === TOKEN_SELECTORS.decimals) return TOKEN_SELECTORS.decimals;
  if (selector !== TOKEN_SELECTORS.balanceOf) {
    throw new WalletError('unauthorized_token_call', `selector ${selector} is not permitted`, {selector});
  }
  return TOKEN_SELECTORS.balanceOf + padAddress(address);
}

export function callTokenView(client, {token, holder, selector, call = null}) {
  if (!token || !isValidTokenAddress(token.address)) {
    throw new WalletError('invalid_token_address', 'token address must be a uniform-case 20-byte hex address', {
      address: token?.address ?? null,
    });
  }
  if (typeof holder !== 'string' || !ADDRESS_RE.test(holder)) {
    throw new WalletError('invalid_address', 'holder address is invalid', {address: holder ?? null});
  }
  if (!Object.hasOwn(TOKEN_SELECTORS, selector)) {
    throw new WalletError('unauthorized_token_call', `selector ${selector} is not permitted`, {selector});
  }
  const invoke = call ?? client.call;
  return invoke('eth_call', [{to: token.address, data: tokenCallData(TOKEN_SELECTORS[selector], holder)}, 'latest']);
}

export async function readTokenBalance({address, token, rpcUrl, expectChainId = '8453', fetchImpl, timeoutMs = 5000, headers} = {}) {
  const redacted = redactRpcUrl(rpcUrl);
  const readAt = new Date().toISOString();
  const asset = token?.asset || token?.symbol || null;
  if (!address) return {status: 'unavailable', reason: 'no_address_configured', address: null, rpc: redacted, read_at: readAt};
  if (typeof address !== 'string' || !ADDRESS_RE.test(address)) return {status: 'unavailable', reason: 'invalid_address', address, rpc: redacted, read_at: readAt};
  if (!rpcUrl) return {status: 'unavailable', reason: 'no_rpc_configured', address, rpc: null, read_at: readAt};
  if (!token || !isValidTokenAddress(token.address)) {
    return {status: 'unavailable', reason: 'invalid_token_address', address, rpc: redacted, token_address: token?.address ?? null, read_at: readAt};
  }

  let client;
  try {
    client = createReadOnlyRpc({url: rpcUrl, fetchImpl, timeoutMs, headers});
  } catch (error) {
    return {status: 'unavailable', reason: error.code || 'invalid_rpc_url', address, rpc: redacted, detail: error.message, read_at: readAt};
  }

  let chainId;
  try {
    chainId = parseHexQuantity(await client.call('eth_chainId'), 'eth_chainId').toString();
  } catch (error) {
    return {status: 'unavailable', reason: error.code || 'onchain_unavailable', address, rpc: redacted, detail: error.message, read_at: readAt};
  }
  if (String(expectChainId) !== chainId) {
    // A balance read on the wrong chain is worse than no number at all.
    return {status: 'unavailable', reason: 'chain_mismatch', address, rpc: redacted, chain_id: chainId, expected_chain_id: String(expectChainId), read_at: readAt};
  }

  try {
    const [balanceHex, decimalsHex, blockNumberHex] = await client.batch([
      {method: 'eth_call', params: [{to: token.address, data: tokenCallData(TOKEN_SELECTORS.balanceOf, address)}, 'latest']},
      {method: 'eth_call', params: [{to: token.address, data: TOKEN_SELECTORS.decimals}, 'latest']},
      {method: 'eth_blockNumber', params: []},
    ]);
    if (typeof balanceHex !== 'string' || balanceHex.length > 66) {
      throw new WalletError('invalid_rpc_result', 'balanceOf must be a hex quantity of at most 32 bytes');
    }
    if (typeof decimalsHex !== 'string' || decimalsHex.length > 66 || decimalsHex === '0x') {
      return {status: 'unavailable', reason: 'token_decimals_unreadable', address, rpc: redacted, token_address: token.address, chain_id: chainId, read_at: readAt};
    }
    const units = parseHexQuantity(balanceHex, 'balanceOf');
    const decimals = Number(parseHexQuantity(decimalsHex, 'decimals'));
    if (!Number.isInteger(decimals) || decimals <= 0 || decimals > 36) {
      return {status: 'unavailable', reason: 'token_decimals_unreadable', address, rpc: redacted, token_address: token.address, chain_id: chainId, read_at: readAt};
    }
    const blockNumber = parseHexQuantity(blockNumberHex, 'eth_blockNumber');
    return {
      status: 'ok',
      asset,
      address,
      token_address: token.address,
      rpc: redacted,
      chain_id: chainId,
      block_number: blockNumber.toString(),
      decimals,
      units: units.toString(),
      amount: formatUnits(units, decimals),
      balance_source: 'onchain_rpc',
      read_at: readAt,
    };
  } catch (error) {
    return {status: 'unavailable', reason: error.code || 'onchain_unavailable', address, rpc: redacted, token_address: token.address, chain_id: chainId, detail: error.message, read_at: readAt};
  }
}
