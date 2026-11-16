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
