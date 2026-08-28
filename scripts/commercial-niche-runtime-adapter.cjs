'use strict';

const {
  getCommercialNiche,
  resolveNicheFromLegacyScenario,
  getAffinityRules,
} = require('./commercial-niche-config.cjs');
const { getMarketplaceNicheContract } = require('./commercial-niche-contracts.cjs');
const { buildFirstDiscoveryPlan } = require('./first-discovery-quality.cjs');
const { getMercadoLivreCertifiedFamilies } = require('./mercadolivre-domain-category-map-v1.cjs');

function normalizeNicheKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getMercadoLivreCertifiedTermsForNiche(nicheId) {
  const target = normalizeNicheKey(nicheId);
  return getMercadoLivreCertifiedFamilies()
    .filter((family) => normalizeNicheKey(family.niche) === target)
    .map((family) => family.family);
}

/**
 * Monta o plano/configuração de execução por marketplace com base na afinidade (1-3).
 * Função pura de configuração, sem efeitos colaterais de rede ou persistência.
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

  // 3. Opportunity Products (Dinâmico a partir de sinais como highlights/best sellers)
  const dynamicOpportunities = Array.isArray(options.opportunityCandidates)
    ? options.opportunityCandidates.map((c) => (typeof c === 'string' ? c : c.title || c.query)).filter(Boolean)
    : [];

  const certifiedMercadoLivreTerms = market === 'Mercado Livre'
    ? getMercadoLivreCertifiedTermsForNiche(nicheId)
    : [];

  const allTerms = certifiedMercadoLivreTerms.length > 0
    ? [...new Set(certifiedMercadoLivreTerms)]
    : [...new Set([...selectedCore, ...selectedExpansion, ...dynamicOpportunities])];

  const baseFirstDiscovery = buildFirstDiscoveryPlan(nicheId, market, {
    affinity,
    rules,
    contract,
    terms: allTerms,
    coreTerms: selectedCore,
    expansionTerms: selectedExpansion,
    targets: options.firstDiscoveryTargets,
  });

  // O Mercado Livre V1 precisa receber exatamente os nomes das famílias
  // certificadas. Overrides editoriais mais amplos são úteis nos outros
  // marketplaces, mas faziam o V1 pular famílias já validadas pelo mapa.
  const firstDiscovery = market === 'Mercado Livre' && certifiedMercadoLivreTerms.length > 0 && baseFirstDiscovery
    ? Object.freeze({
      ...baseFirstDiscovery,
      families: Object.freeze([...certifiedMercadoLivreTerms]),
      intents: Object.freeze(baseFirstDiscovery.intents.map((intent) => Object.freeze({
        ...intent,
        family: intent.term,
        queries: Object.freeze([intent.term]),
      }))),
    })
    : baseFirstDiscovery;

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
    firstDiscovery,
  };
}

/**
 * Resolve a configuração completa para todos os marketplaces a partir de um cenário legado.
 */
function resolveNichePlanFromLegacyScenario(legacyScenarioId, marketplaces = ['Shopee', 'Amazon', 'Mercado Livre'], options = {}) {
  const resolution = resolveNicheFromLegacyScenario(legacyScenarioId);
  if (resolution.mode !== 'niche_mapped') {
    return {
      mode: resolution.mode,
      legacyScenarioId,
      nicheId: null,
      reason: resolution.reason || 'not_niche_mapped',
      plans: {},
    };
  }

  const plans = {};
  for (const marketplace of marketplaces) {
    plans[marketplace] = buildNicheMarketplacePlan(resolution.nicheId, marketplace, options);
  }

  return {
    mode: 'niche_mapped',
    legacyScenarioId,
    nicheId: resolution.nicheId,
    nicheName: resolution.niche.name,
    plans,
  };
}

module.exports = {
  buildNicheMarketplacePlan,
  resolveNichePlanFromLegacyScenario,
};
