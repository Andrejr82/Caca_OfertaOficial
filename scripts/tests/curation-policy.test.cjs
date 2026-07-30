'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  PRICE_TIERS,
  classifyPriceTier,
  classifyProductFamily,
  qualityGate,
  scoreCandidate,
} = require('../curation-policy.cjs');

function product(overrides = {}) {
  return {
    marketplace: 'Mercado Livre',
    sourceItemId: 'fixture-1',
    sourceUrl: 'https://example.com/product',
    imageUrl: 'https://example.com/image.jpg',
    title: 'Smart TV Samsung 55 4K',
    currentPrice: 2099,
    originalPrice: 2500,
    deterministicScore: 8,
    category: { name: 'Televisores' },
    marketplaceMetrics: { sourcePosition: 1, shippingFree: true, officialStoreId: 'store-1', rating: 4.8, sales: 1200 },
    ...overrides,
  };
}

test('classifies the three price tiers', () => {
  assert.equal(classifyPriceTier(90), PRICE_TIERS.IMPULSE);
  assert.equal(classifyPriceTier(300), PRICE_TIERS.MEDIUM);
  assert.equal(classifyPriceTier(1500), PRICE_TIERS.HIGH);
});

test('classifies the new high-value families', () => {
  assert.equal(classifyProductFamily(product()), 'technology_desire');
  assert.equal(classifyProductFamily(product({ title: 'Lava-Louças Brastemp 8 Serviços', category: { name: 'Lava-Louças' } })), 'large_appliance');
  assert.equal(classifyProductFamily(product({ title: 'Guarda-Roupa Casal 6 Portas', category: { name: 'Guarda Roupas' } })), 'home_furniture');
});

test('allows a high-value offer with real savings and warns when Amazon commercial data is absent', () => {
  const accepted = qualityGate(product());
  assert.equal(accepted.eligible, true);
  assert.equal(accepted.tier, PRICE_TIERS.HIGH);
  assert.ok(scoreCandidate(product(), accepted) > 0);

  const rejected = qualityGate(product({ marketplace: 'Amazon', originalPrice: null, marketplaceMetrics: {} }));
  assert.equal(rejected.eligible, true);
  assert.ok(rejected.warnings.includes('DADOS_COMERCIAIS_INDISPONIVEIS'));
  assert.ok(rejected.warnings.includes('AVALIACAO_DE_VANTAGEM_INDISPONIVEL'));
});

test('blocks accessory-only products but keeps a main product containing accessory words', () => {
  const accessory = qualityGate(product({ title: 'Suporte de Celular para Carro', category: { name: 'Acessórios' }, currentPrice: 29, originalPrice: 59, marketplaceMetrics: { sales: 500, rating: 4.8 } }));
  assert.equal(accessory.eligible, false);
  assert.ok(accessory.reasons.includes('ACESSORIO_OU_CONSUMIVEL'));

  const chair = qualityGate(product({ title: 'Cadeira de Escritório com Suporte Lombar', category: { name: 'Cadeiras' }, currentPrice: 531, originalPrice: 906, marketplaceMetrics: { sales: 500, rating: 4.8 } }));
  assert.equal(chair.eligible, true);
});

test('requires Shopee quality signals when they are present', () => {
  const rejected = qualityGate(product({ marketplace: 'Shopee', marketplaceMetrics: { sales: 44, rating: 4.6 }, currentPrice: 199, originalPrice: 299 }));
  assert.equal(rejected.eligible, false);
  assert.ok(rejected.reasons.includes('AVALIACAO_SHOPEE_BAIXA'));
  assert.ok(rejected.reasons.includes('VENDAS_SHOPEE_BAIXAS'));
});
