const {
  CONTROLLED_PERSIST_SCENARIOS,
  CONTROLLED_PERSIST_LIMIT,
  getControlledPersistDecision,
  buildControlledPersistIngestions,
} = require('../shopee-openapi-v1-controlled-persist.cjs');

const baseEnv = {
  SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true',
  SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED: 'true',
  DRY_RUN: '0',
  NO_DB_WRITE: '0',
  NO_POSTS: '1',
  NO_PUBLISH: '1',
};

const expectedScenarios = [
  'casa_cozinha_editorial',
  'organizacao_editorial',
  'ferramentas_editorial',
  'informatica_editorial',
  'celulares_editorial',
  'beleza_editorial',
  'moda_editorial',
  'esporte_editorial',
  'pet_editorial',
  'games_editorial',
  'tv_audio_editorial',
  'eletrodomesticos_editorial',
  'moveis_editorial',
];

describe('Shopee OpenAPI V1 controlled persistence', () => {
  it('keeps persistence disabled by default', () => {
    expect(getControlledPersistDecision('casa_cozinha_editorial', {
      ...baseEnv,
      SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED: 'false',
    })).toMatchObject({ enabled: false, reason: 'persist_flag_disabled' });
  });

  it('allows all 13 controlled persist scenarios', () => {
    expect(Array.from(CONTROLLED_PERSIST_SCENARIOS)).toEqual(expectedScenarios);

    for (const scenario of expectedScenarios) {
      expect(getControlledPersistDecision(scenario, baseEnv)).toEqual({
        enabled: true,
        mode: 'controlled-persist',
        scenarioId: scenario,
        limit: CONTROLLED_PERSIST_LIMIT,
      });
    }
  });

  it('blocks unknown scenario and Grandes Ofertas', () => {
    expect(getControlledPersistDecision('unknown_editorial', baseEnv)).toMatchObject({
      enabled: false,
      reason: 'controlled_persist_scenario_not_allowlisted',
    });

    expect(getControlledPersistDecision('grandes_ofertas_editorial', baseEnv)).toMatchObject({
      enabled: false,
      reason: 'blocked_v1_scenario',
    });
  });

  it('requires non-dry-run write flags for controlled persistence', () => {
    expect(getControlledPersistDecision('casa_cozinha_editorial', { ...baseEnv, DRY_RUN: '1' }))
      .toMatchObject({ enabled: false, reason: 'dry_run_enabled' });

    expect(getControlledPersistDecision('casa_cozinha_editorial', { ...baseEnv, NO_DB_WRITE: '1' }))
      .toMatchObject({ enabled: false, reason: 'no_db_write_enabled' });

    expect(getControlledPersistDecision('casa_cozinha_editorial', { ...baseEnv, NO_PUBLISH: '0' }))
      .toMatchObject({ enabled: false, reason: 'publish_flags_required' });
  });

  it('allows posts generation with NO_POSTS=0 while publication remains blocked', () => {
    expect(getControlledPersistDecision('casa_cozinha_editorial', { ...baseEnv, NO_POSTS: '0' }))
      .toMatchObject({ enabled: true, mode: 'controlled-persist' });
  });

  it('builds at most five traceable V1 ingestions', () => {
    const top = Array.from({ length: 8 }, (_, index) => ({
      itemId: String(1000 + index),
      shopId: String(2000 + index),
      productName: `Produto ${index}`,
      offerLink: `https://s.shopee.com.br/item-${index}`,
      imageUrl: `https://down-br.img.susercontent.com/file-${index}.jpg`,
      price: 99.9,
      originalPrice: 129.9,
      productCatIds: ['100010'],
      sales: 100,
      ratingStar: 4.8,
      priceDiscountRate: 20,
      commissionPercent: 8,
      score: 80,
    }));

    const scenarioId = 'beleza_editorial';
    const ingestions = buildControlledPersistIngestions(top, {
      scenarioId,
      tenantId: 'tenant-test',
      correlationId: 'abc-123',
      requestedAt: '2026-08-08T00:00:00.000Z',
    });

    expect(ingestions).toHaveLength(5);

    for (const ingestion of ingestions) {
      expect(ingestion.correlationId).toBe('shopee-openapi-v1:abc-123');
      expect(ingestion.candidate.persistenceMetadata).toMatchObject({
        engine: 'shopee_openapi_v1',
        mode: 'controlled-persist',
        scenarioId,
        correlation_id: 'shopee-openapi-v1:abc-123',
      });
      expect(ingestion.candidate.persistenceMetadata.payload_v1).toBeTruthy();
    }
  });
});
