'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SCENARIOS, getActiveScenario, getCycleScenario, getCycleStartHour, SCENARIO_WINDOWS } = require('../shopee-scenario-config.cjs');
const { SCENARIOS: AMAZON_SCENARIOS } = require('../amazon-scenario-config.cjs');
process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';
const { CRON_SCHEDULE } = require('../oracle-scraper.cjs');

test('uses six four-hour discovery windows over the canonical 11 editorial windows', () => {
  assert.equal(CRON_SCHEDULE, '0 0,4,8,12,16,20 * * *');
  assert.deepEqual([0, 4, 8, 12, 16, 20].map((hour) => getActiveScenario(hour).id), [
    'tecnologia_desejo', 'treino_academia', 'mae_de_primeira_viagem',
    'beleza_autocuidado', 'acessorios_relogios', 'moda_masculina',
  ]);
  assert.equal(SCENARIO_WINDOWS.length, 11);
  assert.equal(getCycleStartHour(21), 20);
  assert.deepEqual(getCycleScenario(20, 4).scenarioIds, ['enxoval_casamento']);
});

test('publishes the new intent matrix to the marketplace scenario registry', () => {
  const expected = ['tecnologia_desejo', 'eletrodomesticos_cozinha', 'impulso_casa', 'casa_moveis', 'pet_bebe', 'moda_fitness_beleza_viagem'];
  for (const id of expected) {
    assert.ok(SCENARIOS[id].keywords.length > 0);
    assert.ok(AMAZON_SCENARIOS[id].keywords.length > 0);
  }
  assert.notDeepEqual(AMAZON_SCENARIOS.tecnologia_desejo.keywords, SCENARIOS.tecnologia_desejo.keywords);
  assert.notDeepEqual(AMAZON_SCENARIOS.treino_academia.keywords, SCENARIOS.treino_academia.keywords);
});

test('includes the new high-value intents', () => {
  const keywords = SCENARIOS.eletrodomesticos_cozinha.keywords.join(' | ').toLowerCase();
  for (const term of ['smart tv 4k', 'geladeira', 'máquina de lavar', 'lava e seca', 'lava louças', 'cooktop', 'ar condicionado', 'fogão']) {
    assert.match(keywords, new RegExp(term));
  }
});
