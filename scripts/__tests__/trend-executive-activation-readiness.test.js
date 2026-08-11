'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildTrendExecutiveActivationPlan,
  buildTrendExecutiveRollbackPlan,
} = require('../trend-executive-activation-readiness.cjs');

function healthyEvidence(overrides = {}) {
  return {
    shadowDays: 7,
    executedRadarIntents: 20,
    validUrlRate: 0.99,
    validNativeIdentityRate: 0.99,
    validPriceRate: 0.99,
    guardBypassCount: 0,
    incrementalValidOfferRate: 0.35,
    qualityDeltaPercent: -2,
    freshnessRejectedDeltaPoints: 3,
    radarOnlyAutoPublications: 0,
    securityRegressionCount: 0,
    technicalReviewApproved: true,
    validationsComplete: true,
    ...overrides,
  };
}

test('blocks activation preparation while shadow evidence is insufficient', () => {
  const plan = buildTrendExecutiveActivationPlan({
    evidence: healthyEvidence({ shadowDays: 1, executedRadarIntents: 2 }),
    cohort: { marketplaces: ['Shopee'], maxIntents: 2 },
  });

  assert.equal(plan.status, 'blocked');
  assert.equal(plan.productionMode, 'off');
  assert.equal(plan.activationAllowed, false);
  assert.ok(plan.blockers.includes('shadow_sample_insufficient'));
});

test('keeps a limited initial cohort fail-closed to Shopee and five intents', () => {
  const unsupported = buildTrendExecutiveActivationPlan({
    evidence: healthyEvidence(),
    cohort: { marketplaces: ['Amazon'], maxIntents: 2 },
  });
  assert.equal(unsupported.status, 'blocked');
  assert.ok(unsupported.blockers.includes('cohort_marketplace_not_allowed'));

  const oversized = buildTrendExecutiveActivationPlan({
    evidence: healthyEvidence(),
    cohort: { marketplaces: ['Shopee'], maxIntents: 6 },
  });
  assert.equal(oversized.status, 'blocked');
  assert.ok(oversized.blockers.includes('cohort_too_large'));
});

test('marks the rollout ready only for operator authorization when evidence and guards pass', () => {
  const plan = buildTrendExecutiveActivationPlan({
    evidence: healthyEvidence(),
    cohort: { marketplaces: ['Shopee'], maxIntents: 3 },
  });

  assert.equal(plan.status, 'ready_for_operator_authorization');
  assert.equal(plan.productionMode, 'off');
  assert.equal(plan.activationAllowed, false);
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(plan.cohort, { marketplaces: ['Shopee'], maxIntents: 3 });
});

test('operator authorization changes readiness state but never changes production mode automatically', () => {
  const plan = buildTrendExecutiveActivationPlan({
    evidence: healthyEvidence(),
    cohort: { marketplaces: ['Shopee'], maxIntents: 2 },
    operatorAuthorized: true,
  });

  assert.equal(plan.status, 'ready_for_manual_activation');
  assert.equal(plan.activationAllowed, true);
  assert.equal(plan.productionMode, 'off');
  assert.equal(plan.requiresManualRuntimeChange, true);
});

test('blocks when any commercial or safety threshold regresses', () => {
  const plan = buildTrendExecutiveActivationPlan({
    evidence: healthyEvidence({
      validUrlRate: 0.97,
      guardBypassCount: 1,
      incrementalValidOfferRate: 0.2,
      qualityDeltaPercent: -6,
      freshnessRejectedDeltaPoints: 6,
      securityRegressionCount: 1,
    }),
    cohort: { marketplaces: ['Shopee'], maxIntents: 2 },
  });

  assert.equal(plan.status, 'blocked');
  assert.ok(plan.blockers.includes('valid_url_rate_below_threshold'));
  assert.ok(plan.blockers.includes('guard_bypass_detected'));
  assert.ok(plan.blockers.includes('incremental_offer_rate_below_threshold'));
  assert.ok(plan.blockers.includes('quality_regression_above_threshold'));
  assert.ok(plan.blockers.includes('freshness_regression_above_threshold'));
  assert.ok(plan.blockers.includes('security_regression_detected'));
});

test('rollback plan always restores off and legacy authority without executing anything', () => {
  const rollback = buildTrendExecutiveRollbackPlan({ reason: 'quality_regression' });

  assert.deepEqual(rollback, {
    trigger: 'quality_regression',
    targetMode: 'off',
    restoreAuthority: 'legacy_scenario',
    requiresManualExecution: true,
    deployAutomatically: false,
    restartAutomatically: false,
    supabaseWrites: false,
  });
});
