'use strict';

const {
  getCommercialNiche,
  resolveNicheFromLegacyScenario,
  getAffinityRules,
} = require('./commercial-niche-config.cjs');
const { getMarketplaceNicheContract } = require('./commercial-niche-contracts.cjs');

/**
 * Monta o plano de execução shadow por marketplace com base na afinidade (1-3).
 */
function buildNicheMarketplacePlan(nicheId, marketplace, options = {}) {
  const niche = getCommercialNiche(nicheId);
  if (!niche) return null;

  const market = String(marketplace || '').trim();
  const affinity = niche.marketplaceAffinity[market] || 2;
  const rules = getAffinityRules(affinity);
  const contract = getMarketplaceNicheContract(nicheId, market);

  // 1. Core Products (100%)
  const selectedCore = [...niche.coreProducts];

  // 2. Expansion Products (100% no Affinity 3, 50% no Affinity 2, 0% no Affinity 1)
  const expansionCount = Math.ceil(niche.expansionProducts.length * rules.expansionPercent);
  const selectedExpansion = niche.expansionProducts.slice(0, expansionCount);

  // 3. Opportunity Products (Dinâmico a partir de sinais externos como highlights/best sellers)
  const dynamicOpportunities = Array.isArray(options.opportunityCandidates)
    ? options.opportunityCandidates.map((c) => (typeof c === 'string' ? c : c.title || c.query)).filter(Boolean)
    : [];

  const allTerms = [...new Set([...selectedCore, ...selectedExpansion, ...dynamicOpportunities])];

  return {
    nicheId,
    nicheName: niche.name,
    marketplace: market,
    affinity,
    rules: {
      maxPagesPerTerm: rules.maxPagesPerTerm,
      candidateLimit: rules.candidateLimit,
      corePercent: rules.corePercent,
      expansionPercent: rules.expansionPercent,
    },
    terms: {
      core: selectedCore,
      expansion: selectedExpansion,
      opportunity: dynamicOpportunities,
      all: allTerms,
    },
    contract,
  };
}

/**
 * Resolve o plano completo para todos os marketplaces a partir de um cenário legado.
 */
function resolveShadowNichePlanFromLegacy(legacyScenarioId, marketplaces = ['Shopee', 'Amazon', 'Mercado Livre'], options = {}) {
  const resolution = resolveNicheFromLegacyScenario(legacyScenarioId);
  if (resolution.mode !== 'shadow_compatible') {
    return {
      mode: resolution.mode,
      legacyScenarioId,
      nicheId: null,
      reason: resolution.reason || 'not_shadow_compatible',
      plans: {},
    };
  }

  const plans = {};
  for (const marketplace of marketplaces) {
    plans[marketplace] = buildNicheMarketplacePlan(resolution.nicheId, marketplace, options);
  }

  return {
    mode: 'shadow_compatible',
    legacyScenarioId,
    nicheId: resolution.nicheId,
    nicheName: resolution.niche.name,
    plans,
  };
}

module.exports = {
  buildNicheMarketplacePlan,
  resolveShadowNichePlanFromLegacy,
};
