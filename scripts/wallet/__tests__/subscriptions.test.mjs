import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {appendEvent, deriveBalance} from '../core.mjs';
import {
  cancelSubscription,
  computeNextCharge,
  createSubscription,
  deleteSubscription,
  getSubscription,
  listSubscriptions,
  normalizeInterval,
  pauseSubscription,
  resumeSubscription,
  updateSubscription,
} from '../subscriptions.mjs';

function tempLedger(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-wallet-subscription-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return path.join(dir, 'ledger.jsonl');
}

function ledgerLines(file) {
  return fs.readFileSync(file, 'utf8').trimEnd().split('\n');
}

test('subscription CRUD is event-sourced and next_charge is derived', t => {
  const ledgerPath = tempLedger(t);
  const at = '2026-01-31T00:00:00.000Z';
  const input = {
    account: 'agent:test',
    rail: 'internal',
    amount: '10',
    asset: 'USDC',
    interval: 'monthly',
    anchorAt: at,
    plan: 'pro',
    meta: {source: 'test'},
  };

  const created = createSubscription(input, {
    ledgerPath,
    idempotencyKey: 'sub-create-1',
    at,
    asOf: '2026-02-01T00:00:00.000Z',
  });
  assert.equal(created.subscription.status, 'active');
  assert.equal(created.subscription.amount, '10');
  assert.equal(created.subscription.version, 1);
  assert.equal(created.subscription.adapter_status, 'internal_ledger');
  assert.equal(created.subscription.next_charge, '2026-02-28T00:00:00.000Z');
  const id = created.subscription.id;

  const replay = createSubscription(input, {
    ledgerPath,
    idempotencyKey: 'sub-create-1',
    at: '2026-02-01T00:00:00.000Z',
    asOf: '2026-02-01T00:00:00.000Z',
  });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.appended, false);
  assert.equal(replay.subscription.id, id);
  assert.equal(ledgerLines(ledgerPath).length, 1);

  assert.throws(
    () => createSubscription({...input, amount: '11'}, {ledgerPath, idempotencyKey: 'sub-create-1', at}),
    error => error.code === 'idempotency_conflict',
  );
  assert.equal(ledgerLines(ledgerPath).length, 1);

  const updated = updateSubscription(id, {amount: '12.5', interval: 'weekly'}, {
    ledgerPath,
    idempotencyKey: 'sub-update-1',
    at: '2026-02-01T00:00:00.000Z',
    asOf: '2026-02-01T00:00:00.000Z',
  });
  assert.equal(updated.subscription.amount, '12.5');
  assert.deepEqual(updated.subscription.interval, {kind: 'seconds', seconds: 604800});
  assert.equal(updated.subscription.version, 2);
  assert.equal(updated.subscription.next_charge, '2026-02-07T00:00:00.000Z');

  const paused = pauseSubscription(id, {
    ledgerPath,
    idempotencyKey: 'sub-pause-1',
    at: '2026-02-02T00:00:00.000Z',
    asOf: '2026-02-02T00:00:00.000Z',
  });
  assert.equal(paused.subscription.status, 'paused');
  assert.equal(paused.subscription.next_charge, null);
  assert.equal(paused.subscription.version, 3);

  const pauseAgain = pauseSubscription(id, {
    ledgerPath,
    idempotencyKey: 'sub-pause-2',
    at: '2026-02-02T00:00:01.000Z',
  });
  assert.equal(pauseAgain.appended, false);
  assert.equal(pauseAgain.reason, 'already_paused');
  assert.equal(ledgerLines(ledgerPath).length, 3);

  const resumed = resumeSubscription(id, {
    ledgerPath,
    idempotencyKey: 'sub-resume-1',
    at: '2026-02-03T00:00:00.000Z',
    asOf: '2026-02-03T00:00:00.000Z',
  });
  assert.equal(resumed.subscription.status, 'active');
  assert.equal(resumed.subscription.next_charge, '2026-02-07T00:00:00.000Z');
  assert.equal(listSubscriptions({ledgerPath, asOf: '2026-02-03T00:00:00.000Z'}).length, 1);

  const canceled = cancelSubscription(id, {
    ledgerPath,
    idempotencyKey: 'sub-cancel-1',
    at: '2026-02-04T00:00:00.000Z',
    asOf: '2026-02-04T00:00:00.000Z',
  });
  assert.equal(canceled.subscription.status, 'canceled');
  assert.equal(canceled.subscription.next_charge, null);
  assert.equal(listSubscriptions({ledgerPath, status: 'canceled'}).length, 1);
  assert.throws(
    () => resumeSubscription(id, {ledgerPath, idempotencyKey: 'sub-resume-2', at: '2026-02-05T00:00:00.000Z'}),
    error => error.code === 'invalid_transition',
  );
  assert.throws(
    () => updateSubscription(id, {amount: '1'}, {ledgerPath, idempotencyKey: 'sub-update-2'}),
    error => error.code === 'invalid_transition',
  );

  const deleted = deleteSubscription(id, {
    ledgerPath,
    idempotencyKey: 'sub-delete-1',
    at: '2026-02-05T00:00:00.000Z',
  });
  assert.equal(deleted.appended, true);
  assert.equal(getSubscription(id, {ledgerPath}), null);
  assert.equal(getSubscription(id, {ledgerPath, includeDeleted: true}).status, 'deleted');
  assert.equal(listSubscriptions({ledgerPath}).length, 0);
  assert.equal(listSubscriptions({ledgerPath, includeDeleted: true}).length, 1);

  const deleteAgain = deleteSubscription(id, {
    ledgerPath,
    idempotencyKey: 'sub-delete-2',
    at: '2026-02-05T00:00:01.000Z',
  });
  assert.equal(deleteAgain.appended, false);
  assert.equal(deleteAgain.reason, 'already_deleted');
  assert.equal(ledgerLines(ledgerPath).length, 6);
});

test('next_charge handles month-end clamping, leap years and fixed intervals', () => {
  const monthly = {
    status: 'active',
    anchorAt: '2026-01-31T00:00:00.000Z',
    interval: {kind: 'calendar', unit: 'month', count: 1},
  };
  assert.equal(computeNextCharge(monthly, '2026-02-01T00:00:00.000Z'), '2026-02-28T00:00:00.000Z');
  assert.equal(computeNextCharge(monthly, '2026-02-28T00:00:00.000Z'), '2026-03-31T00:00:00.000Z');
  assert.equal(computeNextCharge(monthly, '2026-03-01T00:00:00.000Z'), '2026-03-31T00:00:00.000Z');

  const bimonthly = {...monthly, interval: {kind: 'calendar', unit: 'month', count: 2}};
  assert.equal(computeNextCharge(bimonthly, '2026-02-01T00:00:00.000Z'), '2026-03-31T00:00:00.000Z');

  const leap = {
    status: 'active',
    anchorAt: '2024-02-29T00:00:00.000Z',
    interval: {kind: 'calendar', unit: 'year', count: 1},
  };
  assert.equal(computeNextCharge(leap, '2025-01-01T00:00:00.000Z'), '2025-02-28T00:00:00.000Z');
  assert.equal(computeNextCharge(leap, '2025-03-01T00:00:00.000Z'), '2026-02-28T00:00:00.000Z');

  const daily = {
    status: 'active',
    anchorAt: '2026-01-01T00:00:00.000Z',
    interval: {kind: 'seconds', seconds: 86400},
  };
  assert.equal(computeNextCharge(daily, '2026-01-01T00:00:00.000Z'), '2026-01-02T00:00:00.000Z');
  assert.equal(computeNextCharge(daily, '2026-01-02T00:00:00.000Z'), '2026-01-03T00:00:00.000Z');
  assert.equal(computeNextCharge(daily, '2025-12-31T00:00:00.000Z'), '2026-01-01T00:00:00.000Z');
  assert.equal(computeNextCharge({...daily, status: 'paused'}, '2026-01-01T00:00:00.000Z'), null);
  assert.equal(computeNextCharge({...daily, status: 'canceled'}, '2026-01-01T00:00:00.000Z'), null);

  assert.deepEqual(normalizeInterval('monthly'), {kind: 'calendar', unit: 'month', count: 1});
  assert.deepEqual(normalizeInterval('30d'), {kind: 'seconds', seconds: 2592000});
  assert.deepEqual(normalizeInterval({unit: 'year', count: 2}), {kind: 'calendar', unit: 'year', count: 2});
  assert.throws(() => normalizeInterval('0d'), error => error.code === 'invalid_interval');
  assert.throws(() => normalizeInterval('every-blue-moon'), error => error.code === 'invalid_interval');
});

test('subscription events are recorded but do not change the monetary balance', t => {
  const ledgerPath = tempLedger(t);
  appendEvent(
    {
      type: 'credit',
      account: 'agent:test',
      asset: 'USDC',
      amount: '100',
      idempotencyKey: 'balance-credit',
      at: '2026-11-16T00:00:00.000Z',
    },
    {ledgerPath},
  );
  createSubscription(
    {
      account: 'agent:test',
      rail: 'internal',
      amount: '10',
      asset: 'USDC',
      interval: 'monthly',
      anchorAt: '2026-11-16T00:00:00.000Z',
    },
    {ledgerPath, idempotencyKey: 'balance-sub', at: '2026-11-16T00:00:00.000Z'},
  );

  const balance = deriveBalance('agent:test', {ledgerPath});
  assert.equal(balance.net, '100');
  assert.equal(balance.available, '100');
  assert.equal(balance.monetary_events, 1);
  assert.equal(balance.events, 2);
  assert.equal(listSubscriptions({ledgerPath}).length, 1);
});

test('unimplemented rails are refused at create and update with zero writes', t => {
  const ledgerPath = tempLedger(t);
  assert.throws(
    () => createSubscription(
      {
        account: 'agent:test',
        rail: 'stripe',
        amount: '1',
        interval: 'monthly',
        anchorAt: '2026-11-16T00:00:00.000Z',
      },
      {ledgerPath, idempotencyKey: 'rail-create-1', at: '2026-11-16T00:00:00.000Z'},
    ),
    error => error.code === 'not_adapted',
  );
  assert.equal(fs.existsSync(ledgerPath), false);

  const created = createSubscription(
    {
      account: 'agent:test',
      rail: 'internal',
      amount: '1',
      interval: 'monthly',
      anchorAt: '2026-11-16T00:00:00.000Z',
    },
    {ledgerPath, idempotencyKey: 'rail-create-2', at: '2026-11-16T00:00:00.000Z'},
  );
  const before = fs.readFileSync(ledgerPath, 'utf8');
  assert.throws(
    () => updateSubscription(created.subscription.id, {rail: 'stripe'}, {
      ledgerPath,
      idempotencyKey: 'rail-update-1',
      at: '2026-11-17T00:00:00.000Z',
    }),
    error => error.code === 'not_adapted',
  );
  assert.equal(fs.readFileSync(ledgerPath, 'utf8'), before);
});

test('a directly appended changes object cannot smuggle status or bypass the whitelist', t => {
  const ledgerPath = tempLedger(t);
  const at = '2026-11-16T00:00:00.000Z';
  const created = createSubscription(
    {
      account: 'agent:test',
      rail: 'internal',
      amount: '10',
      interval: 'monthly',
      anchorAt: at,
    },
    {ledgerPath, idempotencyKey: 'smuggle-create-1', at},
  );
  const id = created.subscription.id;
  cancelSubscription(id, {ledgerPath, idempotencyKey: 'smuggle-cancel-1', at});
  const before = fs.readFileSync(ledgerPath, 'utf8');
  assert.equal(getSubscription(id, {ledgerPath, includeDeleted: true}).status, 'canceled');

  assert.throws(
    () => appendEvent(
      {
        type: 'subscription.updated',
        account: 'agent:test',
        subscriptionId: id,
        changes: {status: 'active'},
        at,
        idempotencyKey: 'smuggle-evil-1',
      },
      {ledgerPath},
    ),
    error => error.code === 'invalid_event',
  );
  assert.equal(fs.readFileSync(ledgerPath, 'utf8'), before);

  assert.throws(
    () => appendEvent(
      {
        type: 'subscription.updated',
        account: 'agent:test',
        subscriptionId: id,
        changes: {amount: 0.01},
        at,
        idempotencyKey: 'smuggle-evil-2',
      },
      {ledgerPath},
    ),
    error => error.code === 'invalid_event',
  );
  assert.equal(getSubscription(id, {ledgerPath, includeDeleted: true}).status, 'canceled');

  const ok = appendEvent(
    {
      type: 'subscription.updated',
      account: 'agent:test',
      subscriptionId: id,
      changes: {amount: '0.01', plan: null},
      at,
      idempotencyKey: 'smuggle-legit-1',
    },
    {ledgerPath},
  );
  assert.equal(ok.appended, true);
  assert.equal(ok.event.changes.amount, '0.01');
});
