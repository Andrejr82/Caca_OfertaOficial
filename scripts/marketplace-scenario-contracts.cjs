'use strict';

const { SCENARIOS: SHOPEE_SCENARIOS } = require('./shopee-scenario-config.cjs');
const { SCENARIOS: AMAZON_SCENARIOS } = require('./amazon-scenario-config.cjs');
const { resolveNichePlanFromLegacyScenario } = require('./commercial-niche-runtime-adapter.cjs');
const {
  COMMON_BLOCKED,
  normalize,
  sanitizeBlockedTerms,
} = require('./editorial-scenario-config.cjs');

const MARKETPLACES = Object.freeze(['Shopee', 'Amazon', 'Mercado Livre']);

function contract(terms, categories, allowed, blocked = []) {
  const allBlocked = [...new Set([...COMMON_BLOCKED, ...blocked])];
  const blockedProductTerms = sanitizeBlockedTerms(allBlocked, allowed, terms);
  return { terms, categories, allowedProductTerms: allowed, blockedProductTerms };
}

function commercialPlanForScenario(scenarioId, marketplace) {
  const resolved = resolveNichePlanFromLegacyScenario(scenarioId, [marketplace]);
  if (resolved.mode !== 'niche_mapped') return null;
  return resolved.plans[marketplace] || null;
}

const EXPLICIT = {
  Shopee: {},
  Amazon: {},
  'Mercado Livre': {},
};

const AMAZON_BROWSE_NODES = Object.freeze({
  casa_cozinha_editorial: ['17100532011', '17124722011', '17124716011'],
  organizacao_editorial: ['17100533011', '17100522011', '17124717011'],
  ferramentas_editorial: ['165793011', '165796011'],
  informatica_editorial: ['16243803011', '16243794011', '24035344011'],
  celulares_editorial: ['16243809011', '16243799011'],
  beleza_editorial: ['16754345011', '16754346011', '16754347011'],
  moda_editorial: ['17681970011', '17681966011', '23577004011'],
  esporte_editorial: ['17833921011', '17833929011', '17833917011'],
  pet_editorial: ['19653951011', '19653950011', '19653948011'],
  tv_audio_editorial: ['16243803011', '16243794011', '16243809011'],
  eletrodomesticos_editorial: ['16745371011', '17124786011', '16745366011'],
  moveis_editorial: ['17100553011', '17100552011', '17100547011'],
  grandes_ofertas_editorial: ['16243809011', '16243803011', '16243794011', '17100532011'],
  cupons_aprovados_editorial: [],
});

const AMAZON_BLOCKED_BY_SCENARIO = Object.freeze({});
const AMAZON_SCENARIO_SPLITS = Object.freeze({});

const AMAZON_ATTRIBUTES_BY_SCENARIO = Object.freeze({
  casa_cozinha_editorial: { productTypes: ['bedding', 'bath', 'tableware', 'coffee_maker', 'air_fryer', 'blender'], attributes: ['size', 'material', 'pieces', 'capacity', 'voltage'], priority: 'medium' },
  organizacao_editorial: { productTypes: ['organizer', 'box', 'basket', 'rack'], attributes: ['material', 'dimensions', 'quantity', 'capacity'], priority: 'medium' },
  ferramentas_editorial: { productTypes: ['drill', 'screwdriver', 'tool_kit', 'grinder'], attributes: ['brand', 'model', 'voltage', 'power', 'pieces'], priority: 'medium' },
  informatica_editorial: { productTypes: ['notebook', 'computer', 'monitor', 'printer', 'ssd'], attributes: ['brand', 'model', 'memory', 'screen', 'connectivity'], priority: 'medium' },
  celulares_editorial: { productTypes: ['smartphone', 'cellphone', 'iphone'], attributes: ['brand', 'model', 'memory', 'screen', 'battery'], priority: 'medium' },
  beleza_editorial: { productTypes: ['skin_care', 'hair_care', 'perfume', 'makeup'], attributes: ['brand', 'volume', 'function', 'skin_type', 'fragrance'], priority: 'medium' },
  moda_editorial: { productTypes: ['shirt', 'pants', 'shoe', 'accessory'], attributes: ['brand', 'size', 'color', 'material', 'gender'], priority: 'medium' },
  esporte_editorial: { productTypes: ['running_shoe', 'fitness_clothing', 'weight', 'yoga', 'supplement'], attributes: ['brand', 'size', 'weight', 'material', 'volume'], priority: 'medium' },
  pet_editorial: { productTypes: ['pet_food', 'bed', 'toy', 'hygiene'], attributes: ['species', 'size', 'weight', 'material', 'flavor'], priority: 'medium' },
  tv_audio_editorial: { productTypes: ['tv', 'soundbar', 'speaker', 'headphone'], attributes: ['brand', 'screen', 'resolution', 'power', 'connectivity'], priority: 'medium' },
  eletrodomesticos_editorial: { productTypes: ['refrigerator', 'stove', 'microwave', 'washer'], attributes: ['brand', 'model', 'capacity', 'dimensions', 'voltage'], priority: 'medium' },
  moveis_editorial: { productTypes: ['sofa', 'wardrobe', 'bed', 'table', 'chair'], attributes: ['material', 'dimensions', 'seats', 'color', 'assembly'], priority: 'medium' },
  grandes_ofertas_editorial: { productTypes: ['smartphone', 'tv', 'notebook', 'appliance'], attributes: ['price', 'old_price', 'discount', 'seller', 'shipping'], priority: 'high' },
  cupons_aprovados_editorial: { productTypes: ['coupon'], attributes: ['code', 'rules', 'valid_until', 'marketplace'], priority: 'high' },
});

for (const marketplace of MARKETPLACES) {
  for (const [scenarioId, scenario] of Object.entries(SHOPEE_SCENARIOS)) {
    const source = marketplace === 'Amazon' ? (AMAZON_SCENARIOS[scenarioId] || scenario) : scenario;
    const commercialPlan = commercialPlanForScenario(scenarioId, marketplace);

    if (commercialPlan?.contract) {
      const nicheContract = commercialPlan.contract;
      const categories = marketplace === 'Amazon'
        ? [...(nicheContract.amazonBrowseNodes || [])]
        : marketplace === 'Shopee'
          ? [...(nicheContract.shopeeApiCategories || [])]
          : [];
      EXPLICIT[marketplace][scenarioId] = contract(
        [...commercialPlan.terms.all],
        categories,
        [...(nicheContract.guardrails?.allowedProductTerms || [])],
        [...(nicheContract.guardrails?.blockedProductTerms || [])],
      );
      continue;
    }

    const browseNodes = (AMAZON_BROWSE_NODES[scenarioId] || source.amazonBrowseNodes || source.browseNodeIds || source.apiCategories || []).filter((id) => id !== '16243802011');
    const categories = marketplace === 'Amazon' ? browseNodes : (source.apiCategories || []);
    EXPLICIT[marketplace][scenarioId] = contract(
      [...(source.keywords || [])],
      categories,
      [...(scenario.allowedProductTerms || [])],
      [...(scenario.blockedProductTerms || [])],
    );
  }
}

function getMarketplaceScenarioContract(scenarioId, marketplace) {
  if (!MARKETPLACES.includes(marketplace)) throw new Error('Marketplace não autorizado: ' + marketplace);
  const source = marketplace === 'Amazon' ? AMAZON_SCENARIOS : SHOPEE_SCENARIOS;
  const base = source[scenarioId] || SHOPEE_SCENARIOS[scenarioId];
  if (!base) return null;
  const explicit = EXPLICIT[marketplace]?.[scenarioId];
  const terms = explicit?.terms || [...(base.keywords || [])];
  const browseNodes = (explicit?.categories || base.apiCategories || base.browseNodeIds || []).map(String).filter((id) => id !== '16243802011');
  const allowed = [...new Set(explicit?.allowedProductTerms || base.allowedProductTerms || [])];
  const rawBlocked = [...new Set([...COMMON_BLOCKED, ...(explicit?.blockedProductTerms || base.blockedProductTerms || [])])];
  const blocked = sanitizeBlockedTerms(rawBlocked, allowed, terms);
  const commercialPlan = commercialPlanForScenario(scenarioId, marketplace);

  return {
    ...base,
    id: scenarioId,
    scenarioId,
    marketplace,
    source: commercialPlan ? 'commercial_niche_contract' : 'explicit_marketplace_contract',
    commercialNiche: commercialPlan ? {
      id: commercialPlan.nicheId,
      name: commercialPlan.nicheName,
      affinity: commercialPlan.affinity,
      candidateLimit: commercialPlan.rules.candidateLimit,
      maxPagesPerTerm: commercialPlan.rules.maxPagesPerTerm,
    } : (base.commercialNiche || null),
    splitInto: [],
    amazonIntelligence: marketplace === 'Amazon'
      ? (AMAZON_ATTRIBUTES_BY_SCENARIO[scenarioId] || {
        productTypes: [...allowed].slice(0, 8),
        attributes: [...(base.attributes || [])],
        priority: base.priority || 'medium',
      })
      : null,
    terms: [...new Set(terms)],
    keywords: [...new Set(terms)],
    categories: marketplace === 'Amazon' ? browseNodes : [...(explicit?.categories || base.apiCategories || [])],
    apiCategories: marketplace === 'Amazon' ? browseNodes : [...(explicit?.categories || base.apiCategories || [])],
    browseNodeIds: marketplace === 'Amazon' ? browseNodes : [],
    allowedProductTerms: allowed,
    blockedProductTerms: blocked,
    queueHour: Number(base.queueHour),
    maxAgeHours: Number(base.maxAgeHours || 4),
    priority: base.priority || 'medium',
    discoveryMode: base.discoveryMode || 'api_search',
    attributes: [...new Set(base.attributes || [])],
  };
}

function matchesMarketplaceContract(contractValue, title) {
  const value = normalize(title);
  if (!value || !contractValue) return false;
  const containsTerm = (term) => {
    const normalizedTerm = normalize(term).replace(/[^a-z0-9]+/g, ' ').trim();
    return normalizedTerm && (` ${value.replace(/[^a-z0-9]+/g, ' ')} `).includes(` ${normalizedTerm} `);
  };
  if ((contractValue.blockedProductTerms || []).some(containsTerm)) return false;
  const allowed = contractValue.allowedProductTerms || [];
  return allowed.length === 0 || allowed.some(containsTerm);
}

module.exports = { MARKETPLACES, MARKETPLACE_CONTRACTS: EXPLICIT, getMarketplaceScenarioContract, matchesMarketplaceContract, AMAZON_SCENARIO_SPLITS, AMAZON_ATTRIBUTES_BY_SCENARIO };
