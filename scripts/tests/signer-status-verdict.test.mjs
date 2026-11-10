// 回归：signer status 验收判定。
//
// 对应 deploy-wep3 每日假失败（run 42754740636）：部署步骤 success、
// 验收步骤 failure，原因是把 status 接口的 ok:false（安全门正常关闭）
// 误判成服务失败。
//
// 这里必须证明两件事：
//   1. 预期的安全门不再报红；
//   2. 任何真实执行、任何未知状态仍然报红（fail-closed 没有放宽）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {classifySignerStatus, SIGNER_STATUS_SCHEMA} from '../lib/signer-status-verdict.mjs';

// 来自 run 42754740636 的真实响应（04:17:34 那次）
const realBlocked = {
  ok: false,
  schema: SIGNER_STATUS_SCHEMA,
  revision: 'wep3-signer-status-v1',
  scope: 'aave_supply',
  chain_id: 8453,
  configured: false,
  configured_basis: 'existing_legacy_guard_denies_transaction_adapter',
  control_verified: null,
  transaction_adapter_ready: false,
  status: 'blocked_transaction_adapter',
  signed: false,
  transactions: 0,
  on_chain_executed: false,
  paid: false,
  tx_hash: null,
  error: 'base_rpc_read_failed',
  reason: 'base_rpc_unavailable',
};

test('真实的安全门响应应放行，并标注为预期拒绝', () => {
  const v = classifySignerStatus(realBlocked, 200);
  assert.equal(v.serviceOk, true);
  assert.equal(v.expectedBlock, true);
  assert.equal(v.executionOccurred, false);
  assert.equal(v.verdict, 'expected_safety_block');
  assert.equal(v.blockedReason, 'existing_legacy_guard_denies_transaction_adapter');
});

test('ready 状态照常放行', () => {
  const v = classifySignerStatus({...realBlocked, ok: true, status: 'ready', configured: true}, 200);
  assert.equal(v.serviceOk, true);
  assert.equal(v.expectedBlock, false);
  assert.equal(v.verdict, 'ready');
});

test('出现签名迹象必须失败（即使 ok 为 true）', () => {
  const v = classifySignerStatus({...realBlocked, ok: true, signed: true}, 200);
  assert.equal(v.serviceOk, false);
  assert.equal(v.executionOccurred, true);
  assert.equal(v.verdict, 'unexpected_execution');
});

test('出现交易数必须失败', () => {
  const v = classifySignerStatus({...realBlocked, transactions: 1, signed: false}, 200);
  assert.equal(v.executionOccurred, true);
  assert.equal(v.serviceOk, false);
});

test('出现链上执行必须失败', () => {
  const v = classifySignerStatus({...realBlocked, on_chain_executed: true}, 200);
  assert.equal(v.executionOccurred, true);
});

test('非 200 必须失败', () => {
  const v = classifySignerStatus(realBlocked, 502);
  assert.equal(v.serviceOk, false);
  assert.equal(v.verdict, 'http_not_ok');
});

test('schema 不符必须失败（不认来历不明的状态体）', () => {
  const v = classifySignerStatus({...realBlocked, schema: 'something.else'}, 200);
  assert.equal(v.serviceOk, false);
  assert.equal(v.verdict, 'schema_mismatch');
});

test('未知 blocked 状态必须失败，不得猜测放行', () => {
  const v = classifySignerStatus({...realBlocked, status: 'blocked_unknown_reason'}, 200);
  assert.equal(v.serviceOk, false);
  assert.equal(v.verdict, 'unknown_block');
  assert.equal(v.blockedReason, 'blocked_unknown_reason');
});

test('空/畸形响应必须失败', () => {
  assert.equal(classifySignerStatus(null, 200).serviceOk, false);
  assert.equal(classifySignerStatus(undefined, 200).verdict, 'schema_mismatch');
});
