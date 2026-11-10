// Treasury signer status 的验收判定。
//
// 背景：/market/aave/status 返回的是「签名能力就绪度」，不是「操作成败」。
// 在安全门生效时它会返回 ok:false + status:blocked_transaction_adapter +
// configured_basis:existing_legacy_guard_denies_transaction_adapter —— 这表示
// **服务正常、门正常关着**，而不是服务坏了。
//
// 原验收把 ok:false 等同于服务失败，于是 deploy-wep3 每天报红（run 42754740636
// 部署步骤 success、验收步骤 failure，latest.json 跟着停更）。
//
// 这里把判定改成白名单式 fail-closed：
//   - 一旦出现真实执行（signed / transactions / on_chain_executed）→ 立即失败
//   - 只有明确已知的安全门状态才放行，并显式标注是「预期拒绝」
//   - 任何未知状态一律失败，不猜

export const SIGNER_STATUS_SCHEMA = 'ltzzz.treasury-signer-status.v1';

export function classifySignerStatus(result, httpStatus) {
  const r = result && typeof result === 'object' ? result : {};

  if (httpStatus !== 200) {
    return {serviceOk: false, expectedBlock: false, executionOccurred: false, blockedReason: null, verdict: 'http_not_ok'};
  }

  if (r.schema !== SIGNER_STATUS_SCHEMA) {
    return {serviceOk: false, expectedBlock: false, executionOccurred: false, blockedReason: null, verdict: 'schema_mismatch'};
  }

  // 最高优先级：只要出现真实执行迹象就失败，绝不放行。
  const executed = r.signed === true || (typeof r.transactions === 'number' && r.transactions > 0) || r.on_chain_executed === true;
  if (executed) {
    return {serviceOk: false, expectedBlock: false, executionOccurred: true, blockedReason: null, verdict: 'unexpected_execution'};
  }

  if (r.ok === true) {
    return {serviceOk: true, expectedBlock: false, executionOccurred: false, blockedReason: null, verdict: 'ready'};
  }

  // 已知安全门：明确 blocked 且无执行。放行，但把原因原样带出。
  if (r.status === 'blocked_transaction_adapter') {
    return {
      serviceOk: true,
      expectedBlock: true,
      executionOccurred: false,
      blockedReason: r.configured_basis || null,
      verdict: 'expected_safety_block',
    };
  }

  return {serviceOk: false, expectedBlock: false, executionOccurred: false, blockedReason: r.status || null, verdict: 'unknown_block'};
}
