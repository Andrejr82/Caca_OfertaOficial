'use strict';

const { COMMERCIAL_NICHES, getCommercialNiche } = require('./commercial-niche-config.cjs');

/**
 * Contratos por Marketplace para os 7 Nichos Comerciais.
 */

const AMAZON_BROWSE_NODES_BY_NICHE = Object.freeze({
  // Fusão Casa/Cozinha + Organização
  casa_cozinha_organizacao: Object.freeze([
    '17100532011', '17124722011', '17124716011',
    '17100533011', '17100522011', '17124717011'
  ]),
  beleza_cuidados_pessoais: Object.freeze(['16754345011', '16754346011', '16754347011']),
  moda_calcados: Object.freeze(['17681970011', '17681966011', '23577004011']),
  eletrodomesticos: Object.freeze(['16745371011', '17124786011', '16745366011']),
  informatica: Object.freeze(['16243803011', '16243794011', '24035344011']),
  ferramentas: Object.freeze(['165793011', '165796011']),
  pet: Object.freeze(['19653951011', '19653950011', '19653948011']),
});

const SHOPEE_CATEGORIES_BY_NICHE = Object.freeze({
  casa_cozinha_organizacao: Object.freeze([100010, 100636]),
  beleza_cuidados_pessoais: Object.freeze([100630, 100001]),
  moda_calcados: Object.freeze([100009, 100011, 100012, 100017, 100532, 100534]),
  eletrodomesticos: Object.freeze([100010]),
  informatica: Object.freeze([100644, 100013]),
  ferramentas: Object.freeze([100636]),
  pet: Object.freeze([100631]),
});

const MERCADOLIVRE_DOMAINS_BY_NICHE = Object.freeze({
  casa_cozinha_organizacao: Object.freeze([
    'MLB-AIR_FRYERS', 'MLB-COFFEE_MAKERS', 'MLB-BLENDERS', 'MLB-VACUUM_CLEANERS',
    'MLB-ELECTRIC_PRESSURE_COOKERS', 'MLB-COOKWARE_SETS', 'MLB-BED_SHEET_SETS',
    'MLB-BATH_TOWELS', 'MLB-DINNERWARE_SETS', 'MLB-KITCHEN_ORGANIZERS'
  ]),
  beleza_cuidados_pessoais: Object.freeze([
    'MLB-FACIAL_SUNSCREENS', 'MLB-FACIAL_MOISTURIZERS', 'MLB-FACIAL_SERUMS',
    'MLB-SHAMPOOS', 'MLB-PERFUMES', 'MLB-MAKEUP', 'MLB-HAIR_DRYERS', 'MLB-DRYING_BRUSHES'
  ]),
  moda_calcados: Object.freeze([
    'MLB-SNEAKERS', 'MLB-MENS_T_SHIRTS', 'MLB-DRESSES', 'MLB-JEANS',
    'MLB-JACKETS', 'MLB-HANDBAGS', 'MLB-BACKPACKS'
  ]),
  eletrodomesticos: Object.freeze([
    'MLB-REFRIGERATORS', 'MLB-WASHING_MACHINES', 'MLB-AIR_CONDITIONERS',
    'MLB-MICROWAVES', 'MLB-STOVES', 'MLB-COOKTOPS', 'MLB-WASHER_DRYERS'
  ]),
  informatica: Object.freeze([
    'MLB-NOTEBOOKS', 'MLB-MONITORS', 'MLB-SOLID_STATE_DRIVES',
    'MLB-PRINTERS', 'MLB-ROUTERS', 'MLB-MINI_PCS'
  ]),
  ferramentas: Object.freeze([
    'MLB-DRILLS', 'MLB-SCREWDRIVERS', 'MLB-TOOL_SETS',
    'MLB-ANGLE_GRINDERS', 'MLB-LASER_MEASURES', 'MLB-CIRCULAR_SAWS'
  ]),
  pet: Object.freeze([
    'MLB-DOG_FOODS', 'MLB-CAT_FOODS', 'MLB-CAT_LITTERS', 'MLB-PET_TRAINING_PADS'
  ]),
});

function getMarketplaceNicheContract(nicheId, marketplace) {
  const niche = getCommercialNiche(nicheId);
  if (!niche) return null;

  const market = String(marketplace || '').trim();
  const affinity = niche.marketplaceAffinity[market] || 2;

  let browseNodes = [];
  let apiCategories = [];
  let domains = [];

  if (market === 'Amazon') {
    browseNodes = AMAZON_BROWSE_NODES_BY_NICHE[nicheId] || [];
  } else if (market === 'Shopee') {
    apiCategories = SHOPEE_CATEGORIES_BY_NICHE[nicheId] || [];
  } else if (market === 'Mercado Livre') {
    domains = MERCADOLIVRE_DOMAINS_BY_NICHE[nicheId] || [];
  }

  return {
    nicheId,
    name: niche.name,
    marketplace: market,
    affinity,
    coreProducts: niche.coreProducts,
    expansionProducts: niche.expansionProducts,
    guardrails: niche.guardrails,
    amazonBrowseNodes: browseNodes,
    shopeeApiCategories: apiCategories,
    mercadoLivreDomains: domains,
  };
}

module.exports = {
  AMAZON_BROWSE_NODES_BY_NICHE,
  SHOPEE_CATEGORIES_BY_NICHE,
  MERCADOLIVRE_DOMAINS_BY_NICHE,
  getMarketplaceNicheContract,
};
