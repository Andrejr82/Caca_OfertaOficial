'use strict';

const { runDiscoveryOnlyCycle } = require('../oracle-worker-discovery-only.cjs');

describe('Discovery-only Shopee OpenAPI shadow connection', () => {
  it('executa shadow metadata sem enviar candidatos V1 para persistência', async () => {
    const shadowCalls = [];
    let persistCalls = 0;
    const result = await runDiscoveryOnlyCycle({
      tenantId: 'tenant-test',
      correlationId: 'correlation-test',
      requestedAt: '2026-08-07T00:00:00.000Z',
      marketplaces: ['Shopee'],
      discover: async () => [],
      shadowDiscovery: async (input) => {
        shadowCalls.push(input);
        return { engine: 'shopee_openapi_v1', mode: 'shadow', scenarioId: input.scenario, topCount: 2, writeAudit: { supabaseWrites: 0, offersWrites: 0, postsWrites: 0, affiliateLinkWrites: 0, publishCalls: 0, oracleCalls: 0 } };
      },
      persist: async () => { persistCalls += 1; throw new Error('persistência não deveria ser chamada sem seleção'); },
      scenarioResolver: () => 'casa_cozinha_editorial',
    });
    expect(shadowCalls).toHaveLength(1);
    expect(shadowCalls[0]).toMatchObject({ marketplace: 'Shopee', scenario: 'casa_cozinha_editorial' });
    expect(result.marketplaces[0].shadow).toMatchObject({ engine: 'shopee_openapi_v1', mode: 'shadow', scenarioId: 'casa_cozinha_editorial', topCount: 2 });
    expect(persistCalls).toBe(0);
  });

  it('mantém o ciclo legado quando não há callback shadow', async () => {
    const result = await runDiscoveryOnlyCycle({
      tenantId: 'tenant-test',
      correlationId: 'correlation-legacy',
      requestedAt: '2026-08-07T00:00:00.000Z',
      marketplaces: ['Shopee'],
      discover: async () => [],
      persist: async () => { throw new Error('não esperado'); },
      scenarioResolver: () => 'casa_cozinha_editorial',
    });
    expect(result.marketplaces[0].shadow).toBeUndefined();
    expect(result.offerIds).toEqual([]);
  });
});
