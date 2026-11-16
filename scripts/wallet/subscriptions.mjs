// Event-sourced subscription CRUD.
//
// Subscription state is never stored in a mutable side file. Every mutation is
// an append-only ledger event, and the current record is folded from those
// events. `next_charge` is derived at read time from an injected clock, so
// tests and audits can pin time instead of relying on wall-clock rounding.
import {createHash} from 'node:crypto';
import {
  DEFAULT_ASSET,
  WalletError,
  amountToUnits,
  appendEvent,
  isPlainObject,
  normalizeAmountString,
  normalizeTimestamp,
  readEvents,
  requireString,
} from './core.mjs';
import {hasAdapter} from './adapters/index.mjs';

const SUBSCRIPTION_ID_RE = /^sub_[A-Za-z0-9_-]{4,80}$/;
const ACCOUNT_RE = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,127}$/;
const ASSET_RE = /^[A-Za-z0-9._-]{1,32}$/;
const RAIL_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const INTERNAL_RAIL = 'internal';

const UNIT_ALIASES = new Map([
  ['s', 'second'], ['sec', 'second'], ['second', 'second'], ['seconds', 'second'],
  ['h', 'hour'], ['hour', 'hour'], ['hours', 'hour'],
  ['d', 'day'], ['day', 'day'], ['days', 'day'],
  ['w', 'week'], ['week', 'week'], ['weeks', 'week'],
  ['mo', 'month'], ['month', 'month'], ['months', 'month'],
  ['y', 'year'], ['year', 'year'], ['years', 'year'],
]);

function intervalFromUnit(unit, count) {
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new WalletError('invalid_interval', 'interval count must be a positive integer');
  }
  switch (unit) {
    case 'second': return {kind: 'seconds', seconds: count};
    case 'hour': return {kind: 'seconds', seconds: 3600 * count};
    case 'day': return {kind: 'seconds', seconds: 86400 * count};
    case 'week': return {kind: 'seconds', seconds: 604800 * count};
    case 'month': return {kind: 'calendar', unit: 'month', count};
    case 'year': return {kind: 'calendar', unit: 'year', count};
    default: throw new WalletError('invalid_interval', `unsupported interval unit: ${unit}`);
  }
}

export function normalizeInterval(input) {
  if (typeof input === 'number') {
    if (!Number.isSafeInteger(input) || input <= 0) {
      throw new WalletError('invalid_interval', 'numeric interval must be positive whole seconds');
    }
    return {kind: 'seconds', seconds: input};
  }
  if (isPlainObject(input)) {
    if (input.kind === 'seconds') {
      if (!Number.isSafeInteger(input.seconds) || input.seconds <= 0) {
        throw new WalletError('invalid_interval', 'seconds interval must be a positive integer');
      }
      return {kind: 'seconds', seconds: input.seconds};
    }
    if (input.kind === 'calendar') {
      if (!['month', 'year'].includes(input.unit) || !Number.isSafeInteger(input.count) || input.count <= 0) {
        throw new WalletError('invalid_interval', 'calendar interval must be {kind:"calendar",unit:"month"|"year",count>0}');
      }
      return {kind: 'calendar', unit: input.unit, count: input.count};
    }
    const unit = UNIT_ALIASES.get(String(input.unit ?? '').toLowerCase());
    if (!unit) throw new WalletError('invalid_interval', `unsupported interval unit: ${input.unit}`);
    return intervalFromUnit(unit, input.count ?? 1);
  }
  if (typeof input === 'string') {
    const value = input.trim().toLowerCase();
    if (/^\d+$/.test(value)) return intervalFromUnit('second', Number(value));
    if (value === 'hourly') return intervalFromUnit('hour', 1);
    if (value === 'daily') return intervalFromUnit('day', 1);
    if (value === 'weekly') return intervalFromUnit('week', 1);
    if (value === 'monthly') return intervalFromUnit('month', 1);
    if (value === 'yearly' || value === 'annually') return intervalFromUnit('year', 1);
    const compact = /^(\d+)(h|d|w|mo|y)$/.exec(value);
    if (compact) return intervalFromUnit(UNIT_ALIASES.get(compact[2]), Number(compact[1]));
    throw new WalletError('invalid_interval', `unsupported interval: ${input}`);
  }
  throw new WalletError('invalid_interval', 'interval must be seconds, a string, or {unit,count}');
}

function addMonthsClamped(anchor, months) {
  const target = new Date(Date.UTC(
    anchor.getUTCFullYear(),
    anchor.getUTCMonth() + months,
    1,
    anchor.getUTCHours(),
    anchor.getUTCMinutes(),
    anchor.getUTCSeconds(),
    anchor.getUTCMilliseconds(),
  ));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
  return target;
}

// Returns the next charge strictly after `from`, or null when the subscription
// is not active. The returned value is always an ISO UTC timestamp.
export function computeNextCharge(subscription, from = new Date()) {
  if (!subscription || subscription.status !== 'active') return null;
  const anchor = new Date(subscription.anchorAt);
  if (Number.isNaN(anchor.getTime())) throw new WalletError('invalid_subscription', 'anchorAt is not a valid timestamp');
  const fromDate = from instanceof Date ? from : new Date(from);
  if (Number.isNaN(fromDate.getTime())) throw new WalletError('invalid_timestamp', 'from is not a valid timestamp');
  const interval = normalizeInterval(subscription.interval);

  if (interval.kind === 'seconds') {
    const stepMs = interval.seconds * 1000;
    if (anchor.getTime() > fromDate.getTime()) return anchor.toISOString();
    const steps = Math.floor((fromDate.getTime() - anchor.getTime()) / stepMs) + 1;
    return new Date(anchor.getTime() + steps * stepMs).toISOString();
  }

  const stepMonths = (interval.unit === 'year' ? 12 : 1) * interval.count;
  const monthDistance = (fromDate.getUTCFullYear() - anchor.getUTCFullYear()) * 12
    + (fromDate.getUTCMonth() - anchor.getUTCMonth());
  let step = Math.max(0, Math.floor(monthDistance / stepMonths) - 1);
  let candidate = addMonthsClamped(anchor, step * stepMonths);
  let guard = 0;
  while (candidate.getTime() <= fromDate.getTime()) {
    step += 1;
    candidate = addMonthsClamped(anchor, step * stepMonths);
    guard += 1;
    if (guard > 10000) throw new WalletError('invalid_interval', 'calendar interval did not converge');
  }
  return candidate.toISOString();
}

export function subscriptionIdFor(account, idempotencyKey) {
  const digest = createHash('sha256').update(`${account}\n${idempotencyKey}`).digest('hex').slice(0, 24);
  return `sub_${digest}`;
}

function assertRailAllowed(rail) {
  if (rail === INTERNAL_RAIL) return;
  if (!hasAdapter(rail)) throw new WalletError('not_adapted', `rail ${rail} is not adapted`, {rail});
}

function requireId(value) {
  return requireString(value, 'id', {pattern: SUBSCRIPTION_ID_RE, max: 84});
}

function requireKey(value) {
  return requireString(value, 'idempotencyKey', {max: 256});
}

function readLedger(options) {
  return readEvents({ledgerPath: options.ledgerPath});
}

function adapterStatusFor(rail) {
  if (rail === INTERNAL_RAIL) return 'internal_ledger';
  return hasAdapter(rail) ? 'registered' : 'not_adapted';
}

function materialize(subscription, asOf) {
  const at = normalizeTimestamp(asOf ?? new Date());
  return {
    ...subscription,
    adapter_status: adapterStatusFor(subscription.rail),
    next_charge: computeNextCharge(subscription, at),
    next_charge_as_of: at,
  };
}

export function foldSubscriptions(events) {
  const subscriptions = new Map();
  for (const event of events) {
    if (typeof event?.type !== 'string' || !event.type.startsWith('subscription.')) continue;
    const id = event.subscriptionId;
    if (!id) continue;

    if (event.type === 'subscription.created') {
      subscriptions.set(id, {
        id,
        account: event.account,
        rail: event.rail,
        asset: event.asset,
        amount: event.amount,
        interval: event.interval,
        anchorAt: event.anchorAt,
        plan: event.plan ?? null,
        providerRef: event.providerRef ?? null,
        meta: event.meta ?? null,
        status: 'active',
        created_at: event.at,
        updated_at: event.at,
        created_idempotency_key: event.idempotencyKey,
        version: 1,
        event_count: 1,
        history: [event.seq],
      });
      continue;
    }

    const current = subscriptions.get(id);
    if (!current) continue;
    switch (event.type) {
      case 'subscription.updated':
        for (const [key, value] of Object.entries(event.changes || {})) current[key] = value;
        current.updated_at = event.at;
        break;
      case 'subscription.paused':
        current.status = 'paused';
        current.paused_at = event.at;
        current.updated_at = event.at;
        break;
      case 'subscription.resumed':
        current.status = 'active';
        current.resumed_at = event.at;
        current.updated_at = event.at;
        break;
      case 'subscription.canceled':
        current.status = 'canceled';
        current.canceled_at = event.at;
        current.updated_at = event.at;
        break;
      case 'subscription.deleted':
        current.status = 'deleted';
        current.deleted_at = event.at;
        current.updated_at = event.at;
        break;
      default:
        continue;
    }
    current.version += 1;
    current.event_count += 1;
    current.history.push(event.seq);
  }
  return subscriptions;
}

export function getSubscription(id, options = {}) {
  const subscriptionId = requireId(id);
  const subscription = foldSubscriptions(readLedger(options)).get(subscriptionId);
  if (!subscription) return null;
  if (subscription.status === 'deleted' && !options.includeDeleted) return null;
  return materialize(subscription, options.asOf);
}

export function listSubscriptions(options = {}) {
  const list = [...foldSubscriptions(readLedger(options)).values()];
  return list
    .filter(subscription => options.includeDeleted || subscription.status !== 'deleted')
    .filter(subscription => !options.account || subscription.account === options.account)
    .filter(subscription => !options.status || subscription.status === options.status)
    .map(subscription => materialize(subscription, options.asOf))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function createSubscription(input, options = {}) {
  if (!isPlainObject(input)) throw new WalletError('invalid_subscription', 'subscription input must be a plain object');
  const ledgerOptions = {ledgerPath: options.ledgerPath};
  const idempotencyKey = requireKey(options.idempotencyKey ?? input.idempotencyKey);
  const account = requireString(input.account, 'account', {pattern: ACCOUNT_RE, max: 128});
  const rail = requireString(input.rail, 'rail', {pattern: RAIL_RE, max: 64});
  assertRailAllowed(rail);
  const amount = normalizeAmountString(requireString(input.amount, 'amount', {max: 64}));
  if (amountToUnits(amount) <= 0n) throw new WalletError('invalid_amount', 'subscription amount must be positive');
  const asset = input.asset === undefined
    ? DEFAULT_ASSET
    : requireString(input.asset, 'asset', {pattern: ASSET_RE, max: 32});
  const interval = normalizeInterval(input.interval);
  const at = normalizeTimestamp(options.at ?? input.at ?? new Date());
  const anchorAt = normalizeTimestamp(input.anchorAt ?? at);
  const id = input.id === undefined
    ? subscriptionIdFor(account, idempotencyKey)
    : requireId(input.id);

  const priorCreate = readLedger(ledgerOptions)
    .find(event => event.type === 'subscription.created' && event.idempotencyKey === idempotencyKey);
  if (priorCreate && priorCreate.subscriptionId !== id) {
    throw new WalletError('idempotency_conflict', 'idempotencyKey already created a different subscription', {
      idempotencyKey,
      existingSubscriptionId: priorCreate.subscriptionId,
    });
  }
  if (!priorCreate && getSubscription(id, {...ledgerOptions, includeDeleted: true})) {
    throw new WalletError('subscription_exists', `subscription ${id} already exists`, {subscriptionId: id});
  }

  const event = {
    type: 'subscription.created',
    account,
    subscriptionId: id,
    rail,
    asset,
    amount,
    interval,
    anchorAt,
    at,
    idempotencyKey,
  };
  if (input.plan !== undefined) event.plan = requireString(input.plan, 'plan', {max: 128});
  if (input.providerRef !== undefined) event.providerRef = requireString(input.providerRef, 'providerRef', {max: 256});
  if (input.meta !== undefined) {
    if (!isPlainObject(input.meta)) throw new WalletError('invalid_subscription', 'meta must be a plain object');
    event.meta = input.meta;
  }

  const result = appendEvent(event, ledgerOptions);
  return {
    subscription: getSubscription(id, {...ledgerOptions, asOf: options.asOf, includeDeleted: true}),
    event: result.event,
    appended: result.appended,
    duplicate: result.duplicate,
  };
}

export function updateSubscription(id, patch, options = {}) {
  const subscriptionId = requireId(id);
  const ledgerOptions = {ledgerPath: options.ledgerPath};
  const idempotencyKey = requireKey(options.idempotencyKey);
  const current = getSubscription(subscriptionId, {...ledgerOptions, includeDeleted: true});
  if (!current) throw new WalletError('subscription_not_found', `subscription ${subscriptionId} not found`, {subscriptionId});
  if (!['active', 'paused'].includes(current.status)) {
    throw new WalletError('invalid_transition', `cannot update a ${current.status} subscription`, {subscriptionId, status: current.status});
  }
  if (!isPlainObject(patch)) throw new WalletError('invalid_patch', 'patch must be a plain object');
  for (const key of Object.keys(patch)) {
    if (!['amount', 'asset', 'rail', 'interval', 'anchorAt', 'plan', 'providerRef', 'meta'].includes(key)) {
      throw new WalletError('invalid_patch', `unsupported patch field: ${key}`);
    }
  }

  const changes = {};
  if (patch.amount !== undefined) {
    changes.amount = normalizeAmountString(requireString(patch.amount, 'amount', {max: 64}));
    if (amountToUnits(changes.amount) <= 0n) throw new WalletError('invalid_amount', 'subscription amount must be positive');
  }
  if (patch.asset !== undefined) changes.asset = requireString(patch.asset, 'asset', {pattern: ASSET_RE, max: 32});
  if (patch.rail !== undefined) {
    changes.rail = requireString(patch.rail, 'rail', {pattern: RAIL_RE, max: 64});
    assertRailAllowed(changes.rail);
  }
  if (patch.interval !== undefined) changes.interval = normalizeInterval(patch.interval);
  if (patch.anchorAt !== undefined) changes.anchorAt = normalizeTimestamp(patch.anchorAt);
  if (patch.plan !== undefined) changes.plan = patch.plan === null ? null : requireString(patch.plan, 'plan', {max: 128});
  if (patch.providerRef !== undefined) {
    changes.providerRef = patch.providerRef === null ? null : requireString(patch.providerRef, 'providerRef', {max: 256});
  }
  if (patch.meta !== undefined) {
    if (patch.meta !== null && !isPlainObject(patch.meta)) throw new WalletError('invalid_patch', 'meta must be a plain object or null');
    changes.meta = patch.meta;
  }
  if (Object.keys(changes).length === 0) {
    return {subscription: current, event: null, appended: false, duplicate: false, reason: 'no_changes'};
  }

  const event = {
    type: 'subscription.updated',
    account: current.account,
    subscriptionId,
    changes,
    at: normalizeTimestamp(options.at ?? new Date()),
    idempotencyKey,
  };
  const result = appendEvent(event, ledgerOptions);
  return {
    subscription: getSubscription(subscriptionId, {...ledgerOptions, asOf: options.asOf}),
    event: result.event,
    appended: result.appended,
    duplicate: result.duplicate,
  };
}

function transition(id, targetType, targetStatus, options, label) {
  const subscriptionId = requireId(id);
  const ledgerOptions = {ledgerPath: options.ledgerPath};
  const idempotencyKey = requireKey(options.idempotencyKey);
  const current = getSubscription(subscriptionId, {...ledgerOptions, includeDeleted: true});
  if (!current) throw new WalletError('subscription_not_found', `subscription ${subscriptionId} not found`, {subscriptionId});
  if (current.status === targetStatus) {
    return {
      subscription: getSubscription(subscriptionId, {...ledgerOptions, asOf: options.asOf}),
      event: null,
      appended: false,
      duplicate: false,
      reason: `already_${targetStatus}`,
    };
  }
  if (current.status === 'canceled' || current.status === 'deleted') {
    throw new WalletError('invalid_transition', `cannot ${label} a ${current.status} subscription`, {subscriptionId, status: current.status});
  }

  const event = {
    type: targetType,
    account: current.account,
    subscriptionId,
    at: normalizeTimestamp(options.at ?? new Date()),
    idempotencyKey,
  };
  const result = appendEvent(event, ledgerOptions);
  return {
    subscription: getSubscription(subscriptionId, {...ledgerOptions, asOf: options.asOf}),
    event: result.event,
    appended: result.appended,
    duplicate: result.duplicate,
  };
}

export function pauseSubscription(id, options = {}) {
  return transition(id, 'subscription.paused', 'paused', options, 'pause');
}

export function resumeSubscription(id, options = {}) {
  return transition(id, 'subscription.resumed', 'active', options, 'resume');
}

export function cancelSubscription(id, options = {}) {
  return transition(id, 'subscription.canceled', 'canceled', options, 'cancel');
}

export function deleteSubscription(id, options = {}) {
  const subscriptionId = requireId(id);
  const ledgerOptions = {ledgerPath: options.ledgerPath};
  const idempotencyKey = requireKey(options.idempotencyKey);
  const current = getSubscription(subscriptionId, {...ledgerOptions, includeDeleted: true});
  if (!current) throw new WalletError('subscription_not_found', `subscription ${subscriptionId} not found`, {subscriptionId});
  if (current.status === 'deleted') {
    return {subscription: null, event: null, appended: false, duplicate: false, reason: 'already_deleted'};
  }

  const event = {
    type: 'subscription.deleted',
    account: current.account,
    subscriptionId,
    at: normalizeTimestamp(options.at ?? new Date()),
    idempotencyKey,
  };
  const result = appendEvent(event, ledgerOptions);
  return {subscription: null, event: result.event, appended: result.appended, duplicate: result.duplicate};
}
