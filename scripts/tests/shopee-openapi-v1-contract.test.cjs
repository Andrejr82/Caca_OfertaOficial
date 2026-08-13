'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getShopeeOpenApiV1Decision,
  runShopeeOpenApiV1OfficialForScenario,
} = require('../shopee-openapi-v1-adapter.cjs');
const {
  getControlledPersistDecision,
  buildControlledPersistIngestions,
} = require('../shopee-openapi-v1-controlled-persist.cjs');

test('OpenAPI contract is allowlisted and fail-closed when disabled', () => {
  assert.equal(getShopeeOpenApiV1Decision('casa_cozinha_editorial', {
    SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'false',
  }).enabled, false);
  assert.equal(getShopeeOpenApiV1Decision('grandes_ofertas_editorial', {
    SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true',
  }).enabled, false);
});

test('OpenAPI candidate flow returns a zero-write audited decision', async () => {
  const result = await runShopeeOpenApiV1OfficialForScenario('casa_cozinha_editorial', {
    env: { SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true' },
    engine: async () => ({ scenarios: { casa_cozinha_editorial: { top: [] } } }),
  });

  assert.equal(result.enabled, true);
  assert.deepEqual(result.result.scenarios.casa_cozinha_editorial.top, []);
  assert.deepEqual(result.writeAudit, {
    supabaseWrites: 0, offersWrites: 0, postsWrites: 0,
    affiliateLinkWrites: 0, publishCalls: 0, oracleCalls: 0,
  });
});

test('controlled persistence rejects shadow and missing write guards', () => {
  const safe = {
    SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true',
    SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED: 'true',
    NO_PUBLISH: '1', ARGV: [],
  };
  assert.equal(getControlledPersistDecision('casa_cozinha_editorial', safe).enabled, true);
  assert.equal(getControlledPersistDecision('casa_cozinha_editorial', {
    ...safe, ARGV: ['node', 'worker', '--shopee-ranking-v1-shadow'],
  }).reason, 'shadow_mode_enabled');
  assert.equal(getControlledPersistDecision('casa_cozinha_editorial', {
    ...safe, NO_PUBLISH: '0',
  }).reason, 'publish_flags_required');
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
    requestedAt: '2026-08-13T16:00:00.000Z',
  };
  const first = buildControlledPersistIngestions([product], context);
  const second = buildControlledPersistIngestions([product], context);

  assert.equal(first[0].idempotencyKey, second[0].idempotencyKey);
  assert.equal(first[0].ingestionId, second[0].ingestionId);
  assert.equal(first[0].candidate.candidateId, second[0].candidate.candidateId);
  assert.equal(first[0].correlationId, 'run-1');
});
