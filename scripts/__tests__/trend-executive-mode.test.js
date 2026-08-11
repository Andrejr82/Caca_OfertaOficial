'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TREND_EXECUTIVE_MODE_DEFAULT,
  buildTrendExecutiveDiscoveryPlan,
  resolveTrendExecutiveMode,
} = require('../trend-executive-mode.cjs');

function radar(overrides = {}) {
  return {
    status: 'completed',
    radarRunId: 'run-1',
    contracts: [
      {
        radarRunId: 'run-1',
        radarProductId: 'product-1',
        marketplace: 'Shopee',
        searchTerms: ['Fone Bluetooth M90 Pro 5.3 TWS'],
        authority: 'shadow_only',
      },
    ],
    rejected: [],
    ...overrides,
  };
}

test('defaults to off and preserves the current Oracle scenario as authority', () => {
  const plan = buildTrendExecutiveDiscoveryPlan({
    env: {},
    radar: radar(),
    legacyScenario: { id: 'informatica_editorial' },
  });

  assert.equal(TREND_EXECUTIVE_MODE_DEFAULT, 'off');
  assert.equal(plan.requestedMode, 'off');
  assert.equal(plan.effectiveMode, 'off');
  assert.equal(plan.authority, 'legacy_scenario');
  assert.deepEqual(plan.authoritativeScenario, { id: 'informatica_editorial' });
  assert.deepEqual(plan.shadowIntents, []);
});

test('keeps legacy authority while exposing healthy Radar intents in shadow mode', () => {
  const plan = buildTrendExecutiveDiscoveryPlan({
    env: { TREND_EXECUTIVE_MODE: 'shadow' },
    radar: radar(),
    legacyScenario: { id: 'informatica_editorial' },
  });

  assert.equal(plan.effectiveMode, 'shadow');
  assert.equal(plan.authority, 'legacy_scenario');
  assert.deepEqual(plan.authoritativeScenario, { id: 'informatica_editorial' });
  assert.equal(plan.shadowIntents.length, 1);
  assert.equal(plan.shadowIntents[0].radarRunId, 'run-1');
  assert.equal(plan.shadowIntents[0].radarProductId, 'product-1');
  assert.equal(plan.shadowIntents[0].authority, 'shadow_only');
  assert.equal(plan.radarStatus, 'healthy');
});

test('falls back to the current scenario when Radar is unhealthy or has no executable intents', () => {
  const plan = buildTrendExecutiveDiscoveryPlan({
    env: { TREND_EXECUTIVE_MODE: 'shadow' },
    radar: radar({ status: 'failed', contracts: [] }),
    legacyScenario: { id: 'casa_cozinha_editorial' },
  });

  assert.equal(plan.effectiveMode, 'off');
  assert.equal(plan.authority, 'legacy_scenario');
  assert.deepEqual(plan.shadowIntents, []);
  assert.equal(plan.radarStatus, 'unhealthy');
  assert.equal(plan.fallbackReason, 'radar_unhealthy');
});

test('keeps active inaccessible until an explicit future activation implementation exists', () => {
  assert.throws(() => buildTrendExecutiveDiscoveryPlan({
    env: { TREND_EXECUTIVE_MODE: 'active' },
    radar: radar(),
    legacyScenario: { id: 'informatica_editorial' },
  }), /active.*bloqueado/i);
});

test('fails closed to off for invalid mode values', () => {
  assert.deepEqual(resolveTrendExecutiveMode({ TREND_EXECUTIVE_MODE: 'banana' }), {
    requestedMode: 'banana',
    effectiveMode: 'off',
    reason: 'invalid_mode',
  });
});