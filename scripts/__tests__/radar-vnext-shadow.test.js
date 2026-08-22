'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRadarVNextShadowComparison } = require('../radar-vnext-shadow.cjs');

function candidate(overrides = {}) {
  return {
    marketplace: 'Shopee',
    itemId: `item-${Math.random()}`,
    shopId: `shop-${Math.random()}`,
    productName: 'Fone TWS Bluetooth X55 LED',
    currentPrice: 29.9,
    sales: 12000,
    ratingStar: 4.9,
    commissionRate: 10,
    permalink: 'https://s.shopee.com.br/example',
    imageUrl: 'https://cf.shopee.com.br/file/example',
    provenance: 'shopee_openapi_productOfferV2',
    ...overrides,
  };
}

test('shadow compares V4 and VNext without mutating official V4 products', () => {
  const target = candidate({ itemId: 'target', shopId: 'target-shop', currentPrice: 20, sales: 30000 });
  const peers = [40, 42, 44, 46, 48].map((price, index) => candidate({ itemId: `peer-${index}`, shopId: `peer-shop-${index}`, currentPrice: price }));
  const pool = [target, ...peers];
  const v4Products = [{ product_term: 'Produto oficial V4', marketplace: 'Shopee', commercial_score: 55 }];
  const before = JSON.stringify(v4Products);

  const result = buildRadarVNextShadowComparison({ candidatePool: pool, v4Products, maxProducts: 20 });

  assert.equal(JSON.stringify(v4Products), before);
  assert.equal(result.mode, 'shadow');
  assert.equal(result.v4_count, 1);
  assert.ok(result.vnext_count > 0);
  assert.ok(Array.isArray(result.vnext_top));
});

test('shadow exposes overlap, average price and peer-confidence diagnostics', () => {
  const a = candidate({ itemId: 'a', shopId: 's-a', productName: 'Fone TWS Bluetooth X55 LED', currentPrice: 20, sales: 20000 });
  const b = candidate({ itemId: 'b', shopId: 's-b', productName: 'Mixer Elétrico Portátil 2 em 1', currentPrice: 25, sales: 15000 });
  const peerA = [35, 36, 37, 38, 39].map((price, index) => candidate({ itemId: `pa-${index}`, shopId: `spa-${index}`, productName: 'Fone TWS Bluetooth X55 LED', currentPrice: price }));
  const peerB = [40, 41, 42].map((price, index) => candidate({ itemId: `pb-${index}`, shopId: `spb-${index}`, productName: 'Mixer Elétrico Portátil 2 em 1', currentPrice: price }));
  const pool = [a, b, ...peerA, ...peerB];
  const v4Products = [
    { product_term: a.productName, marketplace: 'Shopee', direct_evidence: [{ marketplace_identity: { itemId: 'a', shopId: 's-a' }, price: 20 }] },
  ];

  const result = buildRadarVNextShadowComparison({ candidatePool: pool, v4Products, maxProducts: 20 });

  assert.ok(result.overlap_count >= 1);
  assert.equal(typeof result.overlap_ratio, 'number');
  assert.equal(typeof result.vnext_average_price, 'number');
  assert.ok(result.peer_confidence_counts.HIGH >= 1);
  assert.ok(result.peer_confidence_counts.MEDIUM >= 1);
});

test('shadow never writes or returns official products as replacement output', () => {
  const result = buildRadarVNextShadowComparison({ candidatePool: [], v4Products: [{ product_term: 'V4' }] });
  assert.equal(result.replacement_products, undefined);
  assert.deepEqual(result.vnext_top, []);
});
