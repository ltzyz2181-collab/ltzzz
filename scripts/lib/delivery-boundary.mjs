// GPT 2026-11-16 disposition #8（conditional_approve，ref accc365c8999ec45）：
// 自动交付边界。只有五个条件同时成立才允许自动交付，任一缺失一律退回草稿或人工，
// 不得以"看起来成功"代替平台回执。本模块只做判定，不发起任何交付动作。
export const DELIVERY_BOUNDARY_REVISION = 'delivery-boundary-v1';

const SHA = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9._:-]{1,160}$/;

const CHECKS = {
  platform_event: v => v && typeof v === 'object' && ID.test(v.event_id || '') && ID.test(v.event_type || '') && !/(test|synthetic|mock)/i.test(v.event_type || ''),
  order_state: v => v && typeof v === 'object' && ['paid', 'confirmed', 'fulfilled_pending'].includes(v.state),
  independent_verification: v => v && typeof v === 'object' && v.verified === true && SHA.test(v.artifact_sha256 || '') && v.independent_of_worker_providers === true,
  idempotency_key: v => typeof v === 'string' && ID.test(v),
  platform_receipt: v => v && typeof v === 'object' && ID.test(v.receipt_id || '') && SHA.test(v.receipt_sha256 || '')
};

export const DELIVERY_CONDITIONS = Object.keys(CHECKS);

export function evaluateDeliveryBoundary(candidate = {}) {
  const failed = DELIVERY_CONDITIONS.filter(name => !CHECKS[name](candidate[name]));
  // 平台事件/独立校验/平台回执任一缺失 → 只能留草稿；仅订单态或幂等键缺失 → 允许人工确认。
  const hardBlock = failed.some(name => ['platform_event', 'independent_verification', 'platform_receipt'].includes(name));
  const decision = failed.length === 0 ? 'auto_deliver_allowed' : hardBlock ? 'draft_only' : 'manual_confirm_required';
  return {
    revision: DELIVERY_BOUNDARY_REVISION,
    decision,
    conditions_met: DELIVERY_CONDITIONS.filter(name => !failed.includes(name)),
    conditions_missing: failed,
    fail_closed: true,
    delivery_attempted: false,
    external_submission_attempted: false,
    financial_execution: false,
    reason: failed.length === 0
      ? '五个条件齐备：平台事件+订单态+独立交付校验+幂等键+平台回执'
      : '缺条件：' + failed.join(',') + '；按口径留草稿或转人工，不得自动交付'
  };
}
