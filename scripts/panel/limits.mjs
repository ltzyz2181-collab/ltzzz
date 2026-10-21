/**
 * AI review panel — absolute ceilings (code only).
 * Reviewers and orchestrators cannot raise these; only a human owner commit can.
 * Source: ops/dispatch/AI-REVIEW-PANEL-20261021.md + RENTAHUMAN-PILOT-20261021.md
 */
export const PANEL_LIMITS = Object.freeze({
  // Step rules
  maxStepUpRatio: 0.2,
  maxStepUpsPer7Days: 1,
  cooldownHoursAfterPass: 24,

  // Absolute ceilings (owner-set once; provisional until owner confirms)
  maxSingleExternalUsd: 10,
  maxRentAHumanPilotTotalUsd: 10,
  maxRentAHumanSingleUsd: 3,
  maxDailyExternalPurchaseUsd: 20,
  maxDailyOutboundUsd: 30,

  // Circuit breaker thresholds
  externalPurchaseRejectStreak: 2,
  fundsRelatedSplitRejectsBreaker: true,

  modeDefault: 'shadow',
  fundingAuthority: 'proposal_only_not_owner_funding_authorization'
});

export const ALLOWED_PROPOSAL_KINDS = Object.freeze([
  'limit_step_up',
  'external_purchase',
  'rentahuman_pilot',
  'circuit_breaker_resume'
]);
