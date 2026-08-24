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
      if (scenarioId !== 'cupons_aprovados_editorial') {
        assert.ok(contract.allowedProductTerms.length > 0, `${marketplace}/${scenarioId} sem termos permitidos`);
      }
    }
  }
});

test('Amazon usa browse nodes públicos reais por cenário', () => {
  for (const scenarioId of Object.keys(AMAZON_SCENARIOS)) {
    if (['grandes_ofertas_editorial', 'cupons_aprovados_editorial'].includes(scenarioId)) continue;
    const contract = getMarketplaceScenarioContract(scenarioId, 'Amazon');
    assert.ok(contract.categories.length > 0, `Amazon/${scenarioId} sem browse node`);
    assert.ok(contract.categories.every((id) => /^\d+$/.test(String(id))), `Amazon/${scenarioId} com browse node inválido`);
  }
  assert.ok(getMarketplaceScenarioContract('informatica_editorial', 'Amazon').categories.includes('16243803011'));
  assert.ok(getMarketplaceScenarioContract('casa_cozinha_editorial', 'Amazon').categories.includes('17124722011'));
});

test('as filas editoriais são atômicas e não reintroduzem cenários compostos', () => {
  assert.deepEqual(getMarketplaceScenarioContract('pet_editorial', 'Amazon').splitInto, []);
  assert.deepEqual(getMarketplaceScenarioContract('moda_editorial', 'Amazon').splitInto, []);
});

test('contrato Amazon declara tipos, atributos e prioridade comercial', () => {
  for (const scenarioId of Object.keys(AMAZON_SCENARIOS)) {
    if (['grandes_ofertas_editorial', 'cupons_aprovados_editorial'].includes(scenarioId)) continue;
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
  assert.equal(buildClassificationCoverage([{ classification: classified, intent: 'casa_cozinha_editorial' }], 'Amazon').cobertura_classificacao, 1);
});

test('contrato de treino aceita fitness e bloqueia calçado casual/social', () => {
  const contract = getMarketplaceScenarioContract('esporte_editorial', 'Mercado Livre');
  assert.equal(matchesMarketplaceContract(contract, 'Whey Protein 100% Concentrado'), true);
  assert.equal(matchesMarketplaceContract(contract, 'Tapete de Yoga 6mm'), true);
  assert.equal(matchesMarketplaceContract(contract, 'Tênis Casual Feminino Confortável'), false);
  assert.equal(matchesMarketplaceContract(contract, 'Sapato Social Masculino'), false);
});

test('bloqueio por palavra não rejeita falso positivo em tapete', () => {
  const contract = getMarketplaceScenarioContract('esporte_editorial', 'Mercado Livre');
  assert.equal(matchesMarketplaceContract(contract, 'Tapete de Yoga em EVA'), true);
});
