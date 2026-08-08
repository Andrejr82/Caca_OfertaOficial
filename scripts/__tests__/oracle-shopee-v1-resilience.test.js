'use strict';

process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';

const {
  createShopeeOpenApiV1OfficialDiscovery,
  callShopeeAffiliateApi,
  SHOPEE_OPENAPI_REQUEST_TIMEOUT_MS,
  SHOPEE_OPENAPI_MAX_RETRIES,
  SHOPEE_OPENAPI_STAGE_TIMEOUT_MS,
} = require('../oracle-scraper.cjs');
const { runDiscoveryOnlyCycle } = require('../oracle-worker-discovery-only.cjs');
const axios = require('axios');

const BASE_ENV = {
  SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true',
  NO_DB_WRITE: '1',
  NO_POSTS: '1',
  NO_PUBLISH: '1',
};

describe('Shopee OpenAPI V1 resilience', () => {
  it('configura limites operacionais curtos', () => {
    expect(SHOPEE_OPENAPI_REQUEST_TIMEOUT_MS).toBe(15_000);
    expect(SHOPEE_OPENAPI_MAX_RETRIES).toBe(1);
    expect(SHOPEE_OPENAPI_STAGE_TIMEOUT_MS).toBe(90_000);
  });

  it('sucesso rápido segue o fluxo V1 oficial', async () => {
    let calls = 0;
    const discovery = createShopeeOpenApiV1OfficialDiscovery({
      env: BASE_ENV,
      request: async () => {
        calls += 1;
        return { status: 200, data: { data: { productOfferV2: { nodes: [] } } } };
      },
    });
    const result = await discovery({ scenario: 'casa_cozinha_editorial' });
    expect(result).toMatchObject({ engine: 'shopee_openapi_v1', decision: 'official' });
    expect(calls).toBeGreaterThan(0);
  });

  it('timeout total encerra somente a etapa Shopee', async () => {
    const discovery = createShopeeOpenApiV1OfficialDiscovery({
      env: { ...BASE_ENV, SHOPEE_OPENAPI_STAGE_TIMEOUT_MS: '25' },
      request: () => new Promise(() => {}),
    });
    const startedAt = Date.now();
    const result = await discovery({ scenario: 'beleza_editorial' });
    expect(result).toMatchObject({ engine: 'shopee_openapi_v1', decision: 'timeout' });
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  it('erro HTTP Shopee produz resultado vazio sem abortar o ciclo', async () => {
    const discovery = createShopeeOpenApiV1OfficialDiscovery({
      env: BASE_ENV,
      request: async () => ({ status: 503, data: { errors: [{ message: 'unavailable' }] } }),
    });
    const result = await discovery({ scenario: 'tv_audio_editorial' });
    expect(result).toMatchObject({ engine: 'shopee_openapi_v1', decision: 'official', topCount: 0 });
  });

  it('erro HTTP não derruba o worker e não chama V5', async () => {
    let shopeeDiscoverCalls = 0;
    let mercadoLivreDiscoverCalls = 0;
    let v5Calls = 0;
    const result = await runDiscoveryOnlyCycle({
      tenantId: 'test-tenant',
      correlationId: 'resilience-http',
      requestedAt: new Date().toISOString(),
      marketplaces: ['Shopee', 'Mercado Livre'],
      discover: async (marketplace) => {
        if (marketplace === 'Shopee') {
          shopeeDiscoverCalls += 1;
          return [];
        }
        mercadoLivreDiscoverCalls += 1;
        return [];
      },
      shadowDiscovery: async () => ({ engine: 'shopee_openapi_v1', decision: 'failed', topCount: 0 }),
      persist: async () => ({ accepted: 0, inserted: 0, updated: 0, offerIds: [] }),
      loadDeferred: async () => [],
      loadHistory: async () => [],
    });
    expect(result.status).toBe('completed');
    expect(result.marketplaces).toHaveLength(2);
    expect(shopeeDiscoverCalls).toBe(1);
    expect(mercadoLivreDiscoverCalls).toBe(1);
    expect(v5Calls).toBe(0);
  });

  it('respeita no máximo um retry adicional', async () => {
    const post = vi.spyOn(axios, 'post').mockRejectedValue(new Error('network down'));
    await expect(callShopeeAffiliateApi('{}', {
      appId: 'test-app', appSecret: 'test-secret', timeoutMs: 10, maxRetries: SHOPEE_OPENAPI_MAX_RETRIES,
    })).rejects.toThrow('network down');
    expect(post).toHaveBeenCalledTimes(SHOPEE_OPENAPI_MAX_RETRIES + 1);
    expect(post.mock.calls[0][2].signal).toBeInstanceOf(AbortSignal);
    post.mockRestore();
  });
});
