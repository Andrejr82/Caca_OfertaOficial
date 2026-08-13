'use strict';

process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';
const { runOracleScraperShopeeShadowLocal, persistDiscoveryIngestionV1 } = require('../oracle-scraper.cjs');

describe('Oracle Scraper Shopee OpenAPI local shadow entrypoint', () => {
  it('bloqueia o persist genérico antes de qualquer chamada quando write flags estão ativas', async () => {
    const previousDryRun = process.env.DRY_RUN;
    const previousNoDbWrite = process.env.NO_DB_WRITE;
    process.env.DRY_RUN = '1';
    process.env.NO_DB_WRITE = '1';
    try {
      const result = await persistDiscoveryIngestionV1([{ candidate: {}, ingestionId: 'ing-1', correlationId: 'run-1' }], 'Amazon');
      expect(result).toMatchObject({ skipped: true, supabaseWrites: 0, accepted: 0 });
    } finally {
      if (previousDryRun === undefined) delete process.env.DRY_RUN; else process.env.DRY_RUN = previousDryRun;
      if (previousNoDbWrite === undefined) delete process.env.NO_DB_WRITE; else process.env.NO_DB_WRITE = previousNoDbWrite;
    }
  });

  function topCandidates(count = 35) {
    return Array.from({ length: count }, (_, index) => ({
      itemId: String(500 + index), shopId: String(600 + index), productName: `Casa ${index}`,
      productLink: `https://shopee.com.br/product/${600 + index}/${500 + index}`,
      offerLink: `https://s.shopee.com.br/canary-${index}`, imageUrl: `https://cf.shopee.com.br/canary-${index}.jpg`,
      price: 20 + index, originalPrice: 40 + index, score: 80, productCatIds: ['100010'],
    }));
  }

  it('não executa legado e usa V1 oficial sem persistir quando a flag de persistência está desligada', async () => {
    let persistCalls = 0;
    let legacyCalls = 0;
    const result = await runOracleScraperShopeeShadowLocal({
      scenarioId: 'casa_cozinha_editorial',
      legacyRunner: async () => { legacyCalls += 1; return { categories: [] }; },
      runScenario: async () => ({
        enabled: true, mode: 'shadow',
        result: { scenarios: { casa_cozinha_editorial: { top: [{ score: 80 }], metrics: { final: 1, intentRejected: 2, families: 1, shops: 1, imageLink100: true } } } },
        writeAudit: { supabaseWrites: 0, offersWrites: 0, postsWrites: 0, affiliateLinkWrites: 0, publishCalls: 0, oracleCalls: 0 },
      }),
      persistRunner: async () => { persistCalls += 1; throw new Error('persistência proibida'); },
      env: { SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true', DRY_RUN: '1', NO_DB_WRITE: '1', NO_POSTS: '1', NO_PUBLISH: '1' },
    });
    expect(result.marketplaces[0].shadow.engine).toBe('shopee_openapi_v1');
    expect(result.marketplaces[0].shadow.decision).toBe('official');
    expect(result.marketplaces[0].shadow.top).toHaveLength(1);
    expect(result.marketplaces[0].legacyTop).toBe(0);
    expect(result.marketplaces[0].legacySelected).toBe(1);
    expect(legacyCalls).toBe(0);
    expect(persistCalls).toBe(0);
  });

  it('mantém Grandes Ofertas bloqueado pelo entrypoint real', async () => {
    const result = await runOracleScraperShopeeShadowLocal({
      scenarioId: 'grandes_ofertas_editorial', legacyRunner: async () => ({ categories: [] }),
      runScenario: async () => { throw new Error('runner V1 não deveria ser chamado'); },
      env: { SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true', DRY_RUN: '1', NO_DB_WRITE: '1', NO_POSTS: '1', NO_PUBLISH: '1' },
    });
    expect(result.marketplaces[0].shadow.decision).toBe('blocked_v1_scenario');
    expect(result.marketplaces[0].shadow.top).toEqual([]);
  });

  it('persiste todo o lote V1 aprovado quando o canário está habilitado', async () => {
    const persisted = [];
    const result = await runOracleScraperShopeeShadowLocal({
      scenarioId: 'casa_cozinha_editorial',
      legacyRunner: async () => ({ categories: [] }),
      runScenario: async () => ({
        enabled: true, mode: 'shadow',
        result: { scenarios: { casa_cozinha_editorial: { top: topCandidates(), metrics: { final: 6, imageLink100: true } } } },
        writeAudit: { supabaseWrites: 0, offersWrites: 0, postsWrites: 0, affiliateLinkWrites: 0, publishCalls: 0, oracleCalls: 0 },
      }),
      persistRunner: async (ingestions) => {
        persisted.push(...ingestions);
        return { accepted: ingestions.length, inserted: ingestions.length, updated: 0, offerIds: ingestions.map((item) => item.candidate.sourceItemId), writeAudit: { supabaseWrites: ingestions.length, offersWrites: ingestions.length, affiliateLinkWrites: ingestions.length * 4, postsWrites: 0, publishCalls: 0, oracleCalls: 0 } };
      },
      env: { SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true', SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED: 'true', NO_POSTS: '1', NO_PUBLISH: '1' },
    });
    expect(persisted).toHaveLength(35);
    expect(persisted.every((item) => /^[0-9a-f-]{36}$/.test(item.correlationId))).toBe(true);
    expect(persisted.every((item) => item.candidate.persistenceMetadata.mode === 'controlled-persist')).toBe(true);
    expect(result.persistCalls).toBe(1);
    expect(result.writeAudit).toMatchObject({ postsWrites: 0, publishCalls: 0, oracleCalls: 0 });
  });
});
