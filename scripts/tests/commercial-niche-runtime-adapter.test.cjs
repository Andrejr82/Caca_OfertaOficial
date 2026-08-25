'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildNicheMarketplacePlan,
  resolveNichePlanFromLegacyScenario,
} = require('../commercial-niche-runtime-adapter.cjs');

test('1. Constrói plano de nicho com termos Core e Expansion ajustados pela afinidade para beleza', () => {
  // Beleza no Mercado Livre (Afinidade 2 -> 100% Core + 50% Expansion)
  const planML = buildNicheMarketplacePlan('beleza', 'Mercado Livre');
  assert.equal(planML.nicheId, 'beleza');
  assert.equal(planML.affinity, 2);
  assert.equal(planML.rules.candidateLimit, 7);
  assert.equal(planML.rules.maxPagesPerTerm, 1);
  assert.equal(planML.terms.core.length, 9);
  assert.equal(planML.terms.expansion.length, 3); // 50% de 6

  // Beleza na Shopee (Afinidade 3 -> 100% Core + 100% Expansion)
  const planShopee = buildNicheMarketplacePlan('beleza', 'Shopee');
  assert.equal(planShopee.nicheId, 'beleza');
  assert.equal(planShopee.affinity, 3);
  assert.equal(planShopee.rules.candidateLimit, 10);
  assert.equal(planShopee.rules.maxPagesPerTerm, 2);
  assert.equal(planShopee.terms.core.length, 9);
  assert.equal(planShopee.terms.expansion.length, 6);
});

test('2. Resolve plano/configuração de nicho a partir de cenário legado compatível', () => {
  const resolvedCasa = resolveNichePlanFromLegacyScenario('casa_cozinha_editorial', ['Shopee', 'Amazon', 'Mercado Livre']);
  assert.equal(resolvedCasa.mode, 'niche_mapped');
  assert.equal(resolvedCasa.nicheId, 'casa_cozinha_organizacao');
  assert.ok(resolvedCasa.plans.Shopee);
  assert.ok(resolvedCasa.plans.Amazon);
  assert.ok(resolvedCasa.plans['Mercado Livre']);

  const resolvedBeleza = resolveNichePlanFromLegacyScenario('beleza_editorial');
  assert.equal(resolvedBeleza.mode, 'niche_mapped');
  assert.equal(resolvedBeleza.nicheId, 'beleza');

  const resolvedModa = resolveNichePlanFromLegacyScenario('moda_editorial');
  assert.equal(resolvedModa.mode, 'niche_mapped');
  assert.equal(resolvedModa.nicheId, 'moda');
});

test('3. Cenários legados fora dos 7 nichos retornam modo legacy_only', () => {
  const outside = resolveNichePlanFromLegacyScenario('tv_audio_editorial');
  assert.equal(outside.mode, 'legacy_only');
  assert.equal(outside.reason, 'legacy_scenario_outside_final_7_niches');
});
