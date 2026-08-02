'use strict';

const assert = require('node:assert/strict');
const { SCENARIOS, getActiveScenario, matchesScenarioProduct } = require('../shopee-scenario-config.cjs');

const scenario = SCENARIOS.casa_cozinha_editorial;
assert.equal(scenario.keywordSelection, 'all');
assert.ok(matchesScenarioProduct(scenario, 'Cafeteira Elétrica 15 Cafés'));
assert.ok(matchesScenarioProduct(scenario, 'Air Fryer 4 Litros'));
assert.equal(matchesScenarioProduct(scenario, 'Ração Premium para Cachorro'), false);
assert.equal(getActiveScenario(7).id, 'casa_cozinha_editorial');
assert.equal(getActiveScenario(9).id, 'ferramentas_editorial');
console.log('PASS cenários editoriais: filtro e roteamento validados');
