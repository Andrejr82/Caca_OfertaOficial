'use strict';

const { describe, expect, it } = require('vitest');
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

describe('TREND_EXECUTIVE_MODE runtime gate', () => {
  it('defaults to off and preserves the current Oracle scenario as authority', () => {
    const plan = buildTrendExecutiveDiscoveryPlan({
      env: {},
      radar: radar(),
      legacyScenario: { id: 'informatica_editorial' },
    });

    expect(TREND_EXECUTIVE_MODE_DEFAULT).toBe('off');
    expect(plan).toEqual(expect.objectContaining({
      requestedMode: 'off',
      effectiveMode: 'off',
      authority: 'legacy_scenario',
      authoritativeScenario: { id: 'informatica_editorial' },
      shadowIntents: [],
    }));
  });

  it('keeps legacy authority while exposing healthy Radar intents in shadow mode', () => {
    const plan = buildTrendExecutiveDiscoveryPlan({
      env: { TREND_EXECUTIVE_MODE: 'shadow' },
      radar: radar(),
      legacyScenario: { id: 'informatica_editorial' },
    });

    expect(plan.effectiveMode).toBe('shadow');
    expect(plan.authority).toBe('legacy_scenario');
    expect(plan.authoritativeScenario).toEqual({ id: 'informatica_editorial' });
    expect(plan.shadowIntents).toHaveLength(1);
    expect(plan.shadowIntents[0]).toEqual(expect.objectContaining({
      radarRunId: 'run-1',
      radarProductId: 'product-1',
      authority: 'shadow_only',
    }));
    expect(plan.radarStatus).toBe('healthy');
  });

  it('falls back to the current scenario when Radar is unhealthy or has no executable intents', () => {
    const plan = buildTrendExecutiveDiscoveryPlan({
      env: { TREND_EXECUTIVE_MODE: 'shadow' },
      radar: radar({ status: 'failed', contracts: [] }),
      legacyScenario: { id: 'casa_cozinha_editorial' },
    });

    expect(plan.effectiveMode).toBe('off');
    expect(plan.authority).toBe('legacy_scenario');
    expect(plan.shadowIntents).toEqual([]);
    expect(plan.radarStatus).toBe('unhealthy');
    expect(plan.fallbackReason).toBe('radar_unhealthy');
  });

  it('keeps active inaccessible until an explicit future activation implementation exists', () => {
    expect(() => buildTrendExecutiveDiscoveryPlan({
      env: { TREND_EXECUTIVE_MODE: 'active' },
      radar: radar(),
      legacyScenario: { id: 'informatica_editorial' },
    })).toThrow(/active.*bloqueado/i);
  });

  it('fails closed to off for invalid mode values', () => {
    expect(resolveTrendExecutiveMode({ TREND_EXECUTIVE_MODE: 'banana' })).toEqual({
      requestedMode: 'banana',
      effectiveMode: 'off',
      reason: 'invalid_mode',
    });
  });
});
