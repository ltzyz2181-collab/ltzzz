import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {appendEvent} from '../core.mjs';
import {
  adapterStatus,
  attemptCharge,
  attemptSettlement,
  getAdapter,
  invokeAdapter,
  registerAdapter,
  unregisterAdapter,
} from '../adapters/index.mjs';
import {createSubscription} from '../subscriptions.mjs';

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-wallet-adapter-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
}

test('unimplemented rails throw not_adapted with zero ledger writes', t => {
  const dir = tempDir(t);
  const ledgerPath = path.join(dir, 'ledger.jsonl');
  appendEvent(
    {
      type: 'credit',
      account: 'agent:test',
      asset: 'USDC',
      amount: '5',
      idempotencyKey: 'adapter-credit',
      at: '2026-11-16T00:00:00.000Z',
    },
    {ledgerPath},
  );
  const before = fs.readFileSync(ledgerPath, 'utf8');

  for (const dispatch of [attemptSettlement, attemptCharge]) {
    assert.throws(
      () => dispatch({rail: 'stripe', account: 'agent:test', asset: 'USDC', amount: '1', idempotencyKey: 'adapter-1'}),
      error => error.code === 'not_adapted',
    );
  }

  assert.throws(
    () => createSubscription(
      {
        account: 'agent:test',
        rail: 'stripe',
        amount: '1',
        interval: 'monthly',
        anchorAt: '2026-11-16T00:00:00.000Z',
      },
      {ledgerPath, idempotencyKey: 'adapter-sub-create'},
    ),
    error => error.code === 'not_adapted',
  );

  assert.equal(fs.readFileSync(ledgerPath, 'utf8'), before);

  const freshLedger = path.join(dir, 'fresh.jsonl');
  assert.throws(
    () => createSubscription(
      {
        account: 'agent:test',
        rail: 'coinbase',
        amount: '1',
        interval: 'monthly',
        anchorAt: '2026-11-16T00:00:00.000Z',
      },
      {ledgerPath: freshLedger, idempotencyKey: 'adapter-fresh-create'},
    ),
    error => error.code === 'not_adapted',
  );
  assert.equal(fs.existsSync(freshLedger), false);
});

test('read-only adapters can be registered but write capabilities cannot', t => {
  const dir = tempDir(t);
  assert.ok(dir);

  registerAdapter('fixture', {
    capabilities: ['getBalance'],
    getBalance: () => ({balance: '42'}),
  });
  try {
    assert.deepEqual(invokeAdapter('fixture', 'getBalance'), {balance: '42'});
    assert.throws(() => invokeAdapter('fixture', 'settle'), error => error.code === 'not_adapted');
    assert.throws(() => invokeAdapter('fixture', 'charge'), error => error.code === 'not_adapted');
    assert.throws(
      () => registerAdapter('bad', {capabilities: ['settle'], settle() {}}),
      error => error.code === 'adapter_write_not_permitted',
    );
    assert.throws(() => getAdapter('missing'), error => error.code === 'not_adapted');
    assert.equal(adapterStatus('missing').adapted, false);
    assert.equal(adapterStatus('fixture').mode, 'read_only');
  } finally {
    unregisterAdapter('fixture');
  }
});
