/**
 * Legacy shadow-model budget examples, not live approval authority.
 * Current supervisory delegation: config/review-delegation.json.
 * Changes use reviewed code/configuration deployment; reviewers cannot revoke controller rights.
 * Source: ops/dispatch/AI-REVIEW-PANEL-20261021.md + RENTAHUMAN-PILOT-20261021.md
 */
export const PANEL_LIMITS = Object.freeze({
  // Step rules
  maxStepUpRatio: 0.2,
  maxStepUpsPer7Days: 1,
  cooldownHoursAfterPass: 24,

  // Illustrative shadow ceilings; no new real-money budget is authorized here.
  maxSingleExternalUsd: 10,
  maxRentAHumanPilotTotalUsd: 10,
  maxRentAHumanSingleUsd: 3,
  maxDailyExternalPurchaseUsd: 20,
  maxDailyOutboundUsd: 30,

  // Circuit breaker thresholds
  externalPurchaseRejectStreak: 2,
  fundsRelatedSplitRejectsBreaker: false,

  modeDefault: 'shadow',
  fundingAuthority: 'proposal_only_not_owner_funding_authorization'
});

export const ALLOWED_PROPOSAL_KINDS = Object.freeze([
  'limit_step_up',
  'external_purchase',
  'rentahuman_pilot',
  'circuit_breaker_resume'
]);
