'use strict';

const { getCommercialNiche } = require('./commercial-niche-config.cjs');

/**
 * Contratos por Marketplace para os 7 Nichos Comerciais.
 * Fornece parâmetros específicos de cada marketplace sem criar matrizes paralelas.
 */

const AMAZON_BROWSE_NODES_BY_NICHE = Object.freeze({
  // Fusão Casa/Cozinha + Organização
  casa_cozinha_organizacao: Object.freeze([
    '17100532011', '17124722011', '17124716011',
    '17100533011', '17100522011', '17124717011'
  ]),
  beleza: Object.freeze(['16754345011', '16754346011', '16754347011']),
  moda: Object.freeze(['17681970011', '17681966011', '23577004011']),
  eletrodomesticos: Object.freeze(['16745371011', '17124786011', '16745366011']),
  informatica: Object.freeze(['16243803011', '16243794011', '24035344011']),
  ferramentas: Object.freeze(['165793011', '165796011']),
  pet: Object.freeze(['19653951011', '19653950011', '19653948011']),
});

const SHOPEE_CATEGORIES_BY_NICHE = Object.freeze({
  casa_cozinha_organizacao: Object.freeze([100010, 100636]),
  beleza: Object.freeze([100630, 100001]),
  moda: Object.freeze([100009, 100011, 100012, 100534]),
  eletrodomesticos: Object.freeze([100010]),
  informatica: Object.freeze([100644, 100013]),
  ferramentas: Object.freeze([100636]),
  pet: Object.freeze([100631]),
});

const MERCADOLIVRE_NICHE_POLICY = Object.freeze({
  mode: 'official-domain-then-catalog',
  useBestSellerSignal: true,
});

// Termos deliberadamente sem sobreposição com o permitido genérico "modelador".
// O sanitizador remove bloqueios conflitantes com termos permitidos, por isso a
// exclusão usa a evidência do domínio incorreto (nasal/arroz/padaria), não o nome
// válido da classe de beleza.
const MERCADOLIVRE_BLOCKED_BY_NICHE = Object.freeze({
  beleza: Object.freeze([
    'nasal',
    'nariz',
    'nose up',
    'arroz',
    'padaria',
    'modelador de alimentos',
  ]),
});

function getMarketplaceNicheContract(nicheId, marketplace) {
  const niche = getCommercialNiche(nicheId);
  if (!niche) return null;

  const market = String(marketplace || '').trim();
  const affinity = niche.marketplaceAffinity[market] || 2;

  let browseNodes = [];
  let apiCategories = [];

  if (market === 'Amazon') {
    browseNodes = AMAZON_BROWSE_NODES_BY_NICHE[nicheId] || [];
  } else if (market === 'Shopee') {
    apiCategories = SHOPEE_CATEGORIES_BY_NICHE[nicheId] || [];
  }

  const marketplaceBlockedTerms = market === 'Mercado Livre'
    ? (MERCADOLIVRE_BLOCKED_BY_NICHE[nicheId] || [])
    : [];
  const guardrails = {
    ...niche.guardrails,
    blockedProductTerms: Object.freeze([
      ...new Set([...(niche.guardrails?.blockedProductTerms || []), ...marketplaceBlockedTerms]),
    ]),
  };

  return {
    nicheId,
    name: niche.name,
    marketplace: market,
    affinity,
    coreProducts: niche.coreProducts,
    expansionProducts: niche.expansionProducts,
    guardrails,
    amazonBrowseNodes: browseNodes,
    shopeeApiCategories: apiCategories,
    mercadoLivrePolicy: market === 'Mercado Livre' ? MERCADOLIVRE_NICHE_POLICY : null,
  };
}

module.exports = {
  AMAZON_BROWSE_NODES_BY_NICHE,
  SHOPEE_CATEGORIES_BY_NICHE,
  MERCADOLIVRE_NICHE_POLICY,
  MERCADOLIVRE_BLOCKED_BY_NICHE,
  getMarketplaceNicheContract,
};
