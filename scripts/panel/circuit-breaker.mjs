import {PANEL_LIMITS} from './limits.mjs';

/**
 * Evaluate circuit-breaker conditions from a structured observation bag.
 * observations are code-produced facts only (no free text instructions).
 */
export function evaluateBreaker(observations = {}) {
  const tripped = [];

  if (observations.chain_step_ok_but_top_state_inconsistent === true) {
    tripped.push('chain_state_inconsistent');
  }
  if (observations.second_auto_attempt_while_unreconciled === true) {
    tripped.push('unreconciled_retry');
  }
  if (
    Number(observations.external_purchase_reject_streak || 0) >=
    PANEL_LIMITS.externalPurchaseRejectStreak
  ) {
    tripped.push('external_purchase_reject_streak');
  }
  if (observations.over_daily_external_cap === true) {
    tripped.push('over_daily_external_cap');
  }
  if (observations.receipt_hash_mismatch === true || observations.evidence_missing === true) {
    tripped.push('evidence_integrity');
  }
  if (observations.funds_related_split_2_1 === true && PANEL_LIMITS.fundsRelatedSplitRejectsBreaker) {
    tripped.push('funds_related_panel_split');
  }
  if (observations.proxy_auth_probe_open === true) {
    tripped.push('proxy_auth_open');
  }

  return {
    tripped: tripped.length > 0,
    reasons: tripped,
    supervisor_warnings: observations.funds_related_split_2_1 === true ? ['minority_dissent_requires_recorded_response_not_permission_revocation'] : [],
    controller_permissions_changed: false,
    pause_classes: tripped.length
      ? ['auto_external_spend', 'limit_step_up', 'rentahuman_live']
      : [],
    resume_requires: {
      panel_pass_ratio: '2/3',
      cooldown_hours: PANEL_LIMITS.cooldownHoursAfterPass,
      note: 'controller_or_deputy_rechecks_evidence_and_records_repair_no_owner_wait'
    },
    at: new Date().toISOString()
  };
}
