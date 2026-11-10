import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {assertRunKeyOwnership} from '../lib/daily-task-board.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const ledger = (runKey) => ({schema_version: 2, date: '2026-11-10', run_key: runKey, seats: {}, paid: false, tx_hash: null});

test('attempt 1 持有当天租约时放行', () => {
  assert.equal(assertRunKeyOwnership(ledger('42775084183:1'), '42775084183:1'), true);
});

test('attempt 2 不得复用 attempt 1 的租约', () => {
  assert.throws(
    () => assertRunKeyOwnership(ledger('42775084183:1'), '42775084183:2'),
    /daily_reservation_run_key_mismatch/,
  );
});

test('另一个 run 的租约同样拒绝', () => {
  assert.throws(
    () => assertRunKeyOwnership(ledger('42775084183:1'), '42776498723:1'),
    /daily_reservation_run_key_mismatch/,
  );
});

test('ledger 缺失 run_key 时按 fail-closed 拒绝，不按空值放行', () => {
  for (const bad of [undefined, null, '', 0]) {
    const record = ledger(bad);
    assert.throws(() => assertRunKeyOwnership(record, '42775084183:1'), /daily_reservation_run_key_absent/);
  }
});

test('ledger 不存在时直接判缺失，不进入后续流程', () => {
  for (const bad of [null, undefined]) {
    assert.throws(() => assertRunKeyOwnership(bad, '42775084183:1'), /daily_reservation_missing/);
  }
});

test('校验必须发生在席位循环与任何结果文件写入之前', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'run-daily-tasks.mjs'), 'utf8');
  const checkAt = source.indexOf('assertRunKeyOwnership(boardLedger, runKey)');
  assert.notEqual(checkAt, -1, '主流程必须调用 assertRunKeyOwnership');
  // Anchor on the calls that actually persist a daily outcome, not on the
  // writeFileSync inside the writeJson helper, which is defined earlier.
  const persistMarkers = [
    'for (const ch of CHANNELS)',
    'runReservedSeat(',
    'fs.writeFileSync(path.join(ROOT, reflectionRelativePath)',
    'fs.writeFileSync(path.join(DATA, "reports", "latest.md")',
    'pending_reminders:',
  ];
  for (const marker of persistMarkers) {
    const at = source.indexOf(marker);
    assert.notEqual(at, -1, `缺少标记：${marker}`);
    assert.ok(checkAt < at, `校验必须早于 ${marker}`);
  }
});

test('校验位于远端租约核验之前，重跑不再发起一次网络请求', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'run-daily-tasks.mjs'), 'utf8');
  const checkAt = source.indexOf('assertRunKeyOwnership(boardLedger, runKey)');
  const fetchAt = source.indexOf('const reservationResponse=await fetch(');
  assert.notEqual(fetchAt, -1);
  assert.ok(checkAt < fetchAt, 'runKey 校验必须早于远端字节核验');
});
