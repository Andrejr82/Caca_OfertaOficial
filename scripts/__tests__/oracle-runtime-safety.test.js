'use strict';

process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';
const scraper = require('../oracle-scraper.cjs');

describe('Oracle runtime safety', () => {
  it('resolves the scenario runtime contract without a ReferenceError', () => {
    const resolve = scraper.createScenarioRuntimeResolver({
      plannedScenarioId: 'casa_cozinha_editorial',
      discoveryHour: 12,
      schedulerSource: 'test',
    });
    expect(resolve('Shopee', [], {}, 'casa_cozinha_editorial')).toMatchObject({
      resolvedScenarioId: 'casa_cozinha_editorial',
      marketplace: 'Shopee',
    });
  });

  it('does not invoke V5 when V1 is enabled', async () => {
    const previous = process.env.SHOPEE_OPENAPI_ENGINE_V1_ENABLED;
    process.env.SHOPEE_OPENAPI_ENGINE_V1_ENABLED = 'true';
    try {
      const result = await scraper.executeShopeeNativeDiscoveryV5({ dryRun: true, scenario: 'casa_cozinha_editorial' });
      expect(result).toMatchObject({ decision: 'blocked_v1_enabled', databaseChanged: false, postsCreated: 0 });
    } finally {
      if (previous === undefined) delete process.env.SHOPEE_OPENAPI_ENGINE_V1_ENABLED;
      else process.env.SHOPEE_OPENAPI_ENGINE_V1_ENABLED = previous;
    }
  });
});
