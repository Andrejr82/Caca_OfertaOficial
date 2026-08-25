'use strict';

const { resolveNichePlanFromLegacyScenario } = require('./commercial-niche-runtime-adapter.cjs');

/**
 * Aplica a configuração comercial canônica a um cenário legado sem alterar
 * qualquer motor de busca. Cenários fora dos 7 nichos permanecem intactos.
 */
function applyCommercialNicheScenarioConfig(scenarioId, marketplace, baseScenario, options = {}) {
  if (!baseScenario) return baseScenario;

  const resolved = resolveNichePlanFromLegacyScenario(scenarioId, [marketplace], options);
  if (resolved.mode !== 'niche_mapped') return baseScenario;

  const plan = resolved.plans[marketplace];
  if (!plan?.contract) return baseScenario;

  const contract = plan.contract;
  const guardrails = contract.guardrails || { allowedProductTerms: [], blockedProductTerms: [] };
  const terms = [...plan.terms.all];

  const configured = {
    ...baseScenario,
    keywords: terms,
    allowedProductTerms: [...(guardrails.allowedProductTerms || [])],
    blockedProductTerms: [...(guardrails.blockedProductTerms || [])],
    commercialNiche: Object.freeze({
      id: plan.nicheId,
      name: plan.nicheName,
      affinity: plan.affinity,
      candidateLimit: plan.rules.candidateLimit,
      maxPagesPerTerm: plan.rules.maxPagesPerTerm,
      corePercent: plan.rules.corePercent,
      expansionPercent: plan.rules.expansionPercent,
    }),
  };

  if (marketplace === 'Shopee') {
    configured.apiCategories = [...(contract.shopeeApiCategories || [])];
  }

  if (marketplace === 'Amazon') {
    const nodes = [...(contract.amazonBrowseNodes || [])];
    configured.amazonBrowseNodes = nodes;
    configured.browseNodeIds = nodes;
    configured.apiCategories = nodes;
  }

  return configured;
}

function buildCommercialScenarioMap(baseScenarios, marketplace, options = {}) {
  return Object.freeze(Object.fromEntries(
    Object.entries(baseScenarios || {}).map(([scenarioId, scenario]) => [
      scenarioId,
      applyCommercialNicheScenarioConfig(scenarioId, marketplace, scenario, options),
    ]),
  ));
}

module.exports = {
  applyCommercialNicheScenarioConfig,
  buildCommercialScenarioMap,
};
