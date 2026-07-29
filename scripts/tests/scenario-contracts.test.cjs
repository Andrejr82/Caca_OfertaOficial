'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  getCycleScenario,
  getCanonicalCycleScenarioId,
  CYCLE_SCENARIO_ROUTING,
} = require('../shopee-scenario-config.cjs');
const {
  getMarketplaceScenarioContract,
  MARKETPLACES,
} = require('../marketplace-scenario-contracts.cjs');

test('roteador escolhe um único cenário canônico por ciclo', () => {
  for (const hour of [0, 4, 8, 12, 16, 20]) {
    const scenario = getCycleScenario(hour, 4);
    assert.equal(scenario.scenarioIds.length, 1);
    assert.equal(scenario.scenarioIds[0], getCanonicalCycleScenarioId(hour));
    assert.equal(scenario.id, CYCLE_SCENARIO_ROUTING[hour]);
  }
  assert.equal(getCycleScenario(20, 4).scenarioIds[0], 'enxoval_casamento');
});

test('cada marketplace recebe contrato explícito e isolado', () => {
  for (const marketplace of MARKETPLACES) {
    const contract = getMarketplaceScenarioContract('enxoval_casamento', marketplace);
    assert.equal(contract.marketplace, marketplace);
    assert.equal(contract.source, 'explicit_marketplace_contract');
    assert.ok(contract.terms.length > 0);
    assert.ok(Array.isArray(contract.allowedProductTerms));
    assert.ok(Array.isArray(contract.blockedProductTerms));
    assert.ok(Array.isArray(contract.categories));
  }
});

test('enxoval rejeita domínios fora de cama, mesa e banho', () => {
  for (const marketplace of MARKETPLACES) {
    const contract = getMarketplaceScenarioContract('enxoval_casamento', marketplace);
    assert.match(contract.terms.join(' '), /lençol|toalha|jogo de cama|mesa|banho/i);
    assert.ok(contract.blockedProductTerms.some((term) => /pet|fitness|eletr|celular|notebook/i.test(term)));
    assert.equal(contract.allowedProductTerms.some((term) => /pet|fitness|celular/i.test(term)), false);
  }
});

test('os seis cenários automáticos possuem contrato nos três marketplaces', () => {
  for (const id of Object.values(CYCLE_SCENARIO_ROUTING)) {
    for (const marketplace of MARKETPLACES) {
      const contract = getMarketplaceScenarioContract(id, marketplace);
      assert.equal(contract.source, 'explicit_marketplace_contract');
      assert.ok(contract.terms.length >= 3);
    }
  }
});
