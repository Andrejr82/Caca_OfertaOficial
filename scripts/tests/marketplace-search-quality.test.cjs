'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  DEFAULT_COOLDOWN_DAYS,
  identityFor,
  validateMarketplaceDomain,
  validateOfficialPrice,
  selectEquivalentWinners,
  diversifyByIntent,
  evaluateSearchQuality,
} = require('../marketplace-search-quality.cjs');

test('usa identidade nativa por marketplace', () => {
  assert.equal(identityFor('Mercado Livre', { sourceItemId: 'MLB1', marketplaceMetrics: { catalog_id: 'MLB-CAT-1' } }), 'MLB-CAT-1');
  assert.equal(identityFor('Shopee', { sourceItemId: '9', marketplaceMetrics: { shop_id: '8', item_id: '9' } }), '8:9');
  assert.equal(identityFor('Amazon', { sourceItemId: 'B000000001', marketplaceMetrics: { asin: 'b000000001' } }), 'B000000001');
});

test('rejeita preço inválido e não infere benefício de checkout', () => {
  assert.equal(validateOfficialPrice({ currentPrice: 0 }).valid, false);
  assert.equal(validateOfficialPrice({ currentPrice: 80, originalPrice: 100 }).discountPercent, 20);
  const inconsistent = validateOfficialPrice({ currentPrice: 80, originalPrice: 70 });
  assert.equal(inconsistent.valid, true);
  assert.equal(inconsistent.originalPrice, null);
  assert.deepEqual(inconsistent.warnings, ['preco_anterior_inconsistente']);
});

test('neutraliza preço anterior implausível sem descartar o produto', () => {
  const result = validateOfficialPrice({ currentPrice: 64.9, originalPrice: 2163.33 });
  assert.equal(result.valid, true);
  assert.equal(result.originalPrice, null);
  assert.equal(result.discountPercent, null);
  assert.ok(result.warnings.includes('preco_anterior_implausivel'));
});

test('mantém preço anterior plausível', () => {
  const result = validateOfficialPrice({ currentPrice: 113.9, originalPrice: 157 });
  assert.equal(result.originalPrice, 157);
  assert.equal(result.discountPercent, 27);
  assert.deepEqual(result.warnings, []);
});

test('bloqueia domínios nativos incompatíveis com a intenção no Mercado Livre', () => {
  const cases = [
    ['perfume', 'MLB-PET_COLOGNES_AND_PERFUMES', 'Perfumes', 'dominio_incompativel_perfume_pet'],
    ['shampoo', 'MLB-CAT_AND_DOG_SHAMPOOS_AND_CONDITIONERS', 'Shampoo e Condicionadores', 'dominio_incompativel_shampoo_pet'],
    ['modelador', 'MLB-BAKERY_MOULDERS', 'Modeladores de Padaria', 'dominio_incompativel_modelador_alimentos'],
    ['aparador', 'MLB-BOOKENDS', 'Aparadores para Livros', 'dominio_incompativel_aparador_livros'],
  ];

  for (const [intent, domain_id, category_name, reason] of cases) {
    const result = validateMarketplaceDomain('Mercado Livre', {
      sourceItemId: `MLB-${intent}`,
      intent,
      category: { name: category_name },
      rawPayload: { intent, domain_id, category_name },
    });
    assert.equal(result.valid, false, `${intent}/${domain_id} deve ser bloqueado`);
    assert.equal(result.reason, reason);
  }
});

test('não bloqueia classes válidas de beleza por ambiguidade lexical', () => {
  assert.equal(validateMarketplaceDomain('Mercado Livre', {
    intent: 'modelador',
    rawPayload: { domain_id: 'MLB-HAIR_CURLERS', category_name: 'Modeladores de Cachos' },
  }).valid, true);
  assert.equal(validateMarketplaceDomain('Mercado Livre', {
    intent: 'aparador',
    rawPayload: { domain_id: 'MLB-HAIR_TRIMMERS', category_name: 'Aparadores de Pelos' },
  }).valid, true);
});

test('escolhe o menor preço dentro da mesma equivalência', () => {
  const result = selectEquivalentWinners('Mercado Livre', [
    { sourceItemId: '1', currentPrice: 100, marketplaceMetrics: { catalog_id: 'CAT1' } },
    { sourceItemId: '2', currentPrice: 80, marketplaceMetrics: { catalog_id: 'CAT1' } },
  ]);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].sourceItemId, '2');
});

test('limita concentração por intenção', () => {
  const result = diversifyByIntent('Amazon', [
    { sourceItemId: '1', intentId: 'casa' },
    { sourceItemId: '2', intentId: 'casa' },
    { sourceItemId: '3', intentId: 'casa' },
    { sourceItemId: '4', intentId: 'casa' },
  ], 3);
  assert.equal(result.products.length, 3);
  assert.equal(result.rejected.length, 1);
});

test('mantém até dez variantes por intenção antes da fila editorial', () => {
  const result = evaluateSearchQuality('Amazon', Array.from({ length: 10 }, (_, index) => ({
    sourceItemId: `B0000000${index}`,
    currentPrice: 20 + index,
    intentId: 'eletros_cozinha',
  })));
  assert.equal(result.accepted.length, 10);
  assert.equal(result.metrics.diversityRejected, 0);
});

test('pipeline rejeita domínio incompatível antes do ranking', () => {
  const result = evaluateSearchQuality('Mercado Livre', [
    {
      sourceItemId: 'MLB4687695509',
      currentPrice: 35.51,
      intent: 'perfume',
      rawPayload: { domain_id: 'MLB-PET_COLOGNES_AND_PERFUMES', category_name: 'Perfumes' },
    },
    {
      sourceItemId: 'MLB35751336',
      currentPrice: 44.9,
      intent: 'protetor solar',
      rawPayload: { domain_id: 'MLB-SUNSCREENS', category_name: 'Protetores e Bloqueadores' },
    },
  ]);
  assert.equal(result.metrics.domainRejected, 1);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].sourceItemId, 'MLB35751336');
});

test('pipeline retorna métricas e cooldown de sete dias', () => {
  const result = evaluateSearchQuality('Mercado Livre', [
    { sourceItemId: '1', currentPrice: 90, originalPrice: 100, intentId: 'casa' },
    { sourceItemId: '2', currentPrice: -1, intentId: 'casa' },
  ]);
  assert.equal(result.metrics.cooldownDays, DEFAULT_COOLDOWN_DAYS);
  assert.equal(result.metrics.priceRejected, 1);
  assert.equal(result.accepted.length, 1);
});
