'use strict';

const { runDiscoveryOnlyCycle } = require('../oracle-worker-discovery-only.cjs');

const top = Array.from({ length: 31 }, (_, index) => ({
  itemId: String(100 + index), shopId: String(200 + index), productName: `Organizador ${index}`,
  price: 10 + index, originalPrice: 20 + index, offerLink: `https://s.shopee.com.br/${index}`,
  imageUrl: `https://img.example/${index}.jpg`, productCatIds: ['100010'], score: 80,
  marketplaceMetrics: { rating: 4.8, sales: 500, discount: 50 },
}));

describe('Discovery-only Shopee OpenAPI V1 canonical connection', () => {
  it('uses one V1 engine, never calls legacy discover, and persists every fresh V1 candidate without Top30', async () => {
    let legacyDiscoverCalls = 0;
    let v1Calls = 0;
    let persisted = null;
    let metadata = null;
    const result = await runDiscoveryOnlyCycle({
      tenantId: 'tenant-test', correlationId: 'correlation-v1', requestedAt: '2026-08-08T00:00:00.000Z', marketplaces: ['Shopee'],
      discover: async () => { legacyDiscoverCalls += 1; return []; },
      shopeeDiscovery: async () => { v1Calls += 1; return { engine: 'shopee_openapi_v1', mode: 'official', decision: 'official', top, topCount: top.length, metrics: { raw: 40, parsed: 38, approvedContract: 35, scoreable: 33, final: top.length } }; },
      persistShopee: async ({ discovery, candidates, correlationId, scenario }) => {
        persisted = { discovery, candidates, correlationId, scenario };
        return { accepted: candidates.length, inserted: candidates.length, updated: 0, rpcSent: candidates.length, offerIds: [] };
      },
      persist: async () => { throw new Error('generic persistence must not run for canonical Shopee'); },
      persistV2Metadata: async (value) => { metadata = value; },
      loadHistory: async () => [],
      scenarioResolver: () => 'organizacao_editorial',
      scenarioRuntimeResolver: () => ({ scenarioId: 'organizacao_editorial', runtime: 'test' }),
    });
    const summary = result.marketplaces[0];
    expect(legacyDiscoverCalls).toBe(0);
    expect(v1Calls).toBe(1);
    expect(persisted.candidates).toHaveLength(31);
    expect(persisted.discovery.top).toHaveLength(31);
    expect(persisted.correlationId).toBe('correlation-v1');
    expect(metadata.products).toHaveLength(31);
    expect(metadata.funnel.counters).toMatchObject({ extracted: 40, afterParse: 38, afterRelevance: 35, afterIdentityDedup: 33, afterQualityGate: 31, afterNovelty: 31, afterClassification: 31, queueSelected: 31, rpcSent: 31, inserted: 31 });
    expect(summary.discovered).toBe(40);
    expect(summary.persisted).toBe(31);
    expect(summary.queueLimits.persistenceCap).toBeNull();
  });

  it('marks a real V1 zero as empty, but reports V1 API failure instead of a silent empty', async () => {
    const run = (decision, metrics = { raw: 0, parsed: 0, approvedContract: 0, scoreable: 0, final: 0 }) => runDiscoveryOnlyCycle({
      tenantId: 'tenant-test', correlationId: `correlation-${decision}`, requestedAt: '2026-08-08T00:00:00.000Z', marketplaces: ['Shopee'],
      discover: async () => { throw new Error('legacy discover must not run'); },
      shopeeDiscovery: async () => ({ engine: 'shopee_openapi_v1', mode: 'official', decision, top: [], metrics, error: decision === 'failed' ? '503' : undefined }),
      persistShopee: async () => { throw new Error('zero/error must not persist'); }, persist: async () => ({ accepted: 0 }),
      scenarioResolver: () => 'organizacao_editorial',
    });
    const empty = await run('official');
    const failed = await run('failed');
    expect(empty.marketplaces[0].funnelContract).toMatchObject({ status: 'empty', terminalStatus: 'empty' });
    expect(failed.marketplaces[0].funnelContract).toMatchObject({ status: 'failed', terminalStatus: 'failed' });
    expect(failed.status).toBe('failed');
  });

  it('identifica quando a relevância zerou antes de novelty', async () => {
    let metadata = null;
    await runDiscoveryOnlyCycle({
      tenantId: 'tenant-test', correlationId: 'correlation-relevance-zero', requestedAt: '2026-08-08T00:00:00.000Z', marketplaces: ['Shopee'],
      discover: async () => { throw new Error('legacy discover must not run'); },
      shopeeDiscovery: async () => ({
        decision: 'official',
        top: [],
        metrics: { raw: 20, parsed: 20, approvedContract: 0, scoreable: 0, final: 0 },
        rejectionReasons: { positive_domain_missing: 20 },
      }),
      persistShopee: async () => { throw new Error('relevance-zero must not persist'); },
      persist: async () => ({ accepted: 0 }),
      persistV2Metadata: async (value) => { metadata = value; },
      scenarioResolver: () => 'ferramentas_editorial',
    });

    expect(metadata.funnel.counters).toMatchObject({ extracted: 20, afterParse: 20, afterRelevance: 0, afterNovelty: 0 });
    expect(metadata.funnel.rejectionReasons).toEqual({ positive_domain_missing: 20 });
    expect(metadata.funnel.stageTelemetry).toEqual({
      relevance: { input: 20, accepted: 0 },
      novelty: { input: 0, evaluated: false, accepted: 0, rejected: 0 },
    });
  });

  it('keeps Shopee identities and includes revalidated candidates in persistence', async () => {
    let candidates = null;
    await runDiscoveryOnlyCycle({
      tenantId: 'tenant-test', correlationId: 'correlation-history', requestedAt: '2026-08-08T00:00:00.000Z', marketplaces: ['Shopee'],
      discover: async () => { throw new Error('legacy discover must not run'); },
      shopeeDiscovery: async () => ({ decision: 'official', top: top.slice(0, 2), metrics: { raw: 2, parsed: 2, approvedContract: 2, scoreable: 2, final: 2 } }),
      persistShopee: async (payload) => { candidates = payload.candidates; return { accepted: candidates.length, offerIds: [] }; }, persist: async () => ({ accepted: 0 }),
      loadHistory: async () => [{ item_id: '100', shopee_item_id: '100', shopee_shop_id: '200', product_name: 'Organizador 0', current_price: 10, old_price: 20, created_at: '2026-08-07T00:00:00.000Z' }],
      scenarioResolver: () => 'organizacao_editorial',
    });
    expect(candidates.map((candidate) => candidate.sourceItemId)).toEqual(['100', '101']);
  });

  it('inclui histórico revalidado e preenche famílias com candidatos elegíveis', async () => {
    let candidates = null;
    const candidatePool = [
      { ...top[0], itemId: '100', shopId: '200', curatedFamily: 'organizador', score: 99 },
      { ...top[1], itemId: '101', shopId: '201', curatedFamily: 'organizador', score: 98 },
      { ...top[2], itemId: '102', shopId: '202', curatedFamily: 'faqueiro', score: 97 },
      { ...top[3], itemId: '103', shopId: '203', curatedFamily: 'mop', score: 96 },
      { ...top[4], itemId: '104', shopId: '204', curatedFamily: 'lixeira', score: 95 },
      { ...top[5], itemId: '105', shopId: '205', curatedFamily: 'jogo de cama', score: 94 },
    ];
    await runDiscoveryOnlyCycle({
      tenantId: 'tenant-test', correlationId: 'correlation-backfill', requestedAt: '2026-08-31T12:00:00.000Z', marketplaces: ['Shopee'],
      discover: async () => { throw new Error('legacy discover must not run'); },
      shopeeDiscovery: async () => ({
        decision: 'official', top: candidatePool.slice(0, 3), candidatePool,
        metrics: { raw: 20, parsed: 20, approvedContract: 10, scoreable: 6, final: 3 },
      }),
      persistShopee: async (payload) => { candidates = payload.candidates; return { accepted: candidates.length, inserted: candidates.length, offerIds: [] }; },
      persist: async () => ({ accepted: 0 }),
      loadHistory: async () => [{
        shopee_item_id: '100', shopee_shop_id: '200', product_name: 'Organizador 0', status: 'approved',
        current_price: 10, old_price: 20, created_at: '2026-06-01T00:00:00.000Z',
        posts: [{ status: 'published', channel: 'telegram' }],
      }],
      scenarioResolver: () => 'organizacao_editorial',
    });

    expect(candidates.map((candidate) => candidate.sourceItemId)).toEqual(['100', '102', '103', '104', '105']);
    expect(new Set(candidates.map((candidate) => candidate.curatedFamily)).size).toBe(5);
  });

  it('revalida produtos conhecidos e seleciona candidatos elegíveis', async () => {
    let candidates = null;
    const candidatePool = [
      { ...top[0], itemId: '100', shopId: '200', curatedFamily: 'organizador', score: 99 },
      { ...top[1], itemId: '101', shopId: '201', curatedFamily: 'faqueiro', score: 98 },
      { ...top[2], itemId: '102', shopId: '202', curatedFamily: 'mop', score: 97 },
    ];
    await runDiscoveryOnlyCycle({
      tenantId: 'tenant-test', correlationId: 'correlation-unpublished', requestedAt: '2026-08-31T12:00:00.000Z', marketplaces: ['Shopee'],
      discover: async () => { throw new Error('legacy discover must not run'); },
      shopeeDiscovery: async () => ({ decision: 'official', top: candidatePool, candidatePool, metrics: { raw: 3, parsed: 3, approvedContract: 3, scoreable: 3, final: 3 } }),
      persistShopee: async (payload) => { candidates = payload.candidates; return { accepted: candidates.length, offerIds: [] }; },
      persist: async () => ({ accepted: 0 }),
      loadHistory: async () => [
        { shopee_item_id: '100', shopee_shop_id: '200', product_name: 'Organizador 0', status: 'approved', created_at: '2026-08-30T00:00:00.000Z', posts: [] },
        { shopee_item_id: '101', shopee_shop_id: '201', product_name: 'Organizador 1', status: 'rejected', created_at: '2026-08-30T00:00:00.000Z', posts: [] },
      ],
      scenarioResolver: () => 'organizacao_editorial',
    });

    expect(candidates.map((candidate) => candidate.sourceItemId)).toEqual(['100', '101', '102']);
  });
});
