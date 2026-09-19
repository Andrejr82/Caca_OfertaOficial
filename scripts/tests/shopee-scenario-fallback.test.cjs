'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveShopeeScenarioForCycle } = require('../oracle-scraper.cjs');

test('Shopee Scenario Fallback — informatica_editorial maps deterministically to active certified niche', () => {
  // informatica_editorial não possui mapeamento direto de catálogo Shopee no Brasil,
  // devendo rotacionar deterministamente entre os nichos ativos certificados
  const date1 = new Date('2026-09-18T10:00:00Z');
  const resolvedScenario1 = resolveShopeeScenarioForCycle('informatica_editorial', date1);
  assert.ok(typeof resolvedScenario1 === 'string' && resolvedScenario1.length > 0);
  assert.notEqual(resolvedScenario1, 'informatica_editorial');

  // Mesma data deve produzir exatamente o mesmo cenário (determinismo)
  const resolvedScenarioSameDay = resolveShopeeScenarioForCycle('informatica_editorial', date1);
  assert.equal(resolvedScenarioSameDay, resolvedScenario1);

  // Outra data diferente
  const date2 = new Date('2026-09-19T10:00:00Z');
  const resolvedScenario2 = resolveShopeeScenarioForCycle('informatica_editorial', date2);
  assert.ok(typeof resolvedScenario2 === 'string' && resolvedScenario2.length > 0);
  assert.notEqual(resolvedScenario2, 'informatica_editorial');
});

test('Shopee Scenario Fallback — Outros cenários válidos são preservados sem alteração', () => {
  const directScenarios = [
    'moda_editorial',
    'beleza_editorial',
    'casa_decoracao_editorial',
    'cozinha_eletroportateis_editorial',
    'games_consoles_editorial',
  ];

  for (const scenario of directScenarios) {
    const resolved = resolveShopeeScenarioForCycle(scenario, new Date('2026-09-18T10:00:00Z'));
    assert.equal(resolved, scenario, `Cenário ${scenario} não deveria sofrer fallback`);
  }
});
