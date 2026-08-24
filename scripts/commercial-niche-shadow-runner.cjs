'use strict';

const { resolveShadowNichePlanFromLegacy } = require('./commercial-niche-runtime-adapter.cjs');
const { computeAllKeys } = require('./family-key-engine.cjs');

/**
 * Compara uma lista de produtos legacy com uma lista de produtos shadow de nicho.
 */
function compareLegacyAndNicheProducts(legacyProducts = [], nicheProducts = [], meta = {}) {
  const legacyIds = new Set(
    legacyProducts.map((p) => String(p?.sourceItemId || p?.asin || p?.id || p?.original_url || '')).filter(Boolean)
  );
  const nicheIds = new Set(
    nicheProducts.map((p) => String(p?.sourceItemId || p?.asin || p?.id || p?.original_url || '')).filter(Boolean)
  );

  let overlapCount = 0;
  for (const id of nicheIds) {
    if (legacyIds.has(id)) overlapCount += 1;
  }

  const legacyCount = legacyProducts.length;
  const nicheCount = nicheProducts.length;
  const onlyLegacyCount = Math.max(0, legacyCount - overlapCount);
  const onlyNicheCount = Math.max(0, nicheCount - overlapCount);

  return {
    marketplace: meta.marketplace || 'unknown',
    legacyScenarioId: meta.legacyScenarioId || null,
    nicheId: meta.nicheId || null,
    affinity: meta.affinity || null,
    tier: meta.tier || 'core',
    legacyCount,
    nicheCount,
    overlapCount,
    onlyLegacyCount,
    onlyNicheCount,
    latencyMs: Number(meta.latencyMs || 0),
    persisted: false,
    mode: 'shadow_comparison',
  };
}

/**
 * Executa o shadow comparator em modo puramente read-only / isolado.
 */
async function runCommercialNicheShadowCycle({
  legacyScenarioId,
  legacyResultByMarketplace = {},
  marketplaces = ['Shopee', 'Amazon', 'Mercado Livre'],
  discoverNicheMarketplace = null,
  options = {},
} = {}) {
  const startedAt = Date.now();
  const shadowPlan = resolveShadowNichePlanFromLegacy(legacyScenarioId, marketplaces, options);

  if (shadowPlan.mode !== 'shadow_compatible') {
    return {
      mode: shadowPlan.mode,
      legacyScenarioId,
      nicheId: null,
      reason: shadowPlan.reason,
      comparisons: [],
      totalLatencyMs: Date.now() - startedAt,
    };
  }

  const comparisons = [];

  for (const marketplace of marketplaces) {
    const marketStartedAt = Date.now();
    const plan = shadowPlan.plans[marketplace];
    const legacyProducts = Array.isArray(legacyResultByMarketplace[marketplace])
      ? legacyResultByMarketplace[marketplace]
      : [];

    let nicheCandidates = [];
    if (typeof discoverNicheMarketplace === 'function') {
      try {
        nicheCandidates = await discoverNicheMarketplace(marketplace, plan);
      } catch (error) {
        console.warn(`[Commercial Niche Shadow] Falha na descoberta shadow (${marketplace}): ${error.message}`);
      }
    }

    const marketLatencyMs = Date.now() - marketStartedAt;
    const comparison = compareLegacyAndNicheProducts(legacyProducts, nicheCandidates, {
      marketplace,
      legacyScenarioId,
      nicheId: shadowPlan.nicheId,
      affinity: plan?.affinity,
      tier: 'core_plus_expansion',
      latencyMs: marketLatencyMs,
    });

    comparisons.push(comparison);
  }

  const totalLatencyMs = Date.now() - startedAt;

  return {
    mode: 'shadow_compatible',
    legacyScenarioId,
    nicheId: shadowPlan.nicheId,
    nicheName: shadowPlan.nicheName,
    comparisons,
    totalLatencyMs,
  };
}

module.exports = {
  compareLegacyAndNicheProducts,
  runCommercialNicheShadowCycle,
};
