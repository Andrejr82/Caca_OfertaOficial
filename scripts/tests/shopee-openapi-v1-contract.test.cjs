'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  runShopeeOpenApiV1OfficialForScenario,
  getControlledPersistDecision,
  buildControlledPersistIngestions,
  selectCuratedFamilyRepresentatives,
} = require('../shopee-engine.cjs');

test('controlled persistence decision provides valid enabled configuration', () => {
  const decision = getControlledPersistDecision('casa_cozinha_editorial', process.env, { maxCandidates: 10 });
  assert.equal(decision.enabled, true);
  assert.equal(decision.allowed, true);
  assert.equal(decision.mode, 'controlled-persist');
  assert.equal(decision.scenarioId, 'casa_cozinha_editorial');
  assert.equal(decision.maxCandidates, 10);
});

test('controlled persistence produces deterministic idempotency and checkpoint identities', () => {
  const product = {
    itemId: '1001', shopId: '10', productName: 'Liquidificador potente',
    productLink: 'https://shopee.com.br/product/10/1001', offerLink: 'https://s.shopee.com.br/example',
    imageUrl: 'https://cf.shopee.com.br/image.jpg', currentPrice: 99, originalPrice: 149,
    priceMin: null, priceMax: null, ratingStar: 4.8, sales: 1000, commissionPercent: 8,
    score: 77,
  };
  const context = {
    scenarioId: 'casa_cozinha_editorial', tenantId: 'tenant-1', correlationId: 'run-1',
    requestedAt: '2026-08-13T16:00:00.000Z', maxNewCandidates: 5,
  };
  const first = buildControlledPersistIngestions([product], context);
  const second = buildControlledPersistIngestions([product], context);

  assert.equal(first[0].idempotencyKey, second[0].idempotencyKey);
  assert.equal(first[0].ingestionId, second[0].ingestionId);
  assert.equal(first[0].candidate.candidateId, second[0].candidate.candidateId);
  assert.equal(first[0].correlationId, 'run-1');
});

test('selectCuratedFamilyRepresentatives preserves diversity across curated families', () => {
  const candidates = [
    { itemId: '1', productName: 'Organizador 1', curatedFamily: 'organizador', score: 90, sales: 500 },
    { itemId: '2', productName: 'Organizador 2', curatedFamily: 'organizador', score: 85, sales: 300 },
    { itemId: '3', productName: 'Faqueiro 1', curatedFamily: 'faqueiro', score: 88, sales: 200 },
    { itemId: '4', productName: 'Mop 1', curatedFamily: 'mop', score: 80, sales: 100 },
  ];
  const selected = selectCuratedFamilyRepresentatives(candidates, 3);
  assert.equal(selected.length, 3);
  assert.equal(selected[0].itemId, '1');
  assert.equal(selected[1].itemId, '3');
  assert.equal(selected[2].itemId, '4');
});
