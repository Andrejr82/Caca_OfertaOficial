'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AMAZON_BROWSE_NODES_BY_NICHE,
  SHOPEE_CATEGORIES_BY_NICHE,
  MERCADOLIVRE_DOMAINS_BY_NICHE,
  getMarketplaceNicheContract,
} = require('../commercial-niche-contracts.cjs');
const { COMMERCIAL_NICHE_IDS } = require('../commercial-niche-config.cjs');

test('1. Fusão de Casa e Organização na Amazon combina os Browse Nodes corretamente', () => {
  const casaNodes = AMAZON_BROWSE_NODES_BY_NICHE.casa_cozinha_organizacao;
  assert.ok(casaNodes.includes('17100532011'), 'Deve conter nó de Casa');
  assert.ok(casaNodes.includes('17100533011'), 'Deve conter nó de Organização');
  assert.equal(casaNodes.length, 6);
});

test('2. Todos os 7 nichos possuem nós Amazon, categorias Shopee e domínios Mercado Livre', () => {
  for (const nicheId of COMMERCIAL_NICHE_IDS) {
    const amazonContract = getMarketplaceNicheContract(nicheId, 'Amazon');
    assert.ok(amazonContract.amazonBrowseNodes.length > 0, `Nicho ${nicheId} deve ter Browse Nodes Amazon`);

    const shopeeContract = getMarketplaceNicheContract(nicheId, 'Shopee');
    assert.ok(shopeeContract.shopeeApiCategories.length > 0, `Nicho ${nicheId} deve ter Categorias Shopee`);

    const mlContract = getMarketplaceNicheContract(nicheId, 'Mercado Livre');
    assert.ok(mlContract.mercadoLivreDomains.length > 0, `Nicho ${nicheId} deve ter Domínios Mercado Livre`);
  }
});

test('3. Contrato retorna afinidade correta por marketplace', () => {
  const belezaShopee = getMarketplaceNicheContract('beleza_cuidados_pessoais', 'Shopee');
  assert.equal(belezaShopee.affinity, 3);

  const belezaML = getMarketplaceNicheContract('beleza_cuidados_pessoais', 'Mercado Livre');
  assert.equal(belezaML.affinity, 2);

  const modaAmazon = getMarketplaceNicheContract('moda_calcados', 'Amazon');
  assert.equal(modaAmazon.affinity, 2);
});
