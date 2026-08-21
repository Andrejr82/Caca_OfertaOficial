'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateCommercialOpportunityScoreV4,
} = require('../../src/core/trends/commercial-opportunity-score-v4.cjs');

test('Shopee factual fallback keeps a strong 50+ score eligible without double-counting seller commission', () => {
  const candidate = {
    marketplace: 'Shopee',
    itemId: '58252884053',
    shopId: '1009975506',
    productName: 'Produto Shopee forte com demanda e desconto reais',
    permalink: 'https://s.shopee.com.br/example',
    imageUrl: 'https://cf.shopee.com.br/example.jpg',
    currentPrice: 110.99,
    sales: 1230,
    ratingStar: 4.8,
    discountPercent: 45,
    commissionRate: 7,
    sellerCommissionRate: 0,
  };

  const score = calculateCommercialOpportunityScoreV4(candidate);

  assert.equal(score.economic_return.effectiveCommissionPercent, 7);
  assert.ok(score.total >= 50 && score.total < 60, `score esperado entre 50 e 59, recebido ${score.total}`);
  assert.equal(score.raw_decision, 'IGNORAR');
  assert.equal(score.selection_decision, 'TESTAR');
  assert.ok(score.determining_reasons.some((reason) => reason.includes('teste Shopee')));
});

test('Shopee fallback does not promote weak or unmonetized candidates', () => {
  const candidate = {
    marketplace: 'Shopee',
    itemId: 'weak-item',
    shopId: 'weak-shop',
    productName: 'Produto sem comissão observada',
    permalink: 'https://s.shopee.com.br/weak',
    imageUrl: 'https://cf.shopee.com.br/weak.jpg',
    currentPrice: 89.9,
    sales: 500,
    ratingStar: 4.9,
    discountPercent: 50,
    commissionRate: 0,
    sellerCommissionRate: 0,
  };

  const score = calculateCommercialOpportunityScoreV4(candidate);
  assert.equal(score.economic_return.commissionStatus, 'unknown');
  assert.equal(score.selection_decision, 'IGNORAR');
});
