// Treasury signer status 的验收判定。
//
// /market/aave/status 同时汇总 Aave 只读余额读取与 signer 能力状态。
// HTTP 200 只证明路由可达；ok:true 只证明本次聚合服务成功，均不等于 signer ready。
// 只有完整的 revision/scope/chain/capability/control-evidence 契约才能返回 ready。
// RPC error、字段冲突、缺字段、未知 status 一律 fail-closed。

export const SIGNER_STATUS_SCHEMA = 'ltzzz.treasury-signer-status.v1';
export const SIGNER_STATUS_REVISION = 'wep3-signer-status-v1';
export const SIGNER_STATUS_SCOPE = 'aave_supply';
export const SIGNER_STATUS_CHAIN_ID = 8453;
export const SIGNER_STATUS_VERDICTS = Object.freeze([
  'ready', 'expected_safety_block', 'http_not_ok', 'schema_mismatch',
  'unexpected_execution', 'service_error', 'service_not_ok', 'contract_mismatch',
  'source_commit_invalid', 'source_commit_mismatch', 'inconsistent_block_contract',
  'readiness_contract_incomplete', 'unknown_block',
]);
const SOURCE_COMMIT_SHA = /^[a-f0-9]{40}$/;

const BASE = {
  serviceOk: false,
  expectedBlock: false,
  executionOccurred: false,
  capabilityReady: false,
  blockedReason: null,
};
const result = (verdict, extra = {}) => ({...BASE, verdict, ...extra});
const hasError = value => value !== undefined && value !== null && value !== '';
const nonExecuting = r =>
  r.signed === false &&
  r.transactions === 0 &&
  r.on_chain_executed === false &&
  r.paid === false &&
  r.tx_hash === null;

export function classifySignerStatus(resultBody, httpStatus, expectedSourceCommit = null) {
  const r = resultBody && typeof resultBody === 'object' && !Array.isArray(resultBody)
    ? resultBody
    : {};

  if (httpStatus !== 200) return result('http_not_ok');
  if (r.schema !== SIGNER_STATUS_SCHEMA) return result('schema_mismatch');

  // 最高优先级：任何执行迹象都不得被后续字段抵消。
  const executed =
    r.signed === true ||
    (typeof r.transactions === 'number' && r.transactions > 0) ||
    r.on_chain_executed === true ||
    r.paid === true ||
    (typeof r.tx_hash === 'string' && r.tx_hash.trim().length > 0);
  if (executed) return result('unexpected_execution', {executionOccurred: true});

  // 聚合路由的 Aave RPC error 必须优先于 signer 的 blocked 元数据。
  if (hasError(r.error)) return result('service_error', {blockedReason: r.error});
  if (r.ok !== true) return result('service_not_ok', {blockedReason: r.status || null});

  if (
    r.revision !== SIGNER_STATUS_REVISION ||
    r.scope !== SIGNER_STATUS_SCOPE ||
    r.chain_id !== SIGNER_STATUS_CHAIN_ID
  ) return result('contract_mismatch', {blockedReason: r.status || null});

  // The status body must identify the exact Worker source. During the deploy
  // workflow it must also match the commit passed to wrangler via GITHUB_SHA.
  if (!SOURCE_COMMIT_SHA.test(r.source_commit || '')) {
    return result('source_commit_invalid', {blockedReason: 'source_commit_invalid'});
  }
  if (expectedSourceCommit !== null && expectedSourceCommit !== undefined &&
      (!SOURCE_COMMIT_SHA.test(expectedSourceCommit) || r.source_commit !== expectedSourceCommit)) {
    return result('source_commit_mismatch', {blockedReason: 'source_commit_mismatch'});
  }

  if (r.status === 'blocked_transaction_adapter') {
    const knownBasis = [
      'existing_legacy_guard_denies_transaction_adapter',
      'no_transaction_adapter_installed',
    ].includes(r.configured_basis);
    const exactBlock =
      knownBasis &&
      r.configured === false &&
      r.control_verified === null &&
      r.control_evidence === null &&
      r.transaction_adapter_ready === false &&
      nonExecuting(r);
    if (!exactBlock) return result('inconsistent_block_contract', {blockedReason: r.configured_basis || r.status});
    return result('expected_safety_block', {
      serviceOk: true,
      expectedBlock: true,
      blockedReason: r.configured_basis,
    });
  }

  if (r.status === 'ready') {
    const exactReady =
      r.configured === true &&
      r.transaction_adapter_ready === true &&
      r.control_verified === true &&
      typeof r.control_evidence === 'string' &&
      r.control_evidence.trim().length > 0 &&
      typeof r.configured_basis === 'string' &&
      r.configured_basis.trim().length > 0 &&
      nonExecuting(r);
    if (!exactReady) return result('readiness_contract_incomplete', {blockedReason: r.configured_basis || r.status});
    return result('ready', {serviceOk: true, capabilityReady: true});
  }

  return result('unknown_block', {blockedReason: r.status || null});
}
