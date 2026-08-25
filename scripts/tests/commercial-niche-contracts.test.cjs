'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AMAZON_BROWSE_NODES_BY_NICHE,
  SHOPEE_CATEGORIES_BY_NICHE,
  MERCADOLIVRE_NICHE_POLICY,
  getMarketplaceNicheContract,
} = require('../commercial-niche-contracts.cjs');
const { COMMERCIAL_NICHE_IDS } = require('../commercial-niche-config.cjs');

test('1. Fusão de Casa e Organização na Amazon combina os 6 Browse Nodes aprovados', () => {
  const casaNodes = AMAZON_BROWSE_NODES_BY_NICHE.casa_cozinha_organizacao;
  assert.deepEqual(casaNodes, [
    '17100532011', '17124722011', '17124716011',
    '17100533011', '17100522011', '17124717011'
  ]);
});

test('2. Todos os 7 nichos possuem nós Amazon e categorias Shopee aprovadas', () => {
  for (const nicheId of COMMERCIAL_NICHE_IDS) {
    const amazonContract = getMarketplaceNicheContract(nicheId, 'Amazon');
    assert.ok(amazonContract.amazonBrowseNodes.length > 0, `Nicho ${nicheId} deve ter Browse Nodes Amazon`);

    const shopeeContract = getMarketplaceNicheContract(nicheId, 'Shopee');
    assert.ok(shopeeContract.shopeeApiCategories.length > 0, `Nicho ${nicheId} deve ter Categorias Shopee`);
  }
});

test('3. Categorias Shopee correspondem exatamente às aprovadas para todos os 7 nichos', () => {
  assert.deepEqual(SHOPEE_CATEGORIES_BY_NICHE.casa_cozinha_organizacao, [100010, 100636]);
  assert.deepEqual(SHOPEE_CATEGORIES_BY_NICHE.beleza, [100630, 100001]);
  assert.deepEqual(SHOPEE_CATEGORIES_BY_NICHE.moda, [100009, 100011, 100012, 100534]);
  assert.deepEqual(SHOPEE_CATEGORIES_BY_NICHE.eletrodomesticos, [100010]);
  assert.deepEqual(SHOPEE_CATEGORIES_BY_NICHE.informatica, [100644, 100013]);
  assert.deepEqual(SHOPEE_CATEGORIES_BY_NICHE.ferramentas, [100636]);
  assert.deepEqual(SHOPEE_CATEGORIES_BY_NICHE.pet, [100631]);

  // Prova que 100017 e 100532 não estão em moda
  assert.equal(SHOPEE_CATEGORIES_BY_NICHE.moda.includes(100017), false);
  assert.equal(SHOPEE_CATEGORIES_BY_NICHE.moda.includes(100532), false);
});

test('4. Mercado Livre NÃO possui nova matriz hardcoded de domínios por nicho e preserva política', () => {
  const contractML = getMarketplaceNicheContract('casa_cozinha_organizacao', 'Mercado Livre');
  assert.equal(contractML.mercadoLivreDomains, undefined);
  assert.deepEqual(contractML.mercadoLivrePolicy, {
    mode: 'official-domain-then-catalog',
    useBestSellerSignal: true,
  });
  assert.deepEqual(MERCADOLIVRE_NICHE_POLICY, {
    mode: 'official-domain-then-catalog',
    useBestSellerSignal: true,
  });
});
