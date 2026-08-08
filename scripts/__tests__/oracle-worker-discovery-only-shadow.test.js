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

  it('remove identidades Shopee recentes do shadow antes da persistência', async () => {
    let persistedTop = null;
    const top = [
      { itemId: '100', shopId: '200', productName: 'Organizador histórico', price: 10, originalPrice: 20, productLink: 'https://shopee.com.br/product/200/100', offerLink: 'https://s.shopee.com.br/100', imageUrl: 'https://img/100.jpg' },
      { itemId: '101', shopId: '201', productName: 'Organizador novo', price: 11, originalPrice: 22, productLink: 'https://shopee.com.br/product/201/101', offerLink: 'https://s.shopee.com.br/101', imageUrl: 'https://img/101.jpg' },
    ];
    await runDiscoveryOnlyCycle({
      tenantId: 'tenant-test', correlationId: 'correlation-history', requestedAt: '2026-08-08T00:00:00.000Z', marketplaces: ['Shopee'],
      discover: async () => [],
      shadowDiscovery: async () => ({ decision: 'official', top, topCount: 2, engine: 'shopee_openapi_v1' }),
      persistShadow: async ({ shadow }) => { persistedTop = shadow.top; return { accepted: shadow.top.length, offerIds: [] }; },
      persist: async () => { throw new Error('persist legado não esperado'); },
      loadHistory: async () => [{ item_id: '100', shopee_item_id: '100', shopee_shop_id: '200', product_name: 'Organizador histórico', current_price: 10, old_price: 20, created_at: '2026-08-07T00:00:00.000Z' }],
      scenarioResolver: () => 'casa_cozinha_editorial',
    });
    expect(persistedTop.map((product) => product.itemId)).toEqual(['101']);
  });
});
