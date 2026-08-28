'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const goldenSet = require('./MARKETPLACE_API_FIRST_GOLDEN_SET_2026-08-28.json');
const { MARKETPLACES, getMarketplaceScenarioContract, matchesMarketplaceContract } = require('../marketplace-scenario-contracts.cjs');
const { SCENARIO_CONTRACTS, resolveCanonicalIntent } = require('../shopee-openapi-shadow-engine-v1.cjs');

const REQUIRED_REJECTS = [
  'Suporte para notebook ajustável', 'Suporte para SSD', 'Adaptador para SSD NVMe',
  'Kit de limpeza eletrônico', 'Enrolador de cabo organizador', 'Filamento 3D PLA 1kg',
  'Peça de reposição para impressora', 'Smartwatch com monitor de pressão',
];
const REQUIRED_ACCEPTS = [
  'Notebook Lenovo IdeaPad 3 Ryzen 7 16GB SSD 512GB', 'Monitor Gamer 24 144Hz IPS',
  'SSD NVMe 1TB', 'Roteador Wi-Fi 6 AX3000', 'Webcam Full HD 1080p USB',
  'Mini PC Intel N100 16GB 512GB', 'Impressora Multifuncional Wi-Fi',
  'Nobreak 1200VA', 'Switch de Rede Gigabit 8 Portas',
];

function allCases() {
  return MARKETPLACES.flatMap((marketplace) => (goldenSet.cases[marketplace] || []).map((item) => ({ ...item, marketplace })));
}

test('golden set compartilhado contém 20 casos por marketplace e 60 no total', () => {
  assert.deepEqual(Object.keys(goldenSet.cases).sort(), [...MARKETPLACES].sort());
  for (const marketplace of MARKETPLACES) assert.equal(goldenSet.cases[marketplace].length, 20);
  assert.equal(allCases().length, 60);
  assert.deepEqual([...new Set(allCases().map((item) => item.label))].sort(), ['AMBIGUOUS_REVIEW', 'MUST_ACCEPT', 'MUST_REJECT']);
});

test('golden set mantém os casos obrigatórios e cenários válidos', () => {
  const cases = allCases();
  for (const title of [...REQUIRED_REJECTS, ...REQUIRED_ACCEPTS]) {
    const matches = cases.filter((item) => item.title === title);
    assert.equal(matches.length, 3, `${title} deve existir nos três marketplaces`);
  }
  for (const item of cases) {
    assert.match(item.id, /^(am|ml|sh)-\d{2}$/);
    assert.ok(getMarketplaceScenarioContract(item.scenario, item.marketplace));
    assert.ok(['MUST_ACCEPT', 'MUST_REJECT', 'AMBIGUOUS_REVIEW'].includes(item.label));
  }
});

test('golden set respeita a decisão de produto principal versus acessório', () => {
  const mismatches = allCases()
    .filter((item) => item.label !== 'AMBIGUOUS_REVIEW')
    .filter((item) => matchesMarketplaceContract(
      getMarketplaceScenarioContract(item.scenario, item.marketplace), item.title,
    ) !== (item.label === 'MUST_ACCEPT'));
  assert.deepEqual(mismatches, [], `Divergências: ${mismatches.map((item) => `${item.marketplace}/${item.title}`).join(' | ')}`);
});

test('produto principal vence palavra secundária na intenção canônica', () => {
  const contract = SCENARIO_CONTRACTS.informatica_editorial;
  assert.equal(resolveCanonicalIntent({ productName: 'Webcam Full HD para Notebook' }, 'informatica_editorial', contract), 'webcam');
  assert.equal(resolveCanonicalIntent({ productName: 'Mini PC Intel com SSD 512GB' }, 'informatica_editorial', contract), 'mini pc');
});
