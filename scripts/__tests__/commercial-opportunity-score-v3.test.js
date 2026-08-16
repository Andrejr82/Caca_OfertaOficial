'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  COMMERCIAL_OPPORTUNITY_STRATEGY_VERSION,
  calculateCommercialOpportunityScoreV3,
  classifyCommercialDecision,
} = require('../../src/core/trends/commercial-opportunity-score-v3.cjs');

test('score v3 prioritizes real velocity, commission and exact marketplace identity', () => {
  const score = calculateCommercialOpportunityScoreV3({
    itemId: '123',
    shopId: '456',
    productName: 'Air Fryer Digital 5 Litros',
    permalink: 'https://shopee.com.br/product/456/123',
    imageUrl: 'https://cf.shopee.com.br/item.jpg',
    sales: 6500,
    currentPrice: 299.9,
    discountPercent: 30,
    commissionRate: 8,
    sellerCommissionRate: 4,
    ratingStar: 4.9,
  }, {
    velocityInfo: {
      velocity_status: 'computed',
      sales_velocity: 250,
    },
  });

  assert.equal(score.strategyVersion, COMMERCIAL_OPPORTUNITY_STRATEGY_VERSION);
  assert.equal(score.breakdown.marketplaceDemand, 22);
  assert.equal(score.breakdown.identityQuality, 20);
  assert.equal(score.breakdown.priceCompetitiveness, 12);
  assert.equal(score.breakdown.commissionPotential, 13);
  assert.equal(score.breakdown.visualPotential, 10);
  assert.equal(score.breakdown.reputation, 5);
  assert.equal(score.total, 82);
  assert.equal(score.decision, 'PRIORIDADE');
});

test('score v3 never treats absolute sales fallback as full trend evidence', () => {
  const score = calculateCommercialOpportunityScoreV3({
    itemId: '999',
    productName: 'Produto com histórico insuficiente',
    permalink: 'https://shopee.com.br/product/1/999',
    imageUrl: 'https://cf.shopee.com.br/999.jpg',
    sales: 25000,
    currentPrice: 99.9,
    discountPercent: 10,
    commissionRate: 3,
    ratingStar: 4.6,
  }, {
    velocityInfo: {
      velocity_status: 'insufficient_history',
      sales_velocity: null,
    },
  });

  assert.equal(score.breakdown.marketplaceDemand, 15);
  assert.ok(score.total < 80);
});

test('score v3 gives zero internal history without verified attribution', () => {
  const candidate = {
    itemId: '1',
    productName: 'Produto',
    permalink: 'https://example.com/1',
    currentPrice: 50,
  };

  const unverified = calculateCommercialOpportunityScoreV3(candidate, {
    internalPerformance: { verified: false, score: 10 },
  });
  const verified = calculateCommercialOpportunityScoreV3(candidate, {
    internalPerformance: { verified: true, score: 10 },
  });

  assert.equal(unverified.breakdown.internalHistory, 0);
  assert.equal(verified.breakdown.internalHistory, 10);
});

test('decision thresholds are deterministic', () => {
  assert.equal(classifyCommercialDecision(80), 'PRIORIDADE');
  assert.equal(classifyCommercialDecision(79), 'TESTAR');
  assert.equal(classifyCommercialDecision(60), 'TESTAR');
  assert.equal(classifyCommercialDecision(59), 'IGNORAR');
});
