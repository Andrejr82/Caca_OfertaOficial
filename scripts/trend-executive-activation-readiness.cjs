'use strict';

const INITIAL_ALLOWED_MARKETPLACES = Object.freeze(['Shopee']);
const MAX_INITIAL_INTENTS = 5;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rateAtLeast(value, minimum) {
  const number = finiteNumber(value);
  return number !== null && number >= minimum;
}

function numberAtMost(value, maximum) {
  const number = finiteNumber(value);
  return number !== null && number <= maximum;
}

function buildBlockers(evidence = {}, cohort = {}) {
  const blockers = [];
  const shadowDays = finiteNumber(evidence.shadowDays) || 0;
  const executedRadarIntents = finiteNumber(evidence.executedRadarIntents) || 0;

  if (shadowDays < 7 || executedRadarIntents < 20) blockers.push('shadow_sample_insufficient');
  if (!rateAtLeast(evidence.validUrlRate, 0.98)) blockers.push('valid_url_rate_below_threshold');
  if (!rateAtLeast(evidence.validNativeIdentityRate, 0.98)) blockers.push('native_identity_rate_below_threshold');
  if (!rateAtLeast(evidence.validPriceRate, 0.98)) blockers.push('valid_price_rate_below_threshold');
  if (!numberAtMost(evidence.guardBypassCount, 0)) blockers.push('guard_bypass_detected');
  if (!rateAtLeast(evidence.incrementalValidOfferRate, 0.30)) blockers.push('incremental_offer_rate_below_threshold');
  if (!rateAtLeast(evidence.qualityDeltaPercent, -5)) blockers.push('quality_regression_above_threshold');
  if (!numberAtMost(evidence.freshnessRejectedDeltaPoints, 5)) blockers.push('freshness_regression_above_threshold');
  if (!numberAtMost(evidence.radarOnlyAutoPublications, 0)) blockers.push('radar_only_auto_publication_detected');
  if (!numberAtMost(evidence.securityRegressionCount, 0)) blockers.push('security_regression_detected');
  if (evidence.technicalReviewApproved !== true) blockers.push('technical_review_pending');
  if (evidence.validationsComplete !== true) blockers.push('validations_incomplete');

  const marketplaces = Array.isArray(cohort.marketplaces)
    ? [...new Set(cohort.marketplaces.map((value) => String(value || '').trim()).filter(Boolean))]
    : [];
  const maxIntents = finiteNumber(cohort.maxIntents);

  if (marketplaces.length === 0) blockers.push('cohort_missing');
  if (marketplaces.some((marketplace) => !INITIAL_ALLOWED_MARKETPLACES.includes(marketplace))) {
    blockers.push('cohort_marketplace_not_allowed');
  }
  if (maxIntents === null || maxIntents < 1 || maxIntents > MAX_INITIAL_INTENTS) {
    blockers.push('cohort_too_large');
  }

  return {
    blockers,
    cohort: {
      marketplaces,
      maxIntents: maxIntents === null ? null : maxIntents,
    },
  };
}

function buildTrendExecutiveActivationPlan({ evidence = {}, cohort = {}, operatorAuthorized = false } = {}) {
  const evaluation = buildBlockers(evidence, cohort);
  const hasBlockers = evaluation.blockers.length > 0;
  const activationAllowed = !hasBlockers && operatorAuthorized === true;

  return Object.freeze({
    status: hasBlockers
      ? 'blocked'
      : activationAllowed
        ? 'ready_for_manual_activation'
        : 'ready_for_operator_authorization',
    productionMode: 'off',
    activationAllowed,
    requiresManualRuntimeChange: activationAllowed,
    authorityUntilManualActivation: 'legacy_scenario',
    cohort: Object.freeze({ ...evaluation.cohort }),
    blockers: Object.freeze([...evaluation.blockers]),
  });
}

function buildTrendExecutiveRollbackPlan({ reason = 'manual_rollback' } = {}) {
  return Object.freeze({
    trigger: String(reason || 'manual_rollback'),
    targetMode: 'off',
    restoreAuthority: 'legacy_scenario',
    requiresManualExecution: true,
    deployAutomatically: false,
    restartAutomatically: false,
    supabaseWrites: false,
  });
}

module.exports = {
  INITIAL_ALLOWED_MARKETPLACES,
  MAX_INITIAL_INTENTS,
  buildTrendExecutiveActivationPlan,
  buildTrendExecutiveRollbackPlan,
};
