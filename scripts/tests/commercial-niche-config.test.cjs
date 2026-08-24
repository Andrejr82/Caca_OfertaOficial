'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  COMMERCIAL_NICHES,
  COMMERCIAL_NICHE_IDS,
  LEGACY_SCENARIO_TO_NICHE_MAP,
  LEGACY_SCENARIOS_OUTSIDE_NICHES,
  AFFINITY_RULES,
  getCommercialNiche,
  resolveNicheFromLegacyScenario,
  getAffinityRules,
} = require('../commercial-niche-config.cjs');

test('1. Valida existência exata dos 7 nichos comerciais autoritativos', () => {
  assert.equal(COMMERCIAL_NICHE_IDS.length, 7);
  const expectedIds = [
    'casa_cozinha_organizacao',
    'beleza_cuidados_pessoais',
    'moda_calcados',
    'eletrodomesticos',
    'informatica',
    'ferramentas',
    'pet',
  ];
  assert.deepEqual(COMMERCIAL_NICHE_IDS.slice().sort(), expectedIds.slice().sort());
});

test('2. Cada nicho possui Core, Expansion, MarketplaceAffinity e Guardrails não-vazios', () => {
  for (const id of COMMERCIAL_NICHE_IDS) {
    const niche = getCommercialNiche(id);
    assert.ok(niche, `Nicho ${id} deve existir`);
    assert.ok(niche.name, `Nicho ${id} deve ter name`);
    assert.ok(Array.isArray(niche.coreProducts) && niche.coreProducts.length > 0, `Nicho ${id} deve ter coreProducts`);
    assert.ok(Array.isArray(niche.expansionProducts) && niche.expansionProducts.length > 0, `Nicho ${id} deve ter expansionProducts`);
    assert.ok(Array.isArray(niche.opportunityProducts), `Nicho ${id} deve ter array opportunityProducts`);
    assert.ok(niche.marketplaceAffinity.Amazon >= 1 && niche.marketplaceAffinity.Amazon <= 3);
    assert.ok(niche.marketplaceAffinity['Mercado Livre'] >= 1 && niche.marketplaceAffinity['Mercado Livre'] <= 3);
    assert.ok(niche.marketplaceAffinity.Shopee >= 1 && niche.marketplaceAffinity.Shopee <= 3);
    assert.ok(Array.isArray(niche.guardrails.allowedProductTerms) && niche.guardrails.allowedProductTerms.length > 0);
    assert.ok(Array.isArray(niche.guardrails.blockedProductTerms) && niche.guardrails.blockedProductTerms.length > 0);
  }
});

test('3. Mapeamento de cenários legados para os 7 nichos', () => {
  assert.equal(resolveNicheFromLegacyScenario('casa_cozinha_editorial').nicheId, 'casa_cozinha_organizacao');
  assert.equal(resolveNicheFromLegacyScenario('organizacao_editorial').nicheId, 'casa_cozinha_organizacao');
  assert.equal(resolveNicheFromLegacyScenario('beleza_editorial').nicheId, 'beleza_cuidados_pessoais');
  assert.equal(resolveNicheFromLegacyScenario('moda_editorial').nicheId, 'moda_calcados');
  assert.equal(resolveNicheFromLegacyScenario('eletrodomesticos_editorial').nicheId, 'eletrodomesticos');
  assert.equal(resolveNicheFromLegacyScenario('informatica_editorial').nicheId, 'informatica');
  assert.equal(resolveNicheFromLegacyScenario('ferramentas_editorial').nicheId, 'ferramentas');
  assert.equal(resolveNicheFromLegacyScenario('pet_editorial').nicheId, 'pet');
});

test('4. Cenários fora dos 7 nichos permanecem estritamente legacy_only', () => {
  for (const legacyId of LEGACY_SCENARIOS_OUTSIDE_NICHES) {
    const res = resolveNicheFromLegacyScenario(legacyId);
    assert.equal(res.mode, 'legacy_only');
    assert.equal(res.nicheId, null);
    assert.equal(res.reason, 'legacy_scenario_outside_final_7_niches');
  }
});

test('5. Regras de afinidade 1, 2 e 3 retornam parâmetros válidos', () => {
  const aff3 = getAffinityRules(3);
  assert.equal(aff3.corePercent, 1.0);
  assert.equal(aff3.expansionPercent, 1.0);
  assert.equal(aff3.maxPagesPerTerm, 2);
  assert.equal(aff3.candidateLimit, 10);

  const aff2 = getAffinityRules(2);
  assert.equal(aff2.corePercent, 1.0);
  assert.equal(aff2.expansionPercent, 0.5);
  assert.equal(aff2.maxPagesPerTerm, 1);
  assert.equal(aff2.candidateLimit, 7);

  const aff1 = getAffinityRules(1);
  assert.equal(aff1.corePercent, 1.0);
  assert.equal(aff1.expansionPercent, 0.0);
  assert.equal(aff1.maxPagesPerTerm, 1);
  assert.equal(aff1.candidateLimit, 4);
});
