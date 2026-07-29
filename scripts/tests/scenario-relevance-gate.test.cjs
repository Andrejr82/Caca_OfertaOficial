'use strict';

const assert = require('node:assert/strict');
const { matchesScenarioProduct } = require('../shopee-scenario-config.cjs');

const scenario = {
  keywords: ['jogo de lençol algodão', 'edredom casal'],
  blockedProductTerms: ['pet', 'ração'],
};
assert.equal(matchesScenarioProduct(scenario, 'Jogo de Lençol Casal 100% Algodão'), true);
assert.equal(matchesScenarioProduct(scenario, 'Bolsa de Transporte Pet'), false);
assert.equal(matchesScenarioProduct(scenario, 'Ração Premium para Cachorro'), false);
console.log('scenario-relevance-gate: OK');
