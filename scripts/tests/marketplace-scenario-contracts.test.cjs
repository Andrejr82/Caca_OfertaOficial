'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SCENARIOS } = require('../shopee-scenario-config.cjs');
const { SCENARIOS: AMAZON_SCENARIOS } = require('../amazon-scenario-config.cjs');
const {
  MARKETPLACES,
  getMarketplaceScenarioContract,
  matchesMarketplaceContract,
} = require('../marketplace-scenario-contracts.cjs');
const { classifyCandidate, buildClassificationCoverage } = require('../classification-coverage.cjs');

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

test('Amazon usa browse nodes públicos reais por cenário', () => {
  for (const scenarioId of Object.keys(AMAZON_SCENARIOS)) {
    const contract = getMarketplaceScenarioContract(scenarioId, 'Amazon');
    assert.ok(contract.categories.length > 0, `Amazon/${scenarioId} sem browse node`);
    assert.ok(contract.categories.every((id) => /^\d+$/.test(String(id))), `Amazon/${scenarioId} com browse node inválido`);
  }
  assert.ok(getMarketplaceScenarioContract('tecnologia_desejo', 'Amazon').categories.includes('16243803011'));
  assert.ok(getMarketplaceScenarioContract('eletros_cozinha', 'Amazon').categories.includes('17124722011'));
});

test('cenários compostos Amazon declaram filas independentes', () => {
  assert.deepEqual(getMarketplaceScenarioContract('pet_bebe', 'Amazon').splitInto, ['dono_de_pet', 'mae_de_primeira_viagem']);
  assert.deepEqual(getMarketplaceScenarioContract('moda_fitness_beleza_viagem', 'Amazon').splitInto, ['moda_masculina', 'treino_academia', 'beleza_autocuidado', 'viagem_aventura']);
});

test('contrato Amazon declara tipos, atributos e prioridade comercial', () => {
  for (const scenarioId of Object.keys(AMAZON_SCENARIOS)) {
    const intelligence = getMarketplaceScenarioContract(scenarioId, 'Amazon').amazonIntelligence;
    assert.ok(intelligence.productTypes.length > 0, `${scenarioId} sem tipos`);
    assert.ok(intelligence.attributes.length > 0, `${scenarioId} sem atributos`);
    assert.ok(['high', 'medium', 'low'].includes(intelligence.priority), `${scenarioId} sem prioridade`);
  }
});

test('classificador Amazon usa evidência de browse node antes do título', () => {
  const classified = classifyCandidate({
    title: 'Produto de teste sem termo conhecido',
    category: { browseNodeId: '17124716011', name: 'browse_node:17124716011' },
    marketplaceMetrics: { browseNodeId: '17124716011' },
  }, 'Amazon');
  assert.equal(classified.status, 'classified');
  assert.equal(classified.productType, 'coffee_maker');
  assert.equal(classified.confidence, 1);
  assert.equal(buildClassificationCoverage([{ classification: classified, intent: 'eletros_cozinha' }], 'Amazon').cobertura_classificacao, 1);
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
