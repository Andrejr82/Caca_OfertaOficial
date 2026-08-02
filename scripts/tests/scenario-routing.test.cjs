'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SCENARIOS, getActiveScenario, getCycleScenario, SCENARIO_WINDOWS } = require('../shopee-scenario-config.cjs');
const { SCENARIOS: AMAZON_SCENARIOS } = require('../amazon-scenario-config.cjs');
process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';
const { CRON_SCHEDULE } = require('../oracle-scraper.cjs');

test('usa descoberta horária para as filas de 07h a 21h', () => {
  assert.equal(CRON_SCHEDULE, '0 6-20 * * *');
  assert.deepEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]
    .map((hour) => getActiveScenario(hour).id), Object.keys(SCENARIOS));
  assert.equal(SCENARIO_WINDOWS.length, 16);
  assert.equal(getCycleScenario(6, 1).publicationHour, 7);
});

test('publica os contratos editoriais nos marketplaces', () => {
  for (const id of Object.keys(SCENARIOS)) {
    assert.ok(SCENARIOS[id].keywords.length > 0);
    assert.ok(AMAZON_SCENARIOS[id].keywords.length > 0);
  }
});
