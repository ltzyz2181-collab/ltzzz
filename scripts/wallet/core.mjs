// Append-only agent wallet ledger.
//
// Design invariants:
// - The ledger is the only source of truth; no mutable balance field exists.
// - Every line is a JSON record whose sha256 covers every field except `hash`.
// - Each record links to the previous record through `prevHash`.
// - Amounts are exact decimal strings (no floating point) and are folded with
//   BigInt units at 18 decimals.
// - Appends are serialized with an advisory lock and fsync'd before returning.
// - Any chain error makes appendEvent / deriveBalance refuse to act.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const LEDGER_SCHEMA_VERSION = 1;
export const GENESIS_PREV_HASH = '0'.repeat(64);
export const DEFAULT_ASSET = 'USDC';
export const DEFAULT_LEDGER_PATH = path.join(ROOT, 'agent-wallet', 'wallet', 'ledger.jsonl');
export const AMOUNT_DECIMALS = 18;

export const MONETARY_EVENT_TYPES = Object.freeze([
  'credit',
  'debit',
  'freeze',
  'unfreeze',
  'settle',
]);

export const SUBSCRIPTION_EVENT_TYPES = Object.freeze([
  'subscription.created',
  'subscription.updated',
  'subscription.paused',
  'subscription.resumed',
  'subscription.canceled',
  'subscription.deleted',
]);

export const EVENT_TYPES = Object.freeze([
  ...MONETARY_EVENT_TYPES,
  ...SUBSCRIPTION_EVENT_TYPES,
]);

const MONETARY = new Set(MONETARY_EVENT_TYPES);
const EVENT_TYPE_SET = new Set(EVENT_TYPES);
const UNIT = 10n ** BigInt(AMOUNT_DECIMALS);
const AMOUNT_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const ACCOUNT_RE = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,127}$/;
const ASSET_RE = /^[A-Za-z0-9._-]{1,32}$/;
const RAIL_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SUBSCRIPTION_ID_RE = /^sub_[A-Za-z0-9_-]{4,80}$/;

const BUSINESS_FIELDS = Object.freeze([
  'v',
  'type',
  'account',
  'asset',
  'amount',
  'rail',
  'reference',
  'memo',
  'meta',
  'subscriptionId',
  'changes',
  'anchorAt',
  'interval',
  'plan',
  'providerRef',
]);

const ALLOWED_FIELDS = new Set([
  ...BUSINESS_FIELDS,
  'idempotencyKey',
  'at',
  'seq',
  'prevHash',
  'hash',
  'intentHash',
]);

const ASSIGNED_FIELDS = Object.freeze(['seq', 'prevHash', 'hash', 'intentHash']);

// Only these keys may appear inside `subscription.updated.changes`. Without
// this whitelist a directly appended event could smuggle `status`, flipping a
// canceled subscription back to active and bypassing updateSubscription().
const SUBSCRIPTION_CHANGE_FIELDS = Object.freeze([
  'amount',
  'asset',
  'rail',
  'interval',
  'anchorAt',
  'plan',
  'providerRef',
  'meta',
]);

export class WalletError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'WalletError';
    this.code = code;
    for (const [key, value] of Object.entries(details)) {
      if (key === 'code' || key === 'message' || key === 'name') continue;
      this[key] = value;
    }
  }
}

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// ---------- exact decimal arithmetic ----------

export function amountToUnits(value) {
  if (typeof value !== 'string') {
    throw new WalletError('invalid_amount', 'amount must be a decimal string, never a number or bigint');
  }
  const raw = value.trim();
  if (!AMOUNT_RE.test(raw)) throw new WalletError('invalid_amount', `invalid decimal amount: ${value}`);
  const [whole, fraction = ''] = raw.split('.');
  return BigInt(whole) * UNIT + BigInt(fraction.padEnd(AMOUNT_DECIMALS, '0'));
}

export function unitsToAmount(units) {
  if (typeof units !== 'bigint') throw new WalletError('invalid_amount', 'units must be a bigint');
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / UNIT;
  const fraction = (absolute % UNIT).toString().padStart(AMOUNT_DECIMALS, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function normalizeAmountString(value) {
  return unitsToAmount(amountToUnits(value));
}

// ---------- canonical JSON and hashing ----------

export function canonicalJson(value) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return JSON.stringify(value);
  if (type === 'number') {
    if (!Number.isFinite(value)) throw new WalletError('invalid_json', 'non-finite numbers are not allowed');
    return JSON.stringify(value);
  }
  if (type === 'bigint') throw new WalletError('invalid_json', 'bigint is not allowed in ledger records');
  if (Array.isArray(value)) {
    return `[${value.map(item => item === undefined ? 'null' : canonicalJson(item)).join(',')}]`;
  }
  if (type === 'object') {
    if (!isPlainObject(value)) throw new WalletError('invalid_json', 'only plain objects are allowed in ledger records');
    const keys = Object.keys(value).filter(key => value[key] !== undefined).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  throw new WalletError('invalid_json', `unsupported JSON type: ${type}`);
}

export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function hashEventRecord(event) {
  const rest = {...event};
  delete rest.hash;
  return sha256Hex(canonicalJson(rest));
}

function intentHashFor(event) {
  const picked = {};
  for (const field of BUSINESS_FIELDS) {
    if (event[field] !== undefined) picked[field] = event[field];
  }
  return sha256Hex(canonicalJson(picked));
}

// ---------- shared field validation ----------

export function requireString(value, field, options = {}) {
  const {pattern, max = 2000, optional = false} = options;
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined;
    throw new WalletError('invalid_event', `${field} is required`);
  }
  if (typeof value !== 'string') throw new WalletError('invalid_event', `${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) {
    if (optional) return undefined;
    throw new WalletError('invalid_event', `${field} must not be empty`);
  }
  if (trimmed.length > max) throw new WalletError('invalid_event', `${field} is too long`);
  if (pattern && !pattern.test(trimmed)) throw new WalletError('invalid_event', `${field} has an invalid format`);
  return trimmed;
}

export function normalizeTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new WalletError('invalid_timestamp', 'timestamp is not parseable');
  return date.toISOString();
}

// ---------- ledger location ----------

export function resolveLedgerPath(options = {}) {
  const explicit = options.ledgerPath ?? process.env.WALLET_LEDGER_PATH;
  return explicit ? path.resolve(explicit) : DEFAULT_LEDGER_PATH;
}

// ---------- event normalization ----------

export function normalizeEvent(input, options = {}) {
  if (!isPlainObject(input)) throw new WalletError('invalid_event', 'event must be a plain object');
  for (const key of Object.keys(input)) {
    if (!ALLOWED_FIELDS.has(key)) throw new WalletError('invalid_event', `unknown event field: ${key}`);
  }
  for (const field of ASSIGNED_FIELDS) {
    if (input[field] !== undefined) throw new WalletError('invalid_event', `${field} is assigned by the ledger`);
  }
  if (input.v !== undefined && input.v !== LEDGER_SCHEMA_VERSION) {
    throw new WalletError('invalid_event', 'unsupported ledger schema version');
  }
  if (!EVENT_TYPE_SET.has(input.type)) {
    throw new WalletError('invalid_event', `unknown event type: ${input.type}`);
  }

  const event = {
    v: LEDGER_SCHEMA_VERSION,
    type: input.type,
    account: requireString(input.account, 'account', {pattern: ACCOUNT_RE, max: 128}),
    idempotencyKey: requireString(input.idempotencyKey, 'idempotencyKey', {max: 256}),
    at: normalizeTimestamp(input.at ?? options.at ?? new Date()),
  };

  if (MONETARY.has(event.type)) {
    event.asset = requireString(input.asset ?? DEFAULT_ASSET, 'asset', {pattern: ASSET_RE, max: 32});
    event.amount = normalizeAmountString(requireString(input.amount, 'amount', {max: 64}));
    if (amountToUnits(event.amount) <= 0n) throw new WalletError('invalid_event', 'amount must be positive');
  }
  if (input.asset !== undefined && event.asset === undefined) {
    event.asset = requireString(input.asset, 'asset', {pattern: ASSET_RE, max: 32});
  }
  if (input.amount !== undefined && event.amount === undefined) {
    event.amount = normalizeAmountString(requireString(input.amount, 'amount', {max: 64}));
    if (amountToUnits(event.amount) <= 0n) throw new WalletError('invalid_event', 'amount must be positive');
  }

  for (const field of ['rail', 'reference', 'memo', 'subscriptionId', 'plan', 'providerRef']) {
    if (input[field] === undefined) continue;
    const pattern = field === 'rail' ? RAIL_RE : field === 'subscriptionId' ? SUBSCRIPTION_ID_RE : undefined;
    const max = field === 'memo' ? 2000 : field === 'subscriptionId' ? 84 : 256;
    event[field] = requireString(input[field], field, {pattern, max});
  }
  if (input.anchorAt !== undefined) event.anchorAt = normalizeTimestamp(input.anchorAt);
  if (input.interval !== undefined) {
    if (typeof input.interval !== 'string' && !isPlainObject(input.interval)) {
      throw new WalletError('invalid_event', 'interval must be a string or a plain object');
    }
    canonicalJson(input.interval);
    event.interval = input.interval;
  }
  if (input.changes !== undefined) {
    if (!isPlainObject(input.changes) || Object.keys(input.changes).length === 0) {
      throw new WalletError('invalid_event', 'changes must be a non-empty plain object');
    }
    const changes = {};
    for (const [key, value] of Object.entries(input.changes)) {
      if (!SUBSCRIPTION_CHANGE_FIELDS.includes(key)) {
        throw new WalletError('invalid_event', `unsupported subscription change field: ${key}`);
      }
      switch (key) {
        case 'amount': {
          const amount = normalizeAmountString(requireString(value, 'changes.amount', {max: 64}));
          if (amountToUnits(amount) <= 0n) throw new WalletError('invalid_event', 'changes.amount must be positive');
          changes.amount = amount;
          break;
        }
        case 'asset':
          changes.asset = requireString(value, 'changes.asset', {pattern: ASSET_RE, max: 32});
          break;
        case 'rail':
          changes.rail = requireString(value, 'changes.rail', {pattern: RAIL_RE, max: 64});
          break;
        case 'anchorAt':
          changes.anchorAt = normalizeTimestamp(value);
          break;
        case 'interval':
          if (typeof value !== 'string' && !isPlainObject(value)) {
            throw new WalletError('invalid_event', 'changes.interval must be a string or a plain object');
          }
          canonicalJson(value);
          changes.interval = value;
          break;
        case 'plan':
        case 'providerRef':
          changes[key] = value === null
            ? null
            : requireString(value, `changes.${key}`, {max: key === 'plan' ? 128 : 256});
          break;
        case 'meta':
          if (value !== null && !isPlainObject(value)) {
            throw new WalletError('invalid_event', 'changes.meta must be a plain object or null');
          }
          if (value !== null) canonicalJson(value);
          changes.meta = value;
          break;
        default:
          throw new WalletError('invalid_event', `unsupported subscription change field: ${key}`);
      }
    }
    event.changes = changes;
  }
  if (input.meta !== undefined) {
    if (!isPlainObject(input.meta)) throw new WalletError('invalid_event', 'meta must be a plain object');
    canonicalJson(input.meta);
    event.meta = input.meta;
  }

  if (event.type.startsWith('subscription.') && !event.subscriptionId) {
    throw new WalletError('invalid_event', `${event.type} requires subscriptionId`);
  }
  if (event.type === 'subscription.created') {
    for (const field of ['rail', 'asset', 'amount', 'interval', 'anchorAt']) {
      if (event[field] === undefined) throw new WalletError('invalid_event', `subscription.created requires ${field}`);
    }
  }
  if (event.type === 'subscription.updated' && !event.changes) {
    throw new WalletError('invalid_event', 'subscription.updated requires changes');
  }

  event.intentHash = intentHashFor(event);
  return event;
}

// ---------- ledger loading and verification ----------

export function loadLedger(options = {}) {
  const file = resolveLedgerPath(options);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {file, exists: false, raw: '', bytes: 0, records: [], events: [], errors: []};
    }
    return {
      file,
      exists: false,
      raw: '',
      bytes: 0,
      records: [],
      events: [],
      errors: [{line: 0, code: 'ledger_unreadable', message: error.message}],
    };
  }

  const lines = raw.length === 0 ? [] : raw.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const records = [];
  const errors = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    if (line.trim() === '') {
      const error = {line: lineNumber, code: 'blank_line', message: 'ledger contains a blank line'};
      errors.push(error);
      records.push({line: lineNumber, raw: line, error});
      continue;
    }
    try {
      const event = JSON.parse(line);
      if (!isPlainObject(event)) throw new WalletError('invalid_schema', 'ledger record must be a plain object');
      records.push({line: lineNumber, raw: line, event});
    } catch (error) {
      const normalized = {line: lineNumber, code: error.code || 'invalid_json', message: error.message};
      errors.push(normalized);
      records.push({line: lineNumber, raw: line, error: normalized});
    }
  }
  return {
    file,
    exists: true,
    raw,
    bytes: Buffer.byteLength(raw, 'utf8'),
    records,
    events: records.filter(record => record.event).map(record => record.event),
    errors,
  };
}

function validateStoredEvent(event) {
  const errors = [];
  const fail = (code, message) => errors.push({code, message});
  if (event.v !== LEDGER_SCHEMA_VERSION) fail('invalid_schema', `unsupported version: ${event.v}`);
  if (!EVENT_TYPE_SET.has(event.type)) fail('invalid_schema', `unknown event type: ${event.type}`);
  if (typeof event.account !== 'string' || !ACCOUNT_RE.test(event.account)) fail('invalid_schema', 'invalid account');
  if (typeof event.idempotencyKey !== 'string' || !event.idempotencyKey || event.idempotencyKey.length > 256) {
    fail('invalid_schema', 'invalid idempotencyKey');
  }
  if (typeof event.at !== 'string' || Number.isNaN(Date.parse(event.at))) fail('invalid_schema', 'invalid at');
  if (MONETARY.has(event.type)) {
    if (typeof event.asset !== 'string' || !ASSET_RE.test(event.asset)) fail('invalid_schema', 'invalid asset');
    try {
      if (amountToUnits(event.amount) <= 0n) fail('invalid_schema', 'amount must be positive');
    } catch (error) {
      fail('invalid_schema', error.message);
    }
  } else if (event.amount !== undefined) {
    try {
      if (amountToUnits(event.amount) <= 0n) fail('invalid_schema', 'amount must be positive');
    } catch (error) {
      fail('invalid_schema', error.message);
    }
  }
  if (event.type.startsWith('subscription.')) {
    if (typeof event.subscriptionId !== 'string' || !SUBSCRIPTION_ID_RE.test(event.subscriptionId)) {
      fail('invalid_schema', 'invalid subscriptionId');
    }
  }
  if (event.type === 'subscription.updated' && !isPlainObject(event.changes)) {
    fail('invalid_schema', 'changes must be a plain object');
  }
  for (const key of Object.keys(event)) {
    if (!ALLOWED_FIELDS.has(key)) fail('invalid_schema', `unknown field: ${key}`);
  }
  return errors;
}

export function verifyLedger(load, options = {}) {
  const errors = [...(load.errors || [])];
  const seenKeys = new Map();
  let lastHash = null;
  let head = null;
  const records = load.records || [];

  records.forEach((record, index) => {
    if (record.error) {
      lastHash = null;
      return;
    }
    const event = record.event;
    const line = record.line;
    if (event.seq !== index) {
      errors.push({line, code: 'seq_mismatch', message: `expected seq ${index}, found ${event.seq}`});
    }
    const expectedPrev = index === 0 ? GENESIS_PREV_HASH : lastHash;
    if (expectedPrev !== null && event.prevHash !== expectedPrev) {
      errors.push({line, code: 'prev_hash_mismatch', message: 'prevHash does not match the previous record hash'});
    }
    for (const error of validateStoredEvent(event)) errors.push({line, ...error});

    const hashIsValid = typeof event.hash === 'string' && HASH_RE.test(event.hash);
    if (!hashIsValid) {
      errors.push({line, code: 'invalid_hash_format', message: 'hash must be 64 lowercase hexadecimal characters'});
    } else {
      let computed = null;
      try {
        computed = hashEventRecord(event);
      } catch (error) {
        errors.push({line, code: 'invalid_schema', message: error.message});
      }
      if (computed !== null && computed !== event.hash) {
        errors.push({line, code: 'hash_mismatch', message: 'record hash does not match its content'});
      }
    }

    if (typeof event.idempotencyKey === 'string' && event.idempotencyKey) {
      if (seenKeys.has(event.idempotencyKey)) {
        errors.push({
          line,
          code: 'duplicate_idempotency_key',
          message: `idempotencyKey first appeared on line ${seenKeys.get(event.idempotencyKey)}`,
        });
      } else {
        seenKeys.set(event.idempotencyKey, line);
      }
    }

    lastHash = hashIsValid ? event.hash : null;
    head = lastHash;
  });

  if (options.expectedHead !== undefined && options.expectedHead !== null && head !== options.expectedHead) {
    errors.push({line: records.length, code: 'head_mismatch', message: 'chain head does not match the expected head'});
  }

  return {
    ok: errors.length === 0,
    errors,
    count: records.length,
    head,
    file: load.file,
    exists: load.exists,
    fileBytes: load.bytes,
    fileSha256: load.exists ? sha256Hex(load.raw) : null,
  };
}

export function verifyChain(options = {}) {
  return verifyLedger(loadLedger(options), options);
}

export function readEvents(options = {}) {
  const load = loadLedger(options);
  const chain = verifyLedger(load, options);
  if (!chain.ok) {
    throw new WalletError('ledger_corrupt', 'ledger failed chain verification', {
      errors: chain.errors,
      file: chain.file,
    });
  }
  return load.events;
}

export function assertChainValid(options = {}) {
  const chain = verifyChain(options);
  if (!chain.ok) {
    throw new WalletError('ledger_corrupt', 'ledger failed chain verification', {
      errors: chain.errors,
      file: chain.file,
    });
  }
  return chain;
}

// ---------- balance folding ----------

function emptyAssetState(asset, seq) {
  return {
    asset,
    net: 0n,
    frozen: 0n,
    credited: 0n,
    debited: 0n,
    frozenIn: 0n,
    frozenOut: 0n,
    settled: 0n,
    events: 0,
    firstSeq: seq,
    lastSeq: seq,
  };
}

export function foldBalances(events) {
  const accounts = new Map();
  const violations = [];

  for (const event of events) {
    if (!event || typeof event.account !== 'string') continue;
    let account = accounts.get(event.account);
    if (!account) {
      account = {account: event.account, byAsset: new Map(), events: 0, monetaryEvents: 0};
      accounts.set(event.account, account);
    }
    account.events += 1;
    if (!MONETARY.has(event.type)) continue;
    account.monetaryEvents += 1;

    let state = account.byAsset.get(event.asset);
    if (!state) {
      state = emptyAssetState(event.asset, event.seq);
      account.byAsset.set(event.asset, state);
    }
    state.events += 1;
    state.lastSeq = event.seq;

    const amount = amountToUnits(event.amount);
    const availableBefore = state.net - state.frozen;
    switch (event.type) {
      case 'credit':
        state.net += amount;
        state.credited += amount;
        break;
      case 'debit':
        if (amount > availableBefore) {
          violations.push({seq: event.seq, account: event.account, asset: event.asset, type: event.type, code: 'insufficient_available', amount: event.amount, message: 'debit exceeds available balance'});
        }
        state.net -= amount;
        state.debited += amount;
        break;
      case 'freeze':
        if (amount > availableBefore) {
          violations.push({seq: event.seq, account: event.account, asset: event.asset, type: event.type, code: 'insufficient_available', amount: event.amount, message: 'freeze exceeds available balance'});
        }
        state.frozen += amount;
        state.frozenIn += amount;
        break;
      case 'unfreeze':
        if (amount > state.frozen) {
          violations.push({seq: event.seq, account: event.account, asset: event.asset, type: event.type, code: 'insufficient_frozen', amount: event.amount, message: 'unfreeze exceeds frozen balance'});
        }
        state.frozen -= amount;
        state.frozenOut += amount;
        break;
      case 'settle':
        if (amount > state.frozen) {
          violations.push({seq: event.seq, account: event.account, asset: event.asset, type: event.type, code: 'insufficient_frozen', amount: event.amount, message: 'settle exceeds frozen balance'});
        }
        state.frozen -= amount;
        state.net -= amount;
        state.settled += amount;
        break;
      default:
        break;
    }
  }

  return {accounts, violations};
}

export function aggregateMonetaryTotals(events) {
  const accounts = new Map();
  for (const event of events) {
    if (!MONETARY.has(event.type)) continue;
    if (!accounts.has(event.account)) accounts.set(event.account, new Map());
    const byAsset = accounts.get(event.account);
    if (!byAsset.has(event.asset)) {
      byAsset.set(event.asset, {credited: 0n, debited: 0n, frozenIn: 0n, frozenOut: 0n, settled: 0n, count: 0});
    }
    const totals = byAsset.get(event.asset);
    const amount = amountToUnits(event.amount);
    totals.count += 1;
    switch (event.type) {
      case 'credit': totals.credited += amount; break;
      case 'debit': totals.debited += amount; break;
      case 'freeze': totals.frozenIn += amount; break;
      case 'unfreeze': totals.frozenOut += amount; break;
      case 'settle': totals.settled += amount; break;
      default: break;
    }
  }
  return accounts;
}

function materializeAssetState(state) {
  return {
    asset: state.asset,
    net: unitsToAmount(state.net),
    frozen: unitsToAmount(state.frozen),
    available: unitsToAmount(state.net - state.frozen),
    credited: unitsToAmount(state.credited),
    debited: unitsToAmount(state.debited),
    frozen_in: unitsToAmount(state.frozenIn),
    frozen_out: unitsToAmount(state.frozenOut),
    settled: unitsToAmount(state.settled),
    events: state.events,
    first_seq: state.firstSeq,
    last_seq: state.lastSeq,
  };
}

function pickBalanceFields(state) {
  return {
    net: state.net,
    frozen: state.frozen,
    available: state.available,
    credited: state.credited,
    debited: state.debited,
    settled: state.settled,
  };
}

export function deriveBalance(account, options = {}) {
  if (typeof account !== 'string' || !ACCOUNT_RE.test(account)) {
    throw new WalletError('invalid_account', 'account is invalid');
  }
  const load = loadLedger(options);
  const chain = verifyLedger(load, options);
  if (!chain.ok) {
    throw new WalletError('ledger_corrupt', 'ledger failed chain verification', {
      errors: chain.errors,
      file: chain.file,
    });
  }
  const folded = foldBalances(load.events);
  const accountState = folded.accounts.get(account) ?? {
    account,
    byAsset: new Map(),
    events: 0,
    monetaryEvents: 0,
  };
  const byAsset = {};
  for (const [asset, state] of accountState.byAsset) byAsset[asset] = materializeAssetState(state);
  const assets = Object.keys(byAsset).sort();
  const violations = folded.violations.filter(violation => violation.account === account);

  const result = {
    account,
    assets,
    byAsset,
    events: accountState.events,
    monetary_events: accountState.monetaryEvents,
    violations,
    ok: violations.length === 0,
    chain: {ok: chain.ok, count: chain.count, head: chain.head, file: chain.file},
  };

  if (options.asset !== undefined && options.asset !== null) {
    const asset = String(options.asset);
    const state = byAsset[asset] ?? materializeAssetState(emptyAssetState(asset, null));
    return {...result, asset, ...pickBalanceFields(state)};
  }
  if (assets.length === 1) {
    const asset = assets[0];
    return {...result, asset, ...pickBalanceFields(byAsset[asset])};
  }
  if (assets.length === 0) {
    return {...result, asset: null, net: '0', frozen: '0', available: '0', mixed_assets: false};
  }
  return {...result, asset: null, net: null, frozen: null, available: null, mixed_assets: true};
}

export function listAccounts(options = {}) {
  const events = readEvents(options);
  return [...foldBalances(events).accounts.keys()].sort();
}

// ---------- append ----------

function assertEffectAllowed(event, folded) {
  if (!MONETARY.has(event.type)) return;
  const account = folded.accounts.get(event.account);
  const state = account?.byAsset.get(event.asset) ?? {net: 0n, frozen: 0n};
  const amount = amountToUnits(event.amount);
  const available = state.net - state.frozen;
  if ((event.type === 'debit' || event.type === 'freeze') && amount > available) {
    throw new WalletError('insufficient_available', `${event.type} exceeds available balance`, {
      account: event.account,
      asset: event.asset,
      available: unitsToAmount(available),
      requested: event.amount,
    });
  }
  if ((event.type === 'unfreeze' || event.type === 'settle') && amount > state.frozen) {
    throw new WalletError('insufficient_frozen', `${event.type} exceeds frozen balance`, {
      account: event.account,
      asset: event.asset,
      frozen: unitsToAmount(state.frozen),
      requested: event.amount,
    });
  }
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function isProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function acquireLedgerLock(ledgerPath, options = {}) {
  const lockPath = `${ledgerPath}.lock`;
  fs.mkdirSync(path.dirname(ledgerPath), {recursive: true, mode: 0o700});
  const timeoutMs = Number.isFinite(options.lockTimeoutMs) ? options.lockTimeoutMs : 5000;
  const staleMs = Number.isFinite(options.lockStaleMs) ? options.lockStaleMs : 30000;
  const started = Date.now();

  for (;;) {
    try {
      const fd = fs.openSync(lockPath, 'wx', 0o600);
      try {
        fs.writeSync(fd, canonicalJson({pid: process.pid, at: new Date().toISOString()}));
      } finally {
        fs.closeSync(fd);
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        try { fs.unlinkSync(lockPath); } catch {}
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let stale = false;
      try {
        const stat = fs.statSync(lockPath);
        const age = Date.now() - stat.mtimeMs;
        let owner = null;
        try { owner = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch {}
        if (age > staleMs && !isProcessAlive(owner?.pid)) stale = true;
      } catch {}
      if (stale) {
        try { fs.unlinkSync(lockPath); } catch {}
        continue;
      }
      if (Date.now() - started >= timeoutMs) {
        throw new WalletError('ledger_locked', 'ledger is locked by another writer', {lockPath});
      }
      sleepSync(10);
    }
  }
}

export function appendEvent(input, options = {}) {
  const ledgerPath = resolveLedgerPath(options);
  const event = normalizeEvent(input, options);
  const release = acquireLedgerLock(ledgerPath, options);

  try {
    const load = loadLedger({ledgerPath});
    const chain = verifyLedger(load);
    if (!chain.ok) {
      throw new WalletError('ledger_corrupt', 'refusing to append to an invalid ledger', {
        errors: chain.errors,
        file: chain.file,
      });
    }

    for (const existing of load.events) {
      if (existing.idempotencyKey !== event.idempotencyKey) continue;
      const existingIntent = typeof existing.intentHash === 'string' ? existing.intentHash : intentHashFor(existing);
      if (existingIntent === event.intentHash) {
        return {
          event: existing,
          appended: false,
          duplicate: true,
          chain: {ok: true, count: chain.count, head: chain.head},
        };
      }
      throw new WalletError('idempotency_conflict', 'idempotencyKey was already used with a different event', {
        idempotencyKey: event.idempotencyKey,
        existingSeq: existing.seq,
      });
    }

    const folded = foldBalances(load.events);
    assertEffectAllowed(event, folded);

    const seq = load.events.length;
    const prevHash = seq === 0 ? GENESIS_PREV_HASH : load.events[seq - 1].hash;
    const body = {...event, seq, prevHash};
    const stored = {...body, hash: hashEventRecord(body)};

    if (options.dryRun) {
      return {
        event: stored,
        appended: false,
        duplicate: false,
        dryRun: true,
        chain: {ok: true, count: chain.count, head: chain.head},
      };
    }

    const line = `${canonicalJson(stored)}\n`;
    const fd = fs.openSync(ledgerPath, 'a', 0o600);
    try {
      fs.writeSync(fd, line);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    return {
      event: stored,
      appended: true,
      duplicate: false,
      chain: {ok: true, count: chain.count + 1, head: stored.hash},
    };
  } finally {
    release();
  }
}
