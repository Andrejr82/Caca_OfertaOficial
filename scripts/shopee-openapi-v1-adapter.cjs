'use strict';

const { runScenarioPlan } = require('./shopee-openapi-shadow-engine-v1.cjs');
const { runShopeeFirstDiscoveryDeepening } = require('./shopee-first-discovery-deepening.cjs');
const { getShopeeV1Flags } = require('./shopee-v1-flags.cjs');

const APPROVED_SHOPEE_OPENAPI_V1_SCENARIOS = Object.freeze([
  'casa_cozinha_editorial',
  'organizacao_editorial',
  'ferramentas_editorial',
  'informatica_editorial',
  'celulares_editorial',
  'beleza_editorial',
  'moda_editorial',
  'esporte_editorial',
  'pet_editorial',
  'tv_audio_editorial',
  'eletrodomesticos_editorial',
  'moveis_editorial',
]);

const BLOCKED_SHOPEE_OPENAPI_V1_SCENARIO = 'grandes_ofertas_editorial';
const ZERO_WRITE_AUDIT = Object.freeze({
  supabaseWrites: 0,
  offersWrites: 0,
  postsWrites: 0,
  affiliateLinkWrites: 0,
  publishCalls: 0,
  oracleCalls: 0,
});

function isShopeeOpenApiV1Enabled(env = process.env) {
  return getShopeeV1Flags(env).engine;
}

function isShopeeOpenApiV1Scenario(scenarioId) {
  return APPROVED_SHOPEE_OPENAPI_V1_SCENARIOS.includes(String(scenarioId || '').trim());
}

function getShopeeOpenApiV1Decision(scenarioId, env = process.env) {
  const normalizedScenarioId = String(scenarioId || '').trim();
  if (normalizedScenarioId === BLOCKED_SHOPEE_OPENAPI_V1_SCENARIO) {
    return { enabled: false, reason: 'blocked_v1_scenario', next: 'manual_or_v2' };
  }
  if (!isShopeeOpenApiV1Enabled(env)) {
    return { enabled: false, reason: 'feature_flag_disabled', next: 'disabled' };
  }
  if (!isShopeeOpenApiV1Scenario(normalizedScenarioId)) {
    return { enabled: false, reason: 'scenario_not_allowlisted', next: 'disabled' };
  }
  return { enabled: true, mode: 'official', scenarioId: normalizedScenarioId };
}

async function defaultShadowEngine(scenarioId, options = {}) {
  if (typeof options.request !== 'function') throw new Error('Shopee OpenAPI V1 shadow requer request injetado');
  return runScenarioPlan(scenarioId, {
    request: options.request,
    maxKeywords: options.maxKeywords,
    maxCategories: options.maxCategories,
    signal: options.signal,
    includeDelta: options.includeDelta ?? true,
    includeAuxiliary: options.includeAuxiliary ?? true,
    sharedSources: options.sharedSources || {},
  });
}

function normalizeEngineResult(engineResult) {
  return engineResult?.result?.scenarios ? engineResult.result : engineResult;
}

function getScenarioTopCount(result, scenarioId) {
  const scenarioResult = result?.scenarios?.[scenarioId] || {};
  return Array.isArray(scenarioResult.top) ? scenarioResult.top.length : 0;
}

function shouldAutoDeepenShopeeDiscovery(result, scenarioId, options = {}) {
  if (options.disableAutoDeepening === true) return false;
  if (options.includeDelta !== false || options.includeAuxiliary !== false) return false;
  return getScenarioTopCount(result, scenarioId) === 0;
}

function mergeAutoDeepeningEvidence(primaryResult, deepenedResult, scenarioId) {
  const merged = {
    ...(deepenedResult || {}),
    autoDeepening: {
      enabled: true,
      reason: 'empty_primary_official_result',
      scenarioId,
      primaryTopCount: getScenarioTopCount(primaryResult, scenarioId),
      deepenedTopCount: getScenarioTopCount(deepenedResult, scenarioId),
      sourcesEnabled: ['DELTA', 'shopOfferV2', 'shopeeOfferV2'],
    },
  };
  merged.queryEvidence = {
    ...(deepenedResult?.queryEvidence || {}),
    primary: primaryResult?.queryEvidence || null,
    autoDeepening: merged.autoDeepening,
  };
  return merged;
}

async function runShopeeOpenApiV1ShadowForScenario(scenarioId, options = {}) {
  const env = options.env || process.env;
  const decision = getShopeeOpenApiV1Decision(scenarioId, env);
  if (!decision.enabled) return decision;
  const engine = options.engine || defaultShadowEngine;
  const engineResult = await engine(decision.scenarioId, options);
  const result = normalizeEngineResult(engineResult);

  if (shouldAutoDeepenShopeeDiscovery(result, decision.scenarioId, options)) {
    const deepenedEngineResult = await engine(decision.scenarioId, {
      ...options,
      includeDelta: true,
      includeAuxiliary: true,
    });
    const deepenedResult = normalizeEngineResult(deepenedEngineResult);
    return {
      ...decision,
      result: mergeAutoDeepeningEvidence(result, deepenedResult, decision.scenarioId),
      writeAudit: { ...ZERO_WRITE_AUDIT },
    };
  }

  return { ...decision, result, writeAudit: { ...ZERO_WRITE_AUDIT } };
}

// Official runtime uses the richer First Discovery plan. Tests/diagnostics that
// inject an engine keep the historical two-pass contract above.
async function runShopeeOpenApiV1OfficialForScenario(scenarioId, options = {}) {
  if (typeof options.engine === 'function') {
    return runShopeeOpenApiV1ShadowForScenario(scenarioId, options);
  }
  const env = options.env || process.env;
  const decision = getShopeeOpenApiV1Decision(scenarioId, env);
  if (!decision.enabled) return decision;
  const engineResult = await runShopeeFirstDiscoveryDeepening(decision.scenarioId, { ...options, env });
  return {
    ...decision,
    result: normalizeEngineResult(engineResult),
    deepening: engineResult?.deepening || null,
    writeAudit: { ...ZERO_WRITE_AUDIT },
  };
}

function createShopeeOpenApiV1Dispatcher({ legacyRunner, shadowRunner = runShopeeOpenApiV1ShadowForScenario } = {}) {
  return async function dispatchShopeeScenario(scenarioId, options = {}) {
    const decision = getShopeeOpenApiV1Decision(scenarioId, options.env || process.env);
    if (decision.enabled) return shadowRunner(decision.scenarioId, options);
    return decision;
  };
}

module.exports = {
  APPROVED_SHOPEE_OPENAPI_V1_SCENARIOS,
  isShopeeOpenApiV1Enabled,
  isShopeeOpenApiV1Scenario,
  getShopeeOpenApiV1Decision,
  runShopeeOpenApiV1OfficialForScenario,
  runShopeeOpenApiV1ShadowForScenario,
  createShopeeOpenApiV1Dispatcher,
};
