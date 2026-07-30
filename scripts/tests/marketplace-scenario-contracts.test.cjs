'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SCENARIOS } = require('../shopee-scenario-config.cjs');
const {
  MARKETPLACES,
  getMarketplaceScenarioContract,
  matchesMarketplaceContract,
} = require('../marketplace-scenario-contracts.cjs');

test('todos cenários possuem contrato por marketplace', () => {
  for (const marketplace of MARKETPLACES) {
    for (const scenarioId of Object.keys(SCENARIOS)) {
      const contract = getMarketplaceScenarioContract(scenarioId, marketplace);
      assert.ok(contract, `${marketplace}/${scenarioId} sem contrato`);
      assert.ok(contract.terms.length > 0, `${marketplace}/${scenarioId} sem termos`);
      assert.ok(contract.allowedProductTerms.length > 0, `${marketplace}/${scenarioId} sem termos permitidos`);
    }
  }
});

test('contrato de treino aceita fitness e bloqueia calçado casual/social', () => {
  const contract = getMarketplaceScenarioContract('treino_academia', 'Mercado Livre');
  assert.equal(matchesMarketplaceContract(contract, 'Whey Protein 100% Concentrado'), true);
  assert.equal(matchesMarketplaceContract(contract, 'Tapete Yoga 6mm'), true);
  assert.equal(matchesMarketplaceContract(contract, 'Tênis Casual Feminino Confortável'), false);
  assert.equal(matchesMarketplaceContract(contract, 'Sapato Social Masculino'), false);
});

test('bloqueio por palavra não rejeita falso positivo em tapete', () => {
  const contract = getMarketplaceScenarioContract('treino_academia', 'Mercado Livre');
  assert.equal(matchesMarketplaceContract(contract, 'Tapete de Yoga em EVA'), true);
});
