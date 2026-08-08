'use strict';

const { createShopeeOpenApiV1DiscoveryShadow } = require('../shopee-openapi-v1-discovery-shadow.cjs');

describe('Shopee OpenAPI V1 discovery-only shadow bridge', () => {
  it('converte o resultado V1 em metadata observável sem payload de persistência', async () => {
    const runScenario = async () => ({
      enabled: true,
      mode: 'shadow',
      result: { scenarios: { casa_cozinha_editorial: { top: [{ score: 80 }, { score: 70 }], metrics: { final: 2, intentRejected: 4, families: 2, shops: 2, imageLink100: true } } } },
      writeAudit: { supabaseWrites: 0, offersWrites: 0, postsWrites: 0, affiliateLinkWrites: 0, publishCalls: 0, oracleCalls: 0 },
    });
    const shadow = createShopeeOpenApiV1DiscoveryShadow({ env: { SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true' }, runScenario });
    const metadata = await shadow({ marketplace: 'Shopee', scenario: 'casa_cozinha_editorial', products: [{ sourceItemId: 'legacy-only' }] });
    expect(metadata).toEqual({
      engine: 'shopee_openapi_v1', mode: 'official', scenarioId: 'casa_cozinha_editorial', topCount: 2, rejectedCount: 4,
      families: 2, shops: 2, imageLinkRate: 100, scoreAvg: 75, decision: 'official', top: [{ score: 80 }, { score: 70 }],
      writeAudit: { supabaseWrites: 0, offersWrites: 0, postsWrites: 0, affiliateLinkWrites: 0, publishCalls: 0, oracleCalls: 0 },
    });
  });

  it('não promove Grandes Ofertas e não executa runner V1', async () => {
    let calls = 0;
    const shadow = createShopeeOpenApiV1DiscoveryShadow({ env: { SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true' }, runScenario: async () => { calls += 1; return {}; } });
    const metadata = await shadow({ marketplace: 'Shopee', scenario: 'grandes_ofertas_editorial' });
    expect(metadata).toMatchObject({ engine: 'shopee_openapi_v1', mode: 'official', scenarioId: 'grandes_ofertas_editorial', decision: 'blocked_v1_scenario', topCount: 0, imageLinkRate: 0 });
    expect(calls).toBe(0);
  });
});
