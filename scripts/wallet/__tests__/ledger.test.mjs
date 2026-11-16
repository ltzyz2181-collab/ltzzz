import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  amountToUnits,
  appendEvent,
  deriveBalance,
  unitsToAmount,
  verifyChain,
} from '../core.mjs';

function tempLedger(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-wallet-ledger-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return path.join(dir, 'ledger.jsonl');
}

function ledgerLines(file) {
  return fs.readFileSync(file, 'utf8').trimEnd().split('\n');
}

test('idempotent replay: the same key twice writes exactly one line', t => {
  const ledgerPath = tempLedger(t);
  const base = {account: 'agent:test', asset: 'USDC', at: '2026-11-16T00:00:00.000Z'};

  const first = appendEvent({...base, type: 'credit', amount: '10', idempotencyKey: 'dep-1'}, {ledgerPath});
  const replay = appendEvent(
    {...base, type: 'credit', amount: '10.0', idempotencyKey: 'dep-1', at: '2026-11-16T00:00:05.000Z'},
    {ledgerPath},
  );

  assert.equal(first.appended, true);
  assert.equal(first.duplicate, false);
  assert.equal(replay.appended, false);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.event.hash, first.event.hash);
  assert.equal(ledgerLines(ledgerPath).length, 1);

  assert.throws(
    () => appendEvent({...base, type: 'credit', amount: '11', idempotencyKey: 'dep-1'}, {ledgerPath}),
    error => error.code === 'idempotency_conflict',
  );
  assert.equal(ledgerLines(ledgerPath).length, 1);
});

test('freeze and settlement use exact decimals and reject overdrafts', t => {
  const ledgerPath = tempLedger(t);
  const base = {account: 'agent:test', asset: 'USDC', at: '2026-11-16T00:00:00.000Z'};

  appendEvent({...base, type: 'credit', amount: '100.1', idempotencyKey: 'c-1'}, {ledgerPath});
  appendEvent({...base, type: 'freeze', amount: '30', idempotencyKey: 'f-1'}, {ledgerPath});
  appendEvent({...base, type: 'unfreeze', amount: '5', idempotencyKey: 'u-1'}, {ledgerPath});
  appendEvent({...base, type: 'settle', amount: '25', idempotencyKey: 's-1', reference: 'settle-1'}, {ledgerPath});

  const balance = deriveBalance('agent:test', {ledgerPath});
  assert.equal(balance.net, '75.1');
  assert.equal(balance.frozen, '0');
  assert.equal(balance.available, '75.1');
  assert.equal(balance.byAsset.USDC.credited, '100.1');
  assert.equal(balance.byAsset.USDC.frozen_in, '30');
  assert.equal(balance.byAsset.USDC.frozen_out, '5');
  assert.equal(balance.byAsset.USDC.settled, '25');
  assert.equal(balance.violations.length, 0);

  assert.throws(
    () => appendEvent({...base, type: 'settle', amount: '0.000001', idempotencyKey: 's-2'}, {ledgerPath}),
    error => error.code === 'insufficient_frozen',
  );
  assert.throws(
    () => appendEvent({...base, type: 'freeze', amount: '100', idempotencyKey: 'f-2'}, {ledgerPath}),
    error => error.code === 'insufficient_available',
  );
  assert.equal(ledgerLines(ledgerPath).length, 4);
});

test('tampering with a record amount is detected by verifyChain and blocks deriveBalance', t => {
  const ledgerPath = tempLedger(t);
  const base = {account: 'agent:test', asset: 'USDC', at: '2026-11-16T00:00:00.000Z'};

  appendEvent({...base, type: 'credit', amount: '10', idempotencyKey: 'c-1'}, {ledgerPath});
  appendEvent({...base, type: 'freeze', amount: '2', idempotencyKey: 'f-1'}, {ledgerPath});
  appendEvent({...base, type: 'settle', amount: '2', idempotencyKey: 's-1'}, {ledgerPath});
  assert.equal(verifyChain({ledgerPath}).ok, true);

  const lines = ledgerLines(ledgerPath);
  const second = JSON.parse(lines[1]);
  second.amount = '2.5';
  lines[1] = JSON.stringify(second);
  fs.writeFileSync(ledgerPath, `${lines.join('\n')}\n`);

  const chain = verifyChain({ledgerPath});
  assert.equal(chain.ok, false);
  assert.ok(chain.errors.some(error => error.code === 'hash_mismatch'), JSON.stringify(chain.errors));
  assert.throws(() => deriveBalance('agent:test', {ledgerPath}), error => error.code === 'ledger_corrupt');
});

test('breaking a prevHash link is detected', t => {
  const ledgerPath = tempLedger(t);
  const base = {account: 'agent:test', asset: 'USDC', at: '2026-11-16T00:00:00.000Z'};

  appendEvent({...base, type: 'credit', amount: '10', idempotencyKey: 'c-1'}, {ledgerPath});
  appendEvent({...base, type: 'freeze', amount: '2', idempotencyKey: 'f-1'}, {ledgerPath});

  const lines = ledgerLines(ledgerPath);
  const second = JSON.parse(lines[1]);
  second.prevHash = 'f'.repeat(64);
  lines[1] = JSON.stringify(second);
  fs.writeFileSync(ledgerPath, `${lines.join('\n')}\n`);

  const chain = verifyChain({ledgerPath});
  assert.equal(chain.ok, false);
  assert.ok(chain.errors.some(error => error.code === 'prev_hash_mismatch'), JSON.stringify(chain.errors));
});

test('malformed lines are rejected instead of being guessed', t => {
  const ledgerPath = tempLedger(t);
  appendEvent(
    {type: 'credit', account: 'agent:test', asset: 'USDC', amount: '10', idempotencyKey: 'c-1', at: '2026-11-16T00:00:00.000Z'},
    {ledgerPath},
  );
  fs.appendFileSync(ledgerPath, 'not-json\n');

  const chain = verifyChain({ledgerPath});
  assert.equal(chain.ok, false);
  assert.ok(chain.errors.some(error => error.code === 'invalid_json'), JSON.stringify(chain.errors));
  assert.throws(
    () => appendEvent(
      {type: 'credit', account: 'agent:test', asset: 'USDC', amount: '1', idempotencyKey: 'c-2', at: '2026-11-16T00:00:01.000Z'},
      {ledgerPath},
    ),
    error => error.code === 'ledger_corrupt',
  );
});

test('amounts are decimal strings with no floating-point path', () => {
  assert.equal(amountToUnits('0.1') + amountToUnits('0.2'), amountToUnits('0.3'));
  assert.equal(unitsToAmount(amountToUnits('1.2300')), '1.23');
  assert.throws(() => amountToUnits('1e-3'), error => error.code === 'invalid_amount');
  assert.throws(() => amountToUnits(1), error => error.code === 'invalid_amount');
  assert.throws(() => amountToUnits('1.0000000000000000001'), error => error.code === 'invalid_amount');
});
