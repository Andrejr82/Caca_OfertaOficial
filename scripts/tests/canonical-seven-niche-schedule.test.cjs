'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EDITORIAL_SCENARIO_CATALOG,
  EDITORIAL_SCENARIOS,
  EDITORIAL_SCENARIO_IDS,
  EXPECTED_PUBLICATION_HOURS,
  EXPECTED_DISCOVERY_HOURS,
  getEditorialScenarioForDiscoveryHour,
  assertEditorialScheduleValid,
} = require('../editorial-scenario-config.cjs');
const { resolveNicheFromLegacyScenario } = require('../commercial-niche-config.cjs');

const ACTIVE_PRODUCT_SCENARIOS = [
  'casa_cozinha_editorial',
  'ferramentas_editorial',
  'informatica_editorial',
  'beleza_editorial',
  'moda_editorial',
  'pet_editorial',
  'eletrodomesticos_editorial',
];

const EXPECTED_DISCOVERY_MAP = new Map([
  [6, 'casa_cozinha_editorial'],
  [8, 'ferramentas_editorial'],
  [9, 'informatica_editorial'],
  [11, 'beleza_editorial'],
  [12, 'moda_editorial'],
  [14, 'pet_editorial'],
  [18, 'eletrodomesticos_editorial'],
]);

test('agenda ativa contém exatamente 7 nichos + Cupons manual', () => {
  assert.deepEqual(EDITORIAL_SCENARIO_IDS, [...ACTIVE_PRODUCT_SCENARIOS, 'cupons_aprovados_editorial']);
  assert.equal(Object.keys(EDITORIAL_SCENARIOS).length, 8);
  assert.equal(EDITORIAL_SCENARIOS.cupons_aprovados_editorial.discoveryMode, 'manual_only');
});

test('os 7 cenários ativos resolvem para 7 nichos comerciais únicos', () => {
  const nicheIds = ACTIVE_PRODUCT_SCENARIOS.map((scenarioId) => {
    const resolved = resolveNicheFromLegacyScenario(scenarioId);
    assert.equal(resolved.mode, 'niche_mapped', scenarioId);
    return resolved.nicheId;
  });
  assert.equal(new Set(nicheIds).size, 7);
});

test('cenários substituídos saem da matriz ativa mas permanecem no catálogo histórico', () => {
  const replaced = [
    'organizacao_editorial',
    'celulares_editorial',
    'esporte_editorial',
    'tv_audio_editorial',
    'moveis_editorial',
    'grandes_ofertas_editorial',
  ];
  for (const id of replaced) {
    assert.equal(EDITORIAL_SCENARIOS[id], undefined, `${id} não deve estar ativo`);
    assert.ok(EDITORIAL_SCENARIO_CATALOG[id], `${id} deve permanecer no catálogo histórico`);
  }
});

test('horários ativos e horários de descoberta são exatamente os aprovados pela substituição', () => {
  assert.deepEqual(EXPECTED_PUBLICATION_HOURS, [7, 9, 10, 12, 13, 15, 19, 22]);
  assert.deepEqual(EXPECTED_DISCOVERY_HOURS, [6, 8, 9, 11, 12, 14, 18]);
  assert.doesNotThrow(() => assertEditorialScheduleValid());
});

test('cada horário de descoberta aponta somente para um dos 7 nichos e nunca para Cupons', () => {
  for (const [hour, expectedId] of EXPECTED_DISCOVERY_MAP) {
    assert.equal(getEditorialScenarioForDiscoveryHour(hour)?.id, expectedId, `hora ${hour}`);
  }
  for (const hour of [7, 10, 13, 15, 16, 17, 19, 20, 21]) {
    assert.equal(getEditorialScenarioForDiscoveryHour(hour), null, `hora inativa ${hour}`);
  }
});
