'use strict';

const assert = require('node:assert/strict');
const { SCENARIOS, matchesScenarioProduct } = require('../shopee-scenario-config.cjs');
const { dedupeGlobally } = require('../shopee-native-discovery-v5.cjs');

const scenario = SCENARIOS.eletros_cozinha;

assert.equal(scenario.keywordSelection, 'all');
assert.equal(scenario.keywords.length, 16);
assert.equal(scenario.maxPagesPerKeyword, 1);

for (const title of [
  'Cafeteira Elétrica 15 Cafés',
  'Batedeira Planetária 700W',
  'Liquidificador 550W',
  'Air Fryer 4 Litros',
  'Mixer 3 em 1 Inox',
  'Panela de Pressão Elétrica 5 Litros',
  'Pipoqueira Elétrica 110V',
  'Espremedor Elétrico de Frutas'
]) assert.equal(matchesScenarioProduct(scenario, title), true, title);

for (const title of [
  'Ralador Manual 12 em 1',
  'Marmita Elétrica Veicular',
  'Filtro de Linha 6 Tomadas',
  'Torneira Gourmet Mixer',
  'Mixer para Pigmentação de Henna',
  'Suporte para Air Fryer',
  'Spray Limpa Air Fryer',
  'Forma de Silicone para Air Fryer',
  'Cafeteira Italiana Moka'
]) assert.equal(matchesScenarioProduct(scenario, title), false, title);

const deduplicated = dedupeGlobally([
  { itemId: '1', shopId: 'a', normalizedUrl: 'https://example.com/a', productName: 'Sanduicheira Elétrica Inox 750W' },
  { itemId: '2', shopId: 'b', normalizedUrl: 'https://example.com/b', productName: 'Sanduicheira Elétrica Inox 750W' },
  { itemId: '3', shopId: 'c', normalizedUrl: 'https://example.com/c', productName: 'Sanduicheira Grill INBSW02 127V' },
  { itemId: '4', shopId: 'd', normalizedUrl: 'https://example.com/d', productName: 'Sanduicheira Grill INBSW02 220V' },
  { itemId: '5', shopId: 'e', normalizedUrl: 'https://example.com/e', productName: 'Cafeteira Elétrica 15 Cafés' }
]);
assert.equal(deduplicated.length, 3);

console.log('PASS eletros_cozinha scenario: termos, filtros e deduplicação por título validados');
