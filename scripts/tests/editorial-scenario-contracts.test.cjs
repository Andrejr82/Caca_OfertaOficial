'use strict';

const assert = require('node:assert/strict');
const {
  EDITORIAL_SCENARIO_IDS,
  EDITORIAL_SCENARIOS,
  getEditorialScenarioForHour,
  getEditorialScenarioForDiscoveryHour,
  validateEditorialSchedule,
  assertEditorialScheduleValid,
  getEditorialScenarioById,
} = require('../editorial-scenario-config.cjs');
const {
  getMarketplaceScenarioContract,
  MARKETPLACE_CONTRACTS,
} = require('../marketplace-scenario-contracts.cjs');

const expected = [
  'casa_cozinha_editorial', 'organizacao_editorial', 'ferramentas_editorial',
  'informatica_editorial', 'celulares_editorial', 'beleza_editorial',
  'moda_editorial', 'esporte_editorial', 'pet_editorial',
  'tv_audio_editorial', 'eletrodomesticos_editorial', 'moveis_editorial',
  'grandes_ofertas_editorial', 'cupons_aprovados_editorial',
];

assert.deepEqual(EDITORIAL_SCENARIO_IDS, expected);
assert.equal(EDITORIAL_SCENARIOS.automotivo_editorial, undefined);
assert.equal(EDITORIAL_SCENARIOS.games_editorial, undefined);
assert.equal(getEditorialScenarioById('automotivo_editorial'), null);
assert.equal(getEditorialScenarioById('games_editorial'), null);

for (const id of expected) {
  const scenario = getEditorialScenarioById(id);
  assert.equal(scenario.id, id);
  assert.ok(scenario.keywords.length > 0, `${id} sem termos`);
  assert.ok(scenario.blockedProductTerms.length > 0, `${id} sem bloqueios`);
  assert.ok(scenario.attributes.length > 0, `${id} sem atributos`);
  assert.ok(Number.isFinite(scenario.maxAgeHours), `${id} sem validade`);
  if (id !== 'cupons_aprovados_editorial') assert.ok(scenario.marketplaces.length === 3, `${id} sem marketplaces`);
}

const expectedHourMap = [
  'casa_cozinha_editorial', 'organizacao_editorial', 'ferramentas_editorial',
  'informatica_editorial', 'celulares_editorial', 'beleza_editorial',
  'moda_editorial', 'esporte_editorial', 'pet_editorial', null, null,
  'tv_audio_editorial', 'eletrodomesticos_editorial',
  'moveis_editorial', 'grandes_ofertas_editorial', 'cupons_aprovados_editorial',
];

assert.deepEqual(
  [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]
    .map((hour) => getEditorialScenarioForHour(hour)?.id || null),
  expectedHourMap,
);

for (const marketplace of ['Shopee', 'Amazon', 'Mercado Livre']) {
  assert.deepEqual(Object.keys(MARKETPLACE_CONTRACTS[marketplace]), expected);
  for (const id of expected.filter((value) => value !== 'cupons_aprovados_editorial')) {
    const contract = getMarketplaceScenarioContract(id, marketplace);
    assert.ok(contract, `${marketplace}/${id} sem contrato`);
    assert.ok(contract.keywords.length > 0, `${marketplace}/${id} sem keywords`);
    assert.ok(contract.allowedProductTerms.length > 0, `${marketplace}/${id} sem allowed terms`);
    assert.ok(contract.blockedProductTerms.length > 0, `${marketplace}/${id} sem blocked terms`);
  }
}

assert.equal(getEditorialScenarioForHour(23), null);

const expectedDiscoveryMap = [
  'casa_cozinha_editorial', 'organizacao_editorial', 'ferramentas_editorial',
  'informatica_editorial', 'celulares_editorial', 'beleza_editorial',
  'moda_editorial', 'esporte_editorial', 'pet_editorial', null, null,
  'tv_audio_editorial', 'eletrodomesticos_editorial',
  'moveis_editorial', 'grandes_ofertas_editorial',
];

assert.deepEqual(
  [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
    .map((hour) => getEditorialScenarioForDiscoveryHour(hour)?.id || null),
  expectedDiscoveryMap,
);

assert.equal(EDITORIAL_SCENARIOS.tv_audio_editorial.queueHour, 18);
assert.equal(EDITORIAL_SCENARIOS.grandes_ofertas_editorial.priority, 'critical');
assert.equal(EDITORIAL_SCENARIOS.cupons_aprovados_editorial.discoveryMode, 'manual_only');
assert.equal(validateEditorialSchedule().valid, true);
assert.doesNotThrow(() => assertEditorialScheduleValid());
assert.equal(validateEditorialSchedule({
  ...EDITORIAL_SCENARIOS,
  duplicate: { ...EDITORIAL_SCENARIOS.casa_cozinha_editorial, id: 'duplicate', queueHour: 7 },
}).valid, false);
assert.equal(validateEditorialSchedule({
  ...EDITORIAL_SCENARIOS,
  extra_runtime: { ...EDITORIAL_SCENARIOS.casa_cozinha_editorial, id: 'extra_runtime', queueHour: 23 },
}).valid, false);

// Verificação de exclusão de intenções proibidas e presença de produtos autônomos
const celulares = EDITORIAL_SCENARIOS.celulares_editorial;
for (const excluded of ['carregador turbo', 'carregador', 'power bank', 'capa celular']) {
  assert.ok(!celulares.keywords.includes(excluded), `celulares não deve conter ${excluded} em keywords`);
  assert.ok(!celulares.allowedProductTerms.includes(excluded), `celulares não deve conter ${excluded} em allowedProductTerms`);
}
for (const added of ['samsung galaxy', 'xiaomi redmi', 'poco', 'motorola', 'realme']) {
  assert.ok(celulares.keywords.includes(added), `celulares deve conter ${added} em keywords`);
  assert.ok(celulares.allowedProductTerms.includes(added), `celulares deve conter ${added} em allowedProductTerms`);
}

const grandesOfertas = EDITORIAL_SCENARIOS.grandes_ofertas_editorial;
for (const excluded of ['oferta', 'desconto', 'promoção', 'mais vendido', 'frete grátis']) {
  assert.ok(!grandesOfertas.keywords.includes(excluded), `grandes_ofertas não deve conter ${excluded} em keywords`);
}
for (const added of ['lavadora', 'monitor', 'aspirador', 'liquidificador', 'caixa de som', 'fone', 'iphone', 'galaxy']) {
  assert.ok(grandesOfertas.keywords.includes(added), `grandes_ofertas deve conter ${added} em keywords`);
  assert.ok(grandesOfertas.allowedProductTerms.includes(added), `grandes_ofertas deve conter ${added} em allowedProductTerms`);
}

// Verificação de expansões nos demais cenários
const expectedExpansions = {
  casa_cozinha_editorial: ['aspirador vertical', 'forno elétrico', 'grill elétrico', 'chaleira elétrica', 'mixer', 'máquina de café'],
  organizacao_editorial: ['organizador de gaveta', 'organizador de armário', 'estante organizadora', 'prateleira organizadora', 'organizador de banheiro'],
  ferramentas_editorial: ['esmerilhadeira', 'martelete', 'serra circular', 'serra tico-tico', 'chave de impacto', 'lixadeira'],
  informatica_editorial: ['mini pc', 'all in one', 'scanner', 'nobreak', 'switch de rede'],
  beleza_editorial: ['aparador', 'máquina de cortar cabelo', 'modelador', 'escova alisadora', 'depilador'],
  moda_editorial: ['jaqueta', 'vestido', 'mochila', 'tênis masculino', 'tênis feminino', 'calça social'],
  esporte_editorial: ['kettlebell', 'banco de musculação', 'bicicleta ergométrica', 'esteira', 'bicicleta'],
  pet_editorial: ['bebedouro automático', 'comedouro automático', 'fonte pet', 'arranhador', 'caixa de areia fechada', 'casinha pet'],
  tv_audio_editorial: ['smart tv oled', 'smart tv qled', 'caixa bluetooth', 'receiver', 'amplificador', 'monitor smart'],
  eletrodomesticos_editorial: ['aspirador', 'forno elétrico', 'coifa', 'depurador', 'frigobar', 'adega climatizada'],
  moveis_editorial: ['poltrona', 'estante', 'painel tv', 'mesa lateral', 'mesa de centro', 'mesa escritório'],
};

for (const [scenarioId, terms] of Object.entries(expectedExpansions)) {
  const scen = EDITORIAL_SCENARIOS[scenarioId];
  for (const term of terms) {
    assert.ok(scen.keywords.includes(term), `${scenarioId} deve conter keyword '${term}'`);
    assert.ok(scen.allowedProductTerms.includes(term), `${scenarioId} deve conter allowedProductTerm '${term}'`);
  }
}

