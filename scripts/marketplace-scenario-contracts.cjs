'use strict';

const { SCENARIOS: SHOPEE_SCENARIOS } = require('./shopee-scenario-config.cjs');
const { SCENARIOS: AMAZON_SCENARIOS } = require('./amazon-scenario-config.cjs');

const MARKETPLACES = Object.freeze(['Shopee', 'Amazon', 'Mercado Livre']);

const COMMON_BLOCKED = Object.freeze([
  'pet', 'cachorro', 'gato', 'ração', 'fitness', 'suplemento',
  'celular', 'notebook', 'eletrônico', 'eletronico',
]);

const EXPLICIT = {
  Shopee: {
    enxoval_casamento: {
      terms: ['jogo de cama', 'lençol', 'fronha', 'edredom', 'cobertor', 'toalha de banho', 'toalha de rosto', 'tapete banheiro', 'cortina', 'jogo americano', 'mesa posta', 'pano de prato', 'organizador de cozinha'],
      categories: [100010, 100636],
      allowedProductTerms: ['cama', 'lençol', 'fronha', 'edredom', 'cobertor', 'toalha', 'banho', 'mesa', 'cozinha', 'cortina', 'tapete'],
      blockedProductTerms: [...COMMON_BLOCKED, 'air fryer', 'liquidificador', 'panela elétrica', 'processador', 'bolsa'],
    },
    moda_masculina: {
      terms: ['camiseta masculina', 'camisa masculina', 'bermuda masculina', 'calça masculina', 'tênis masculino', 'sapato masculino', 'moletom masculino', 'carteira masculina'],
      categories: [100011],
      allowedProductTerms: ['masculino', 'homem', 'camisa', 'camiseta', 'bermuda', 'calça', 'tênis', 'sapato', 'moletom'],
      blockedProductTerms: [...COMMON_BLOCKED, 'feminino', 'bebê'],
    },
  },
  Amazon: {
    enxoval_casamento: {
      terms: ['jogo de cama casal', 'lençol casal', 'fronha', 'edredom casal', 'cobertor', 'toalha de banho', 'toalha de rosto', 'jogo de toalhas', 'tapete banheiro', 'jogo americano', 'mesa posta', 'pano de prato', 'organizador cozinha'],
      categories: [],
      allowedProductTerms: ['cama', 'lençol', 'fronha', 'edredom', 'cobertor', 'toalha', 'banho', 'mesa', 'cozinha', 'cortina', 'tapete'],
      blockedProductTerms: [...COMMON_BLOCKED, 'air fryer', 'liquidificador', 'panela elétrica', 'processador', 'bolsa'],
    },
    moda_masculina: {
      terms: ['camiseta masculina', 'camisa masculina', 'bermuda masculina', 'calça jeans masculina', 'tênis masculino', 'sapato masculino', 'moletom masculino', 'carteira masculina'],
      categories: [],
      allowedProductTerms: ['masculino', 'homem', 'camisa', 'camiseta', 'bermuda', 'calça', 'tênis', 'sapato', 'moletom'],
      blockedProductTerms: [...COMMON_BLOCKED, 'feminino', 'bebê'],
    },
  },
  'Mercado Livre': {
    enxoval_casamento: {
      terms: ['jogo de cama casal', 'lençol casal', 'fronha avulsa', 'edredom casal', 'cobertor casal', 'toalha de banho', 'jogo de toalhas', 'tapete para banheiro', 'jogo americano', 'mesa posta', 'pano de prato', 'organizador de cozinha'],
      categories: [],
      allowedProductTerms: ['cama', 'lençol', 'fronha', 'edredom', 'cobertor', 'toalha', 'banho', 'mesa', 'cozinha', 'cortina', 'tapete'],
      blockedProductTerms: [...COMMON_BLOCKED, 'air fryer', 'liquidificador', 'panela elétrica', 'processador', 'bolsa'],
    },
    moda_masculina: {
      terms: ['camiseta masculina', 'camisa masculina', 'bermuda masculina', 'calça jeans masculina', 'tênis masculino', 'sapato masculino', 'moletom masculino', 'carteira masculina'],
      categories: [],
      allowedProductTerms: ['masculino', 'homem', 'camisa', 'camiseta', 'bermuda', 'calça', 'tênis', 'sapato', 'moletom'],
      blockedProductTerms: [...COMMON_BLOCKED, 'feminino', 'bebê'],
    },
  },
};

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function getMarketplaceScenarioContract(scenarioId, marketplace) {
  if (!MARKETPLACES.includes(marketplace)) {
    throw new Error('Marketplace não autorizado: ' + marketplace);
  }
  const source = marketplace === 'Amazon' ? AMAZON_SCENARIOS : SHOPEE_SCENARIOS;
  const base = source[scenarioId] || SHOPEE_SCENARIOS[scenarioId];
  if (!base) return null;
  const explicit = EXPLICIT[marketplace]?.[scenarioId];
  const terms = explicit?.terms || [...(base.keywords || [])];
  return {
    ...base,
    id: scenarioId,
    scenarioId,
    marketplace,
    source: 'explicit_marketplace_contract',
    terms: [...new Set(terms)],
    keywords: [...new Set(terms)],
    categories: [...(explicit?.categories || base.apiCategories || [])],
    apiCategories: [...(explicit?.categories || base.apiCategories || [])],
    allowedProductTerms: [...new Set(explicit?.allowedProductTerms || base.allowedProductTerms || [])],
    blockedProductTerms: [...new Set(explicit?.blockedProductTerms || base.blockedProductTerms || [])],
  };
}

function matchesMarketplaceContract(contract, title) {
  const value = normalize(title);
  if (!value || !contract) return false;
  if ((contract.blockedProductTerms || []).some((term) => value.includes(normalize(term)))) return false;
  const allowed = contract.allowedProductTerms || [];
  return allowed.length === 0 || allowed.some((term) => value.includes(normalize(term)));
}

module.exports = {
  MARKETPLACES,
  MARKETPLACE_CONTRACTS: EXPLICIT,
  getMarketplaceScenarioContract,
  matchesMarketplaceContract,
};
