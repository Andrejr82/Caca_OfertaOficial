'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { EDITORIAL_SCENARIOS } = require('../editorial-scenario-config.cjs');
const { SCENARIOS: SHOPEE_SCENARIOS } = require('../shopee-scenario-config.cjs');
const { SCENARIOS: AMAZON_SCENARIOS, AMAZON_ALIASES } = require('../amazon-scenario-config.cjs');
const { INTENT_MAP } = require('../marketplace-intent-map.cjs');
const {
  MARKETPLACES,
  MARKETPLACE_CONTRACTS,
  AMAZON_ATTRIBUTES_BY_SCENARIO,
  getMarketplaceScenarioContract,
} = require('../marketplace-scenario-contracts.cjs');

const ACTIVE = [
  'casa_cozinha_editorial',
  'ferramentas_editorial',
  'informatica_editorial',
  'beleza_editorial',
  'moda_editorial',
  'pet_editorial',
  'eletrodomesticos_editorial',
  'cupons_aprovados_editorial',
].sort();

const INACTIVE = [
  'organizacao_editorial',
  'celulares_editorial',
  'esporte_editorial',
  'tv_audio_editorial',
  'moveis_editorial',
  'grandes_ofertas_editorial',
];

function keys(value) {
  return Object.keys(value).sort();
}

test('somente 7 nichos + cupons permanecem ativos em todas as matrizes de roteamento', () => {
  assert.deepEqual(keys(EDITORIAL_SCENARIOS), ACTIVE);
  assert.deepEqual(keys(SHOPEE_SCENARIOS), ACTIVE);
  assert.deepEqual(keys(AMAZON_SCENARIOS), ACTIVE);
  assert.deepEqual(keys(AMAZON_ALIASES), ACTIVE);
  assert.deepEqual(keys(AMAZON_ATTRIBUTES_BY_SCENARIO), ACTIVE);
  assert.deepEqual(keys(INTENT_MAP), ACTIVE);

  for (const marketplace of MARKETPLACES) {
    assert.deepEqual(keys(MARKETPLACE_CONTRACTS[marketplace]), ACTIVE, marketplace);
  }
});

test('cenários desativados não podem ser resolvidos por nenhum marketplace', () => {
  for (const scenarioId of INACTIVE) {
    assert.equal(SHOPEE_SCENARIOS[scenarioId], undefined, `Shopee/${scenarioId}`);
    assert.equal(AMAZON_SCENARIOS[scenarioId], undefined, `Amazon/${scenarioId}`);
    assert.equal(INTENT_MAP[scenarioId], undefined, `Mercado Livre/${scenarioId}`);
    for (const marketplace of MARKETPLACES) {
      assert.equal(getMarketplaceScenarioContract(scenarioId, marketplace), null, `${marketplace}/${scenarioId}`);
    }
  }
});

test('os 7 nichos ativos usam contrato comercial canônico nos 3 marketplaces', () => {
  for (const scenarioId of ACTIVE.filter((id) => id !== 'cupons_aprovados_editorial')) {
    for (const marketplace of MARKETPLACES) {
      const contract = getMarketplaceScenarioContract(scenarioId, marketplace);
      assert.ok(contract, `${marketplace}/${scenarioId}`);
      assert.equal(contract.source, 'commercial_niche_contract', `${marketplace}/${scenarioId}`);
      assert.ok(contract.commercialNiche?.id, `${marketplace}/${scenarioId}`);
    }
  }
});
