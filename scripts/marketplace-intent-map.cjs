'use strict';

const { SCENARIOS: SHOPEE_SCENARIOS } = require('./shopee-scenario-config.cjs');
const { SCENARIOS: AMAZON_SCENARIOS } = require('./amazon-scenario-config.cjs');
const { SEARCH_ALIASES: ML_ALIASES } = require('./mercadolivre-official-intents-v5.cjs');

const MARKETPLACES = ['Shopee', 'Amazon', 'Mercado Livre'];

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
}

function buildIntentMap() {
  const map = {};
  for (const [id, shopee] of Object.entries(SHOPEE_SCENARIOS)) {
    const amazon = AMAZON_SCENARIOS[id] || { keywords: shopee.keywords };
    map[id] = {
      canonical_id: id,
      label: shopee.name,
      marketplaces: {
        Shopee: { terms: [...shopee.keywords], categories: shopee.apiCategories || [] },
        Amazon: { terms: [...amazon.keywords], categories: [] },
        'Mercado Livre': {
          terms: [...new Set(shopee.keywords.flatMap((term) => ML_ALIASES[term] || [term]))],
          categories: []
        }
      }
    };
  }
  return map;
}

const INTENT_MAP = buildIntentMap();

function getIntentMap(scenarioId) {
  if (!INTENT_MAP[scenarioId]) throw new Error(`Intenção canônica não cadastrada: ${scenarioId}`);
  return INTENT_MAP[scenarioId];
}

function getMarketplaceTerms(scenarioId, marketplace) {
  if (!MARKETPLACES.includes(marketplace)) throw new Error(`Marketplace não suportado: ${marketplace}`);
  return getIntentMap(scenarioId).marketplaces[marketplace].terms;
}

module.exports = { MARKETPLACES, INTENT_MAP, normalize, getIntentMap, getMarketplaceTerms };
