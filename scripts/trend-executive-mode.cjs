'use strict';

const TREND_EXECUTIVE_MODE_DEFAULT = 'off';
const TREND_EXECUTIVE_MODES = Object.freeze(['off', 'shadow', 'active']);

function normalizeMode(value) {
  return String(value ?? '').trim().toLowerCase();
}

function resolveTrendExecutiveMode(env = process.env) {
  const requestedMode = normalizeMode(env?.TREND_EXECUTIVE_MODE) || TREND_EXECUTIVE_MODE_DEFAULT;
  if (!TREND_EXECUTIVE_MODES.includes(requestedMode)) {
    return {
      requestedMode,
      effectiveMode: TREND_EXECUTIVE_MODE_DEFAULT,
      reason: 'invalid_mode',
    };
  }
  return {
    requestedMode,
    effectiveMode: requestedMode,
    reason: null,
  };
}

function normalizeRadarState(radar) {
  const contracts = Array.isArray(radar?.contracts) ? radar.contracts.filter(Boolean) : [];
  const rejected = Array.isArray(radar?.rejected) ? radar.rejected.filter(Boolean) : [];
  const completed = String(radar?.status || '').toLowerCase() === 'completed';
  return {
    status: completed && contracts.length > 0 ? 'healthy' : 'unhealthy',
    contracts,
    rejected,
    radarRunId: radar?.radarRunId || contracts[0]?.radarRunId || null,
  };
}

function buildTrendExecutiveDiscoveryPlan({ env = process.env, radar = null, legacyScenario = null } = {}) {
  const mode = resolveTrendExecutiveMode(env);
  const radarState = normalizeRadarState(radar);

  if (mode.requestedMode === 'active') {
    throw new Error('TREND_EXECUTIVE_MODE=active bloqueado: ativação produtiva ainda não autorizada.');
  }

  if (mode.effectiveMode !== 'shadow') {
    return {
      requestedMode: mode.requestedMode,
      effectiveMode: 'off',
      authority: 'legacy_scenario',
      authoritativeScenario: legacyScenario,
      shadowIntents: [],
      radarRunId: radarState.radarRunId,
      radarStatus: radarState.status,
      rejectedRadarProducts: radarState.rejected,
      fallbackReason: mode.reason,
    };
  }

  if (radarState.status !== 'healthy') {
    return {
      requestedMode: mode.requestedMode,
      effectiveMode: 'off',
      authority: 'legacy_scenario',
      authoritativeScenario: legacyScenario,
      shadowIntents: [],
      radarRunId: radarState.radarRunId,
      radarStatus: 'unhealthy',
      rejectedRadarProducts: radarState.rejected,
      fallbackReason: 'radar_unhealthy',
    };
  }

  return {
    requestedMode: mode.requestedMode,
    effectiveMode: 'shadow',
    authority: 'legacy_scenario',
    authoritativeScenario: legacyScenario,
    shadowIntents: radarState.contracts.map((contract) => ({ ...contract, authority: 'shadow_only' })),
    radarRunId: radarState.radarRunId,
    radarStatus: 'healthy',
    rejectedRadarProducts: radarState.rejected,
    fallbackReason: null,
  };
}

module.exports = {
  TREND_EXECUTIVE_MODE_DEFAULT,
  TREND_EXECUTIVE_MODES,
  buildTrendExecutiveDiscoveryPlan,
  resolveTrendExecutiveMode,
};
