'use strict';

const { getShopeeOpenApiV1Decision, runShopeeOpenApiV1ShadowForScenario } = require('./shopee-openapi-v1-adapter.cjs');

const ZERO_WRITE_AUDIT = Object.freeze({
  supabaseWrites: 0,
  offersWrites: 0,
  postsWrites: 0,
  affiliateLinkWrites: 0,
  publishCalls: 0,
  oracleCalls: 0,
});

function scoreAverage(top = []) {
  return top.length ? Number((top.reduce((sum, item) => sum + Number(item?.score || 0), 0) / top.length).toFixed(2)) : 0;
}

function createShopeeOpenApiV1DiscoveryShadow({ env = process.env, request, engineOptions = {}, runScenario = runShopeeOpenApiV1ShadowForScenario } = {}) {
  return async function runDiscoveryShadow({ marketplace = 'Shopee', scenario, correlationId = null } = {}) {
    const scenarioId = String(scenario || '').trim();
    const decision = getShopeeOpenApiV1Decision(scenarioId, env);
    if (!decision.enabled) {
      return {
        engine: 'shopee_openapi_v1', mode: 'official', scenarioId, topCount: 0, rejectedCount: 0,
        families: 0, shops: 0, imageLinkRate: 0, scoreAvg: 0, decision: decision.reason, top: [], writeAudit: { ...ZERO_WRITE_AUDIT },
      };
    }
    const result = await runScenario(scenarioId, { ...engineOptions, env, request, correlationId });
    const audit = { ...ZERO_WRITE_AUDIT, ...(result.writeAudit || {}) };
    if (!result.enabled) {
      return {
        engine: 'shopee_openapi_v1', mode: 'official', scenarioId, topCount: 0, rejectedCount: 0,
        families: 0, shops: 0, imageLinkRate: 0, scoreAvg: 0, decision: result.reason, top: [], writeAudit: audit,
      };
    }
    const scenarioResult = result.result?.scenarios?.[scenarioId] || {};
    const metrics = scenarioResult.metrics || {};
    const top = scenarioResult.top || [];
    return {
      engine: 'shopee_openapi_v1', mode: 'official', scenarioId,
      topCount: Number(metrics.final || top.length || 0),
      rejectedCount: Number(metrics.intentRejected || 0) + Number(metrics.technicalRejected || 0),
      families: Number(metrics.families || 0), shops: Number(metrics.shops || 0),
      imageLinkRate: metrics.imageLink100 ? 100 : 0, scoreAvg: scoreAverage(top), decision: 'official', top, writeAudit: audit,
    };
  };
}

module.exports = { createShopeeOpenApiV1DiscoveryShadow, ZERO_WRITE_AUDIT };
