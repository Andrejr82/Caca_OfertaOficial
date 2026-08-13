'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateShopeeOracleCandidate } = require('../shopee-ranking-v1-oracle-bridge.cjs');
const { runShadow } = require('../shopee-openapi-shadow-engine-v1.cjs');

test('Oracle bridge delegates Shopee ranking to the canonical shared core', () => {
  const result = evaluateShopeeOracleCandidate({
    marketplace: 'Shopee', sourceItemId: '1001', title: 'Liquidificador potente 1200W',
    sourceUrl: 'https://shopee.com.br/product/10/1001', currentPrice: 99, originalPrice: 149,
    category: { id: '100', name: 'eletrodomesticos' },
    marketplaceMetrics: { rating: 4.8, sales: 1000, shopId: '10', shopType: 1, commissionRate: 0.08 },
    intent: 'liquidificador',
  });

  assert.equal(result.strategyVersion, 'shopee-ranking-v1');
  assert.equal(result.eligible, true);
  assert.ok(result.score > 0);
});

test('Oracle bridge keeps non-Shopee candidates fail-closed', () => {
  const result = evaluateShopeeOracleCandidate({
    marketplace: 'Amazon', sourceItemId: 'a-1', title: 'Produto', currentPrice: 10,
    category: { name: 'eletrodomesticos' },
  });

  assert.equal(result.eligible, false);
  assert.equal(result.rejectionCode, 'unsupported_marketplace');
});

test('Oracle shadow engine exposes the canonical ranking decision', () => {
  const result = runShadow({
    contracts: {
      casa_cozinha_editorial: {
        positiveDomain: ['casa', 'cozinha', 'liquidificador'], requiredProductClass: ['liquidificador'],
        negativeDomain: [], ambiguousTerms: [], allowedApiCategories: [], blockedApiCategories: [],
        negativeClasses: [], minSales: 10, minRating: 4.5, minDiscount: 0, minCommission: 3,
        maxFamilyPerScenario: 20, maxShopPerScenario: 5,
      },
    },
    sources: {
      productOffers: [{
        itemId: '1001', shopId: '10', productName: 'Liquidificador potente 1200W',
        productLink: 'https://shopee.com.br/product/10/1001', imageUrl: 'https://cf.shopee.com.br/image.jpg',
        price: 99, officialOldPrice: 149, ratingStar: 4.8, sales: 1000, commissionRate: 0.08, shopType: [1],
      }],
    },
  });

  assert.equal(result.scenarios.casa_cozinha_editorial.top[0].rankingV1.strategyVersion, 'shopee-ranking-v1');
});
