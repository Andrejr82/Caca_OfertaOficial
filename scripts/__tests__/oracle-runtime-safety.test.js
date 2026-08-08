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

  it('keeps boot side-effect free and runs one cycle only on explicit command or scheduler tick', async () => {
    let cycles = 0;
    let scheduledCallback;
    let scheduleCalls = 0;
    const cycle = async () => { cycles += 1; };
    const schedule = (_expression, callback) => { scheduleCalls += 1; scheduledCallback = callback; };

    scraper.startOracleScraper({ argv: ['node', 'oracle-scraper.cjs'], cycle, schedule });
    expect(cycles).toBe(0);
    expect(scheduleCalls).toBe(1);

    await scheduledCallback();
    expect(cycles).toBe(1);

    await scraper.startOracleScraper({ argv: ['node', 'oracle-scraper.cjs', '--run-now'], cycle, schedule });
    expect(cycles).toBe(2);
    expect(scheduleCalls).toBe(1);
  });

  it('accepts equals-form scenario arguments and prefers the executable Git release', () => {
    expect(scraper.parseScenarioArg(['node', 'oracle-scraper.cjs', '--scenario=organizacao_editorial']))
      .toBe('organizacao_editorial');
    expect(scraper.selectOracleReleaseId({
      gitHead: '12e2c27e',
      env: {},
      releaseData: { commit: 'e1eb625' },
    })).toBe('12e2c27e');
  });
});
