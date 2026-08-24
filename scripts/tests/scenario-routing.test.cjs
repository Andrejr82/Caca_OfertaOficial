'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SCENARIOS, getActiveScenario, getCycleScenario, SCENARIO_WINDOWS } = require('../shopee-scenario-config.cjs');
const { SCENARIOS: AMAZON_SCENARIOS } = require('../amazon-scenario-config.cjs');
process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';
const { CRON_SCHEDULE, parseScenarioArg, startOracleScraper } = require('../oracle-scraper.cjs');

test('usa descoberta horária para as filas ativas', () => {
  assert.equal(CRON_SCHEDULE, '0 6-20 * * *');
  assert.deepEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22]
    .map((hour) => getActiveScenario(hour).id), Object.keys(SCENARIOS));
  assert.equal(getActiveScenario(16), null);
  assert.equal(getActiveScenario(17), null);
  assert.equal(SCENARIO_WINDOWS.length, 14);
  assert.equal(getCycleScenario(6, 1).publicationHour, 7);
  assert.equal(getCycleScenario(14, 1).id, 'pet_editorial');
  assert.equal(getCycleScenario(15, 1), null);
  assert.equal(getCycleScenario(16, 1), null);
  assert.equal(getCycleScenario(17, 1).id, 'tv_audio_editorial');
  assert.equal(getCycleScenario(17, 1).publicationHour, 18);
});

test('publica os contratos editoriais nos marketplaces', () => {
  for (const id of Object.keys(SCENARIOS)) {
    assert.ok(SCENARIOS[id].keywords.length > 0);
    assert.ok(AMAZON_SCENARIOS[id].keywords.length > 0);
  }
});

test('scheduler tem uma fonte de verdade e CLI continua override explícito', () => {
  assert.equal(parseScenarioArg(['node', 'oracle-scraper.cjs', '--scenario=tv_audio_editorial']), 'tv_audio_editorial');
  assert.equal(parseScenarioArg(['node', 'oracle-scraper.cjs', '--scenario', 'tv_audio_editorial']), 'tv_audio_editorial');
  let scheduled = 0;
  startOracleScraper({ argv: ['node', 'oracle-scraper.cjs'], cycle: async () => {}, schedule: () => { scheduled += 1; } });
  assert.equal(scheduled, 1);
});
