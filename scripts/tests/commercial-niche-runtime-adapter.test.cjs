'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildNicheMarketplacePlan,
  resolveShadowNichePlanFromLegacy,
} = require('../commercial-niche-runtime-adapter.cjs');

test('1. Constrói plano de nicho com termos Core e Expansion ajustados pela afinidade', () => {
  // Beleza no Mercado Livre (Afinidade 2 -> 100% Core + 50% Expansion)
  const planML = buildNicheMarketplacePlan('beleza_cuidados_pessoais', 'Mercado Livre');
  assert.equal(planML.affinity, 2);
  assert.equal(planML.rules.candidateLimit, 7);
  assert.equal(planML.rules.maxPagesPerTerm, 1);
  assert.equal(planML.terms.core.length, 8);
  assert.equal(planML.terms.expansion.length, 4); // 50% de 8

  // Beleza na Shopee (Afinidade 3 -> 100% Core + 100% Expansion)
  const planShopee = buildNicheMarketplacePlan('beleza_cuidados_pessoais', 'Shopee');
  assert.equal(planShopee.affinity, 3);
  assert.equal(planShopee.rules.candidateLimit, 10);
  assert.equal(planShopee.rules.maxPagesPerTerm, 2);
  assert.equal(planShopee.terms.core.length, 8);
  assert.equal(planShopee.terms.expansion.length, 8);
});

test('2. Resolve plano shadow a partir de cenário legado compatível', () => {
  const resolved = resolveShadowNichePlanFromLegacy('casa_cozinha_editorial', ['Shopee', 'Amazon', 'Mercado Livre']);
  assert.equal(resolved.mode, 'shadow_compatible');
  assert.equal(resolved.nicheId, 'casa_cozinha_organizacao');
  assert.ok(resolved.plans.Shopee);
  assert.ok(resolved.plans.Amazon);
  assert.ok(resolved.plans['Mercado Livre']);
});

test('3. Cenários legados fora dos 7 nichos retornam modo legacy_only', () => {
  const outside = resolveShadowNichePlanFromLegacy('tv_audio_editorial');
  assert.equal(outside.mode, 'legacy_only');
  assert.equal(outside.reason, 'legacy_scenario_outside_final_7_niches');
});
