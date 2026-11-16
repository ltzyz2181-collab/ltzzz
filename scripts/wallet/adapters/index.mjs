// Payment-rail adapter registry (P0).
//
// P0 deliberately permits read-only adapters only. Registering a write
// capability is rejected, and settlement/charge dispatch is not adapted at all
// yet. This module never writes to the ledger itself, so an unimplemented rail
// is rejected before any state change can occur.
import {WalletError} from '../core.mjs';

export const READ_ONLY_CAPABILITIES = Object.freeze(['getBalance', 'quote', 'getStatus']);
export const WRITE_CAPABILITIES = Object.freeze(['charge', 'settle', 'refund']);
export const ADAPTER_CAPABILITIES = Object.freeze([...READ_ONLY_CAPABILITIES, ...WRITE_CAPABILITIES]);

const RAIL_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const registry = new Map();

export function registerAdapter(rail, adapter) {
  if (typeof rail !== 'string' || !RAIL_RE.test(rail)) {
    throw new WalletError('invalid_rail', 'rail must be a lowercase slug', {rail});
  }
  if (!adapter || typeof adapter !== 'object') {
    throw new WalletError('invalid_adapter', 'adapter must be an object', {rail});
  }
  if (registry.has(rail)) throw new WalletError('adapter_exists', `adapter already registered: ${rail}`, {rail});

  const capabilities = adapter.capabilities;
  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    throw new WalletError('invalid_adapter', 'adapter must declare at least one capability', {rail});
  }
  for (const capability of capabilities) {
    if (!ADAPTER_CAPABILITIES.includes(capability)) {
      throw new WalletError('invalid_adapter', `unknown adapter capability: ${capability}`, {rail, capability});
    }
  }
  const writeCapabilities = capabilities.filter(capability => WRITE_CAPABILITIES.includes(capability));
  if (writeCapabilities.length > 0) {
    throw new WalletError(
      'adapter_write_not_permitted',
      `P0 permits read-only adapters only; ${rail} declared ${writeCapabilities.join(', ')}`,
      {rail, capabilities: writeCapabilities},
    );
  }
  for (const capability of capabilities) {
    if (typeof adapter[capability] !== 'function') {
      throw new WalletError('invalid_adapter', `capability ${capability} requires a method of the same name`, {rail, capability});
    }
  }

  const frozen = Object.freeze({
    ...adapter,
    rail,
    capabilities: Object.freeze([...capabilities]),
  });
  registry.set(rail, frozen);
  return frozen;
}

export function unregisterAdapter(rail) {
  return registry.delete(rail);
}

export function hasAdapter(rail) {
  return registry.has(rail);
}

export function listAdapters() {
  return [...registry.keys()].sort();
}

export function adapterStatus(rail) {
  const adapter = registry.get(rail);
  if (!adapter) return {rail, adapted: false, mode: 'not_adapted', capabilities: []};
  return {rail, adapted: true, mode: 'read_only', capabilities: [...adapter.capabilities]};
}

export function getAdapter(rail) {
  const adapter = registry.get(rail);
  if (!adapter) {
    throw new WalletError('not_adapted', `rail ${rail} is not adapted`, {rail, capability: '*'});
  }
  return adapter;
}

export function invokeAdapter(rail, capability, ...args) {
  const adapter = getAdapter(rail);
  if (!READ_ONLY_CAPABILITIES.includes(capability)) {
    throw new WalletError(
      'not_adapted',
      `capability ${capability} is not adapted in P0; write paths remain closed`,
      {rail, capability},
    );
  }
  if (!adapter.capabilities.includes(capability)) {
    throw new WalletError('not_adapted', `rail ${rail} does not implement ${capability}`, {rail, capability});
  }
  return adapter[capability](...args);
}

// These entry points exist so callers cannot mistake "no adapter" for success.
// They intentionally refuse before reading or writing the ledger.
export function attemptCharge({rail} = {}) {
  throw new WalletError('not_adapted', `rail ${rail ?? 'unknown'} is not adapted for charging`, {
    rail: rail ?? null,
    capability: 'charge',
  });
}

export function attemptSettlement({rail} = {}) {
  throw new WalletError('not_adapted', `rail ${rail ?? 'unknown'} is not adapted for settlement`, {
    rail: rail ?? null,
    capability: 'settle',
  });
}
