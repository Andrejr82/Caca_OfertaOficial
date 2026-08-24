const {
  CONTROLLED_PERSIST_SCENARIOS,
  getControlledPersistDecision,
  buildControlledPersistIngestions,
  selectControlledPersistCandidates,
} = require('../shopee-openapi-v1-controlled-persist.cjs');

const CONTROLLED_TEST_LIMIT = 5;

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
  'tv_audio_editorial',
  'eletrodomesticos_editorial',
  'moveis_editorial',
];

describe('Shopee OpenAPI V1 controlled persistence', () => {
  it('keeps ranked existing offers while selecting up to five new offers', () => {
    const top = Array.from({ length: 12 }, (_, index) => ({
      itemId: String(9000 + index),
      score: 100 - index,
    }));

    const selected = selectControlledPersistCandidates(top, {
      existingItemIds: ['9000', '9001', '9002', '9003', '9004'],
      maxNewCandidates: 5,
      maxExistingCandidates: 5,
    });

    expect(selected.map((item) => item.itemId)).toEqual([
      '9000', '9001', '9002', '9003', '9004',
      '9005', '9006', '9007', '9008', '9009',
    ]);
  });

  it('does not let existing offers consume the new-insert cap', () => {
    const top = Array.from({ length: 10 }, (_, index) => ({
      itemId: String(9100 + index),
      score: 100 - index,
    }));

    const selected = selectControlledPersistCandidates(top, {
      existingItemIds: ['9100', '9101', '9102', '9103', '9104'],
      maxNewCandidates: CONTROLLED_TEST_LIMIT,
    });

    expect(selected).toHaveLength(10);
    expect(selected.slice(5).map((item) => item.itemId)).toEqual(['9105', '9106', '9107', '9108', '9109']);
  });

  it('respects an operational new-insert limit different from five', () => {
    const top = Array.from({ length: 12 }, (_, index) => ({
      itemId: String(9150 + index), shopId: String(9250 + index), productName: `Novo ${index}`,
      offerLink: `https://s.shopee.com.br/limit-${index}`, imageUrl: `https://cf.shopee.com.br/limit-${index}.jpg`,
      price: 20 + index, productCatIds: ['100010'], score: 100 - index,
    }));
    const selected = buildControlledPersistIngestions(top, {
      scenarioId: 'casa_cozinha_editorial', tenantId: 'tenant-test', correlationId: 'corr-limit',
      requestedAt: '2026-08-08T00:00:00.000Z', maxNewCandidates: 7,
    });

    expect(selected).toHaveLength(7);
    expect(selected.at(-1).candidate.sourceItemId).toBe('9156');
  });

  it('keeps ranking payload and deterministic identity unchanged for new offers', () => {
    const product = {
      itemId: '9200', shopId: '9300', productName: 'Novo',
      offerLink: 'https://s.shopee.com.br/novo', imageUrl: 'https://cf.shopee.com.br/novo.jpg',
      price: 49.9, priceMin: 49.9, priceMax: 59.9, productCatIds: ['100010'],
      score: 82, rankingV1: { score: 82, reasons: ['vendas'] },
    };
    const args = { scenarioId: 'casa_cozinha_editorial', tenantId: 'tenant-test', correlationId: 'corr-1', requestedAt: '2026-08-08T00:00:00.000Z', maxNewCandidates: CONTROLLED_TEST_LIMIT };
    const first = buildControlledPersistIngestions([product], args)[0];
    const second = buildControlledPersistIngestions([product], args)[0];

    expect(first.candidate.idempotencyKey).toBe(second.candidate.idempotencyKey);
    expect(first.candidate.persistenceMetadata.payload_v1.rankingV1).toEqual(product.rankingV1);
    expect(first.candidate.persistenceMetadata.payload_v1.price).toBe(49.9);
  });

  it('preserves original ranking position after bounded existing updates', () => {
    const top = Array.from({ length: 7 }, (_, index) => ({
      itemId: String(9400 + index), shopId: String(9500 + index), productName: `Produto ${index}`,
      offerLink: `https://s.shopee.com.br/rank-${index}`, imageUrl: `https://cf.shopee.com.br/rank-${index}.jpg`,
      price: 20 + index, productCatIds: ['100010'], score: 80,
    }));
    const ingestions = buildControlledPersistIngestions(top, {
      scenarioId: 'casa_cozinha_editorial', tenantId: 'tenant-test', correlationId: 'corr-rank',
      requestedAt: '2026-08-08T00:00:00.000Z', existingItemIds: ['9400', '9401', '9402', '9403', '9404', '9405'], maxNewCandidates: CONTROLLED_TEST_LIMIT,
    });

    expect(ingestions).toHaveLength(6);
    expect(ingestions.at(-1).candidate.sourceItemId).toBe('9406');
    expect(ingestions.at(-1).candidate.discoveryEvidence.position).toBe(7);
  });

  it('keeps persistence disabled by default', () => {
    expect(getControlledPersistDecision('casa_cozinha_editorial', {
      ...baseEnv,
      SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED: 'false',
    })).toMatchObject({ enabled: false, reason: 'persist_flag_disabled' });
  });

  it('allows all 13 controlled persist scenarios', () => {
    expect(Array.from(CONTROLLED_PERSIST_SCENARIOS)).toEqual(expectedScenarios);

    for (const scenario of expectedScenarios) {
      expect(getControlledPersistDecision(scenario, baseEnv, { maxCandidates: CONTROLLED_TEST_LIMIT })).toEqual({
        enabled: true,
        mode: 'controlled-persist',
        scenarioId: scenario,
        maxCandidates: CONTROLLED_TEST_LIMIT,
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
    expect(getControlledPersistDecision('casa_cozinha_editorial', { ...baseEnv, NO_POSTS: '0' }, { maxCandidates: CONTROLLED_TEST_LIMIT }))
      .toMatchObject({ enabled: true, mode: 'controlled-persist' });
  });

  it('applies the explicit deterministic canary cap', () => {
    const top = Array.from({ length: 67 }, (_, index) => ({
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
      maxNewCandidates: CONTROLLED_TEST_LIMIT,
    });

    expect(ingestions).toHaveLength(CONTROLLED_TEST_LIMIT);

    expect(ingestions.map((item) => item.candidate.sourceItemId)).toEqual(['1000', '1001', '1002', '1003', '1004']);
    for (const ingestion of ingestions) {
      expect(ingestion.correlationId).toBe('abc-123');
      expect(ingestion.candidate.persistenceMetadata).toMatchObject({
        engine: 'shopee_openapi_v1',
        mode: 'controlled-persist',
        scenarioId,
        correlation_id: 'abc-123',
      });
      expect(ingestion.candidate.persistenceMetadata.payload_v1).toBeTruthy();
    }
  });

  it('persists only the available approved candidates when fewer exist', () => {
    const top = Array.from({ length: 7 }, (_, index) => ({
      itemId: String(3000 + index),
      shopId: String(4000 + index),
      productName: `Novo produto ${index}`,
      offerLink: `https://s.shopee.com.br/new-${index}`,
      imageUrl: `https://down-br.img.susercontent.com/new-${index}.jpg`,
      price: 49.9,
      originalPrice: 69.9,
      productCatIds: ['100010'],
      score: 80,
    }));

    expect(buildControlledPersistIngestions(top, {
      scenarioId: 'casa_cozinha_editorial',
      tenantId: 'tenant-test',
      correlationId: 'few-new',
      requestedAt: '2026-08-08T00:00:00.000Z',
      maxNewCandidates: CONTROLLED_TEST_LIMIT,
    })).toHaveLength(CONTROLLED_TEST_LIMIT);
  });

  it('não persiste priceMax como originalPrice em payload V1', () => {
    const [ingestion] = buildControlledPersistIngestions([{
      itemId: '81255167', shopId: '9001', productName: 'Produto em range',
      productLink: 'https://shopee.com.br/product/9001/81255167', offerLink: 'https://s.shopee.com.br/range',
      imageUrl: 'https://cf.shopee.com.br/range.jpg', price: 17.05, priceMin: 17.05, priceMax: 90.20,
      priceDiscountRate: 41, originalPrice: 90.20, productCatIds: ['100010'],
    }], { scenarioId: 'casa_cozinha_editorial', tenantId: 'tenant-1', correlationId: 'corr-1', requestedAt: '2026-08-09T00:00:00.000Z', maxNewCandidates: CONTROLLED_TEST_LIMIT });
    expect(ingestion.candidate.currentPrice).toBe(17.05);
    expect(ingestion.candidate.originalPrice).toBeNull();
    expect(ingestion.candidate.persistenceMetadata.payload_v1.originalPrice).toBeNull();
  });
});
