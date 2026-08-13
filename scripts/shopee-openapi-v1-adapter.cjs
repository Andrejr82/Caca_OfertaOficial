'use strict';

const { runScenarioPlan } = require('./shopee-openapi-shadow-engine-v1.cjs');
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
  'games_editorial',
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
    includeDelta: options.includeDelta ?? true,
    includeAuxiliary: options.includeAuxiliary ?? true,
    sharedSources: options.sharedSources || {},
  });
}

async function runShopeeOpenApiV1ShadowForScenario(scenarioId, options = {}) {
  const env = options.env || process.env;
  const decision = getShopeeOpenApiV1Decision(scenarioId, env);
  if (!decision.enabled) return decision;
  const engine = options.engine || defaultShadowEngine;
  const result = await engine(decision.scenarioId, options);
  return { ...decision, result, writeAudit: { ...ZERO_WRITE_AUDIT } };
}

// Official cycles use this name. The historical shadow-named export remains
// for isolated diagnostics and compatibility tests only.
async function runShopeeOpenApiV1OfficialForScenario(scenarioId, options = {}) {
  return runShopeeOpenApiV1ShadowForScenario(scenarioId, options);
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
