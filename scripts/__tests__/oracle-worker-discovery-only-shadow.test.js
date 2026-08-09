'use strict';

const { runDiscoveryOnlyCycle } = require('../oracle-worker-discovery-only.cjs');

const top = Array.from({ length: 31 }, (_, index) => ({
  itemId: String(100 + index), shopId: String(200 + index), productName: `Organizador ${index}`,
  price: 10 + index, originalPrice: 20 + index, offerLink: `https://s.shopee.com.br/${index}`,
  imageUrl: `https://img.example/${index}.jpg`, productCatIds: ['100010'], score: 80,
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

  it('keeps recent Shopee identities out before controlled persistence', async () => {
    let candidates = null;
    await runDiscoveryOnlyCycle({
      tenantId: 'tenant-test', correlationId: 'correlation-history', requestedAt: '2026-08-08T00:00:00.000Z', marketplaces: ['Shopee'],
      discover: async () => { throw new Error('legacy discover must not run'); },
      shopeeDiscovery: async () => ({ decision: 'official', top: top.slice(0, 2), metrics: { raw: 2, parsed: 2, approvedContract: 2, scoreable: 2, final: 2 } }),
      persistShopee: async (payload) => { candidates = payload.candidates; return { accepted: candidates.length, offerIds: [] }; }, persist: async () => ({ accepted: 0 }),
      loadHistory: async () => [{ item_id: '100', shopee_item_id: '100', shopee_shop_id: '200', product_name: 'Organizador 0', current_price: 10, old_price: 20, created_at: '2026-08-07T00:00:00.000Z' }],
      scenarioResolver: () => 'organizacao_editorial',
    });
    expect(candidates.map((candidate) => candidate.sourceItemId)).toEqual(['101']);
  });
});
