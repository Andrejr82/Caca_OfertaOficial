'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OFFICIAL_EDITORIAL_GRID,
  validateOfficialGrid,
  getOfficialScenarioForDiscoveryHour,
} = require('../official-editorial-grid.cjs');
const { getMarketplaceScenarioContract } = require('../marketplace-scenario-contracts.cjs');
const { createDiscoveryScenarioRuntimeContract } = require('../scenario-runtime-contract.cjs');

const AUTO = [
  [6, 'casa_cozinha_editorial'],
  [8, 'beleza_editorial'],
  [10, 'informatica_editorial'],
  [12, 'moda_editorial'],
  [14, 'ferramentas_editorial'],
  [16, 'pet_editorial'],
  [18, 'eletrodomesticos_editorial'],
];

const INACTIVE = new Set([
  'organizacao_editorial',
  'celulares_editorial',
  'esporte_editorial',
  'tv_audio_editorial',
  'moveis_editorial',
  'grandes_ofertas_editorial',
]);

test('grade oficial contém exatamente 7 descobertas automáticas + Cupons manual', () => {
  const validation = validateOfficialGrid();
  assert.equal(validation.valid, true, validation.errors.join('\n'));
  assert.equal(OFFICIAL_EDITORIAL_GRID.length, 8);

  const automatic = OFFICIAL_EDITORIAL_GRID.filter((slot) => slot.isDiscoveryEnabled);
  const manual = OFFICIAL_EDITORIAL_GRID.filter((slot) => slot.isManualOnly);
  assert.equal(automatic.length, 7);
  assert.equal(manual.length, 1);
  assert.equal(manual[0].scenarioId, 'cupons_aprovados_editorial');

  for (const slot of OFFICIAL_EDITORIAL_GRID) {
    assert.equal(INACTIVE.has(slot.scenarioId), false, slot.scenarioId);
  }
});

test('cada horário automático resolve o nicho canônico esperado', () => {
  for (const [hour, scenarioId] of AUTO) {
    assert.equal(getOfficialScenarioForDiscoveryHour(hour), scenarioId, `discoveryHour=${hour}`);
  }
});

test('runtime fica alinhado à grade nos 7 nichos e 3 marketplaces', () => {
  for (const [discoveryHour, scenarioId] of AUTO) {
    for (const marketplace of ['Shopee', 'Amazon', 'Mercado Livre']) {
      const marketplaceContract = getMarketplaceScenarioContract(scenarioId, marketplace);
      assert.ok(marketplaceContract, `${marketplace}/${scenarioId}`);

      const runtime = createDiscoveryScenarioRuntimeContract({
        discoveryHour,
        plannedScenarioId: scenarioId,
        resolvedScenarioId: scenarioId,
        marketplace,
        marketplaceContract,
      });

      assert.equal(runtime.resolvedScenarioId, scenarioId, `${marketplace}/${scenarioId}`);
      assert.equal(runtime.isOfficialGridAligned, true, `${marketplace}/${scenarioId}`);
      assert.equal(runtime.flags.isManualOnly, false, `${marketplace}/${scenarioId}`);
      assert.equal(runtime.flags.contractIncomplete, false, `${marketplace}/${scenarioId}`);
    }
  }
});
