import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDeliveryBoundary,DELIVERY_CONDITIONS,DELIVERY_BOUNDARY_REVISION} from '../lib/delivery-boundary.mjs';

const FULL = {
  platform_event: {event_id: 'evt_platform_9001', event_type: 'order_paid'},
  order_state: {state: 'paid'},
  independent_verification: {verified: true, artifact_sha256: 'a'.repeat(64), independent_of_worker_providers: true},
  idempotency_key: 'ord-9001-deliver-1',
  platform_receipt: {receipt_id: 'rcpt_9001', receipt_sha256: 'b'.repeat(64)}
};

test('五条件齐备才允许自动交付，且本模块从不发起交付',()=>{
  const r = evaluateDeliveryBoundary(FULL);
  assert.equal(DELIVERY_CONDITIONS.length, 5);
  assert.equal(r.decision, 'auto_deliver_allowed');
  assert.deepEqual(r.conditions_missing, []);
  assert.equal(r.delivery_attempted, false);
  assert.equal(r.external_submission_attempted, false);
  assert.equal(r.revision, DELIVERY_BOUNDARY_REVISION);
});

test('缺平台回执一律退回草稿，不得用 play_verified 之类替代',()=>{
  const r = evaluateDeliveryBoundary({...FULL, platform_receipt: undefined});
  assert.equal(r.decision, 'draft_only');
  assert.deepEqual(r.conditions_missing, ['platform_receipt']);
});

test('缺独立校验或缺订单态都不放行',()=>{
  for (const key of ['independent_verification', 'order_state', 'platform_event', 'idempotency_key']) {
    const r = evaluateDeliveryBoundary({...FULL, [key]: undefined});
    assert.notEqual(r.decision, 'auto_deliver_allowed', key + ' 缺失必须拦截');
    assert.ok(r.conditions_missing.includes(key));
  }
});

test('合成/测试事件不算平台事件，自评不算独立校验',()=>{
  const synthetic = evaluateDeliveryBoundary({...FULL, platform_event: {event_id: 'evt_demo', event_type: 'synthetic_test'}});
  assert.equal(synthetic.decision, 'draft_only');
  const selfVerified = evaluateDeliveryBoundary({...FULL, independent_verification: {verified: true, artifact_sha256: 'c'.repeat(64), independent_of_worker_providers: false}});
  assert.notEqual(selfVerified.decision, 'auto_deliver_allowed');
});

test('判定结果永不带资金副作用',()=>{
  const r = evaluateDeliveryBoundary(FULL);
  assert.equal(r.financial_execution, false);
  assert.equal(r.fail_closed, true);
});
