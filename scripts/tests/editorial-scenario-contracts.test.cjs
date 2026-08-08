'use strict';

const assert = require('node:assert/strict');
const {
  EDITORIAL_SCENARIO_IDS,
  EDITORIAL_SCENARIOS,
  getEditorialScenarioForHour,
  getEditorialScenarioForDiscoveryHour,
  validateEditorialSchedule,
  assertEditorialScheduleValid,
  getEditorialScenarioById,
} = require('../editorial-scenario-config.cjs');
const {
  getMarketplaceScenarioContract,
  MARKETPLACE_CONTRACTS,
} = require('../marketplace-scenario-contracts.cjs');

const expected = [
  'casa_cozinha_editorial', 'organizacao_editorial', 'ferramentas_editorial',
  'informatica_editorial', 'celulares_editorial', 'beleza_editorial',
  'moda_editorial', 'esporte_editorial', 'pet_editorial', 'automotivo_editorial', 'games_editorial',
  'tv_audio_editorial', 'eletrodomesticos_editorial', 'moveis_editorial',
  'grandes_ofertas_editorial', 'cupons_aprovados_editorial',
];

assert.deepEqual(EDITORIAL_SCENARIO_IDS, expected);

for (const id of expected) {
  const scenario = getEditorialScenarioById(id);
  assert.equal(scenario.id, id);
  assert.ok(scenario.keywords.length > 0, `${id} sem termos`);
  assert.ok(scenario.blockedProductTerms.length > 0, `${id} sem bloqueios`);
  assert.ok(scenario.attributes.length > 0, `${id} sem atributos`);
  assert.ok(Number.isFinite(scenario.maxAgeHours), `${id} sem validade`);
  if (id !== 'cupons_aprovados_editorial') assert.ok(scenario.marketplaces.length === 3, `${id} sem marketplaces`);
}

const expectedHourMap = [
  'casa_cozinha_editorial', 'organizacao_editorial', 'ferramentas_editorial',
  'informatica_editorial', 'celulares_editorial', 'beleza_editorial',
  'moda_editorial', 'esporte_editorial', 'pet_editorial', 'automotivo_editorial',
  'games_editorial', 'tv_audio_editorial', 'eletrodomesticos_editorial',
  'moveis_editorial', 'grandes_ofertas_editorial', 'cupons_aprovados_editorial',
];

assert.deepEqual(
  [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]
    .map((hour) => getEditorialScenarioForHour(hour).id),
  expectedHourMap,
);

for (const marketplace of ['Shopee', 'Amazon', 'Mercado Livre']) {
  assert.deepEqual(Object.keys(MARKETPLACE_CONTRACTS[marketplace]), expected);
  for (const id of expected.filter((value) => value !== 'cupons_aprovados_editorial')) {
    const contract = getMarketplaceScenarioContract(id, marketplace);
    assert.ok(contract, `${marketplace}/${id} sem contrato`);
    assert.ok(contract.keywords.length > 0, `${marketplace}/${id} sem keywords`);
    assert.ok(contract.allowedProductTerms.length > 0, `${marketplace}/${id} sem allowed terms`);
    assert.ok(contract.blockedProductTerms.length > 0, `${marketplace}/${id} sem blocked terms`);
  }
}

assert.equal(getEditorialScenarioForHour(23).id, 'cupons_aprovados_editorial');
assert.deepEqual(
  [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
    .map((hour) => getEditorialScenarioForDiscoveryHour(hour).id),
  expected.slice(0, 15),
);
assert.equal(EDITORIAL_SCENARIOS.automotivo_editorial.queueHour, 16);
assert.equal(EDITORIAL_SCENARIOS.grandes_ofertas_editorial.priority, 'critical');
assert.equal(EDITORIAL_SCENARIOS.cupons_aprovados_editorial.discoveryMode, 'manual_only');
assert.equal(validateEditorialSchedule().valid, true);
assert.doesNotThrow(() => assertEditorialScheduleValid());
assert.equal(validateEditorialSchedule({
  ...EDITORIAL_SCENARIOS,
  duplicate: { ...EDITORIAL_SCENARIOS.casa_cozinha_editorial, id: 'duplicate', queueHour: 7 },
}).valid, false);
assert.equal(validateEditorialSchedule({
  ...EDITORIAL_SCENARIOS,
  extra_runtime: { ...EDITORIAL_SCENARIOS.casa_cozinha_editorial, id: 'extra_runtime', queueHour: 23 },
}).valid, false);
