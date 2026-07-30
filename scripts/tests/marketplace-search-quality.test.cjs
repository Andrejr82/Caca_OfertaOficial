'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  DEFAULT_COOLDOWN_DAYS,
  identityFor,
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

test('pipeline retorna métricas e cooldown de sete dias', () => {
  const result = evaluateSearchQuality('Mercado Livre', [
    { sourceItemId: '1', currentPrice: 90, originalPrice: 100, intentId: 'casa' },
    { sourceItemId: '2', currentPrice: -1, intentId: 'casa' },
  ]);
  assert.equal(result.metrics.cooldownDays, DEFAULT_COOLDOWN_DAYS);
  assert.equal(result.metrics.priceRejected, 1);
  assert.equal(result.accepted.length, 1);
});
