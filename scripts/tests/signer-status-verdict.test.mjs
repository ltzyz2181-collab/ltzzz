// Regression for the signer-status consumer contract.
// The healthy blocked response from run 43147189295 is ok:true but has no
// transaction adapter. The earlier 42754740636 body had an Aave RPC error;
// its status field must never mask that service failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySignerStatus,
  SIGNER_STATUS_SCHEMA,
  SIGNER_STATUS_REVISION,
  SIGNER_STATUS_SCOPE,
  SIGNER_STATUS_CHAIN_ID,
} from '../lib/signer-status-verdict.mjs';

const SOURCE_COMMIT = '3c4507ecb9dfc3c21fcc32c3550a4d3d22d18070';

const healthyBlocked = {
  ok: true,
  schema: SIGNER_STATUS_SCHEMA,
  revision: SIGNER_STATUS_REVISION,
  scope: SIGNER_STATUS_SCOPE,
  chain_id: SIGNER_STATUS_CHAIN_ID,
  source_commit: SOURCE_COMMIT,
  configured: false,
  configured_basis: 'existing_legacy_guard_denies_transaction_adapter',
  control_verified: null,
  control_evidence: null,
  transaction_adapter_ready: false,
  status: 'blocked_transaction_adapter',
  signed: false,
  transactions: 0,
  on_chain_executed: false,
  paid: false,
  tx_hash: null,
};

const healthyReady = {
  ok: true,
  schema: SIGNER_STATUS_SCHEMA,
  revision: SIGNER_STATUS_REVISION,
  scope: SIGNER_STATUS_SCOPE,
  chain_id: SIGNER_STATUS_CHAIN_ID,
  source_commit: SOURCE_COMMIT,
  configured: true,
  configured_basis: 'verified_transaction_adapter_with_control_evidence',
  control_verified: true,
  control_evidence: 'sha256:0123456789abcdef0123456789abcdef',
  transaction_adapter_ready: true,
  status: 'ready',
  signed: false,
  transactions: 0,
  on_chain_executed: false,
  paid: false,
  tx_hash: null,
};

test('当前健康的安全门响应被识别为预期阻断，而不是 signer ready', () => {
  const v = classifySignerStatus(healthyBlocked, 200);
  assert.equal(v.serviceOk, true);
  assert.equal(v.expectedBlock, true);
  assert.equal(v.capabilityReady, false);
  assert.equal(v.executionOccurred, false);
  assert.equal(v.verdict, 'expected_safety_block');
  assert.equal(v.blockedReason, 'existing_legacy_guard_denies_transaction_adapter');
});

test('只有完整的 revision/scope/chain/control-evidence 契约才能 ready', () => {
  const v = classifySignerStatus(healthyReady, 200);
  assert.equal(v.serviceOk, true);
  assert.equal(v.capabilityReady, true);
  assert.equal(v.expectedBlock, false);
  assert.equal(v.verdict, 'ready');
});

test('Aave RPC read error 优先于 blocked status，不得当成健康安全阻断', () => {
  const v = classifySignerStatus({...healthyBlocked, ok: false, error: 'base_rpc_read_failed'}, 200);
  assert.equal(v.serviceOk, false);
  assert.equal(v.expectedBlock, false);
  assert.equal(v.capabilityReady, false);
  assert.equal(v.verdict, 'service_error');
});

test('ok:true 但仍带 error 不能判 ready', () => {
  const v = classifySignerStatus({...healthyReady, error: 'base_rpc_read_failed'}, 200);
  assert.equal(v.serviceOk, false);
  assert.equal(v.verdict, 'service_error');
});

test('ok:true + blocked status 但 adapter_ready=true 属于字段冲突', () => {
  const v = classifySignerStatus({...healthyBlocked, transaction_adapter_ready: true}, 200);
  assert.equal(v.serviceOk, false);
  assert.equal(v.expectedBlock, false);
  assert.equal(v.verdict, 'inconsistent_block_contract');
});

test('status=ready 但 configured=false 不得放行', () => {
  const v = classifySignerStatus({...healthyReady, configured: false}, 200);
  assert.equal(v.serviceOk, false);
  assert.equal(v.capabilityReady, false);
  assert.equal(v.verdict, 'readiness_contract_incomplete');
});

test('status=ready 缺 control evidence 不得放行', () => {
  const v = classifySignerStatus({...healthyReady, control_evidence: null}, 200);
  assert.equal(v.serviceOk, false);
  assert.equal(v.verdict, 'readiness_contract_incomplete');
});

test('revision/scope/chain 任一缺失或不匹配都不得放行', () => {
  for (const patch of [
    {revision: undefined},
    {revision: 'wep3-signer-status-v0'},
    {scope: 'snapshot_anchor'},
    {scope: undefined},
    {chain_id: 1},
    {chain_id: undefined},
  ]) {
    const v = classifySignerStatus({...healthyReady, ...patch}, 200);
    assert.equal(v.serviceOk, false);
    assert.equal(v.capabilityReady, false);
    assert.equal(v.verdict, 'contract_mismatch');
  }
});

test('source_commit 必须是 40-hex 且部署回读必须匹配预期提交', () => {
  assert.equal(classifySignerStatus({...healthyReady, source_commit: undefined}, 200).verdict, 'source_commit_invalid');
  assert.equal(classifySignerStatus({...healthyReady, source_commit: 'not-a-commit'}, 200).verdict, 'source_commit_invalid');
  assert.equal(classifySignerStatus(healthyReady, 200, 'a'.repeat(40)).verdict, 'source_commit_mismatch');
  const matched = classifySignerStatus(healthyReady, 200, SOURCE_COMMIT);
  assert.equal(matched.verdict, 'ready');
  assert.equal(matched.capabilityReady, true);
});

test('signed/transactions/on-chain/paid/tx_hash 任一执行迹象必须失败', () => {
  for (const patch of [
    {signed: true},
    {transactions: 1},
    {on_chain_executed: true},
    {paid: true},
    {tx_hash: '0xabc123'},
  ]) {
    const v = classifySignerStatus({...healthyReady, ...patch}, 200);
    assert.equal(v.serviceOk, false);
    assert.equal(v.executionOccurred, true);
    assert.equal(v.verdict, 'unexpected_execution');
  }
});

test('非 200、schema 错误、未知 status 与畸形响应全部 fail-closed', () => {
  assert.equal(classifySignerStatus(healthyReady, 502).verdict, 'http_not_ok');
  assert.equal(classifySignerStatus({...healthyReady, schema: 'other'}, 200).verdict, 'schema_mismatch');
  assert.equal(classifySignerStatus({...healthyBlocked, status: 'blocked_unknown'}, 200).verdict, 'unknown_block');
  assert.equal(classifySignerStatus(null, 200).verdict, 'schema_mismatch');
  assert.equal(classifySignerStatus(undefined, 200).serviceOk, false);
});
