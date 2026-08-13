'use strict';

const {
  getShopeeV1Flags,
  isShopeeV1Shadow,
} = require('../shopee-v1-flags.cjs');

describe('Shopee V1 activation gates (T53)', () => {
  test('keeps engine, ranking and persistence as independent boolean gates', () => {
    expect(getShopeeV1Flags({
      SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true',
      SHOPEE_RANKING_V1_ENABLED: 'false',
      SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED: 'true',
    })).toEqual({ engine: true, ranking: false, persistence: true });

    expect(getShopeeV1Flags({
      SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'false',
      SHOPEE_RANKING_V1_ENABLED: 'true',
      SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED: 'false',
    })).toEqual({ engine: false, ranking: true, persistence: false });
  });

  test('does not interpret rollout percentages or hashing as activation', () => {
    expect(getShopeeV1Flags({ SHOPEE_RANKING_V1_ROLLOUT: '100' })).toEqual({
      engine: false,
      ranking: false,
      persistence: false,
    });
  });

  test('shadow flag is explicit and independent from persistence', () => {
    expect(isShopeeV1Shadow(['node', 'oracle-scraper.cjs', '--shopee-ranking-v1-shadow'])).toBe(true);
    expect(isShopeeV1Shadow(['node', 'oracle-scraper.cjs'])).toBe(false);
  });
});
