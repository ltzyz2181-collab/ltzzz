// 租约拒执行的取证回归：拒执行必须先能生成回执，才允许抛错。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reservationRefusalRecord} from '../lib/daily-task-board.mjs';

test('run_key 不一致时回执记录双方 run_key 与席位清单', () => {
  const ledger = {date: '2026-11-11', run_key: '42752837326:1', seats: {doubao: {}, qianwen: {}}};
  const r = reservationRefusalRecord(ledger, '42990000000:2', '2026-11-11T02:00:00.000Z');
  assert.equal(r.refused, true);
  assert.equal(r.reason, 'daily_reservation_run_key_mismatch');
  assert.equal(r.ledger_run_key, '42752837326:1');
  assert.equal(r.current_run_key, '42990000000:2');
  assert.equal(r.ledger_date, '2026-11-11');
  assert.deepEqual(r.seats, ['doubao', 'qianwen']);
  assert.equal(r.scope, 'refused_before_any_seat_execution_and_before_result_files_written');
});

test('租约缺失或 run_key 缺失时仍能取证而不是只有异常文本', () => {
  const missing = reservationRefusalRecord(null, '1:1');
  assert.equal(missing.refused, true);
  assert.equal(missing.reason, 'daily_reservation_missing');
  assert.equal(missing.ledger_run_key, null);
  const absent = reservationRefusalRecord({date: '2026-11-11', seats: {}}, '1:1');
  assert.equal(absent.reason, 'daily_reservation_run_key_absent');
});

test('租约匹配时不记为拒执行', () => {
  const r = reservationRefusalRecord({date: '2026-11-11', run_key: '1:1', seats: {doubao: {}}}, '1:1');
  assert.equal(r.refused, false);
  assert.equal(r.reason, null);
});
