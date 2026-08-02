'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getCycleScenario, getActiveScenario, SCENARIOS } = require('../shopee-scenario-config.cjs');
const { getMarketplaceScenarioContract, MARKETPLACES } = require('../marketplace-scenario-contracts.cjs');

test('roteador usa a fila editorial seguinte ao horário da descoberta', () => {
  assert.equal(getCycleScenario(6, 1).id, 'casa_cozinha_editorial');
  assert.equal(getCycleScenario(8, 1).id, 'ferramentas_editorial');
  assert.equal(getCycleScenario(20, 1).id, 'grandes_ofertas_editorial');
  assert.equal(getActiveScenario(22).id, 'cupons_aprovados_editorial');
});

test('cada nova fila possui contrato nos três marketplaces', () => {
  for (const id of Object.keys(SCENARIOS)) {
    for (const marketplace of MARKETPLACES) {
      const contract = getMarketplaceScenarioContract(id, marketplace);
      assert.equal(contract.marketplace, marketplace);
      assert.ok(contract.terms.length > 0);
      assert.ok(contract.queueHour >= 7 && contract.queueHour <= 22);
    }
  }
});
