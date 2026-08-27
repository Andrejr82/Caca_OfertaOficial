'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FIRST_DISCOVERY_QUALITY_VERSION,
  FAMILY_TERMS_BY_NICHE,
  buildFirstDiscoveryPlan,
  matchesFirstDiscoveryIntent,
  assessFirstDiscoveryReadiness,
} = require('../first-discovery-quality.cjs');
const { COMMERCIAL_NICHE_IDS } = require('../commercial-niche-config.cjs');

test('1. os sete nichos possuem cobertura editorial de primeira descoberta', () => {
  assert.equal(FIRST_DISCOVERY_QUALITY_VERSION, 'discovery-retrieval-quality/v1');
  for (const nicheId of COMMERCIAL_NICHE_IDS) {
    const families = Object.keys(FAMILY_TERMS_BY_NICHE[nicheId] || {});
    assert.ok(families.length >= 4, `${nicheId} deve ter ao menos 4 familias editoriais`);

    const plan = buildFirstDiscoveryPlan(nicheId, 'Amazon');
    assert.ok(plan.intents.length > 0, `${nicheId} deve gerar intents`);
    assert.ok(plan.families.length >= 4, `${nicheId} deve preservar diversidade no plano`);
    assert.equal(plan.objective, 'build_strong_editorial_pool_before_final_ranking');
  }
});

test('2. Casa corrige mixer e varal antes da coleta em vez de tentar filtrar depois', () => {
  const plan = buildFirstDiscoveryPlan('casa_cozinha_organizacao', 'Amazon');
  const mixer = plan.intents.find((intent) => intent.term === 'mixer');
  const varal = plan.intents.find((intent) => intent.term === 'varal');

  assert.deepEqual(mixer.queries, ['mixer de cozinha', 'mixer 3 em 1 cozinha']);
  assert.equal(matchesFirstDiscoveryIntent(mixer, 'Shakeira Mixer Fitness Masculina 700 Ml'), false);
  assert.equal(matchesFirstDiscoveryIntent(mixer, 'Mixer de Cozinha 3 em 1 600W'), true);

  assert.deepEqual(varal.queries, ['varal de chao para roupas', 'varal dobravel para roupas']);
  assert.equal(matchesFirstDiscoveryIntent(varal, 'Varal Bandeirinhas Tecido Personalizado Mini Varal'), false);
  assert.equal(matchesFirstDiscoveryIntent(varal, 'Varal de Chão Dobrável para Roupas'), true);
});

test('3. Beleza transforma termos ambiguos em intents comerciais fortes', () => {
  const plan = buildFirstDiscoveryPlan('beleza', 'Mercado Livre');
  const perfume = plan.intents.find((intent) => intent.term === 'perfume');
  const modelador = plan.intents.find((intent) => intent.term === 'modelador');
  const aparador = plan.intents.find((intent) => intent.term === 'aparador');

  assert.deepEqual(perfume.queries, ['perfume feminino eau de parfum', 'perfume masculino eau de parfum']);
  assert.equal(matchesFirstDiscoveryIntent(perfume, 'Perfume Para Cachorro Gato Higiene Frescor Prolongado'), false);
  assert.equal(matchesFirstDiscoveryIntent(perfume, 'Perfume Feminino Eau de Parfum 100ml'), true);

  assert.equal(matchesFirstDiscoveryIntent(modelador, 'Modelador Decor Util de Donuts com Pinça'), false);
  assert.equal(matchesFirstDiscoveryIntent(modelador, 'Modelador de Cachos Profissional Bivolt'), true);

  assert.equal(matchesFirstDiscoveryIntent(aparador, 'Aparador De Livros Árvore Preto'), false);
  assert.equal(matchesFirstDiscoveryIntent(aparador, 'Aparador de Pelos Recarregável'), true);
  assert.equal(plan.strategy.requireNativeDomainEvidence, true);
});

test('4. Informática evita peças e acessórios já na intenção de busca', () => {
  const plan = buildFirstDiscoveryPlan('informatica', 'Mercado Livre');
  const teclado = plan.intents.find((intent) => intent.term === 'teclado');
  const impressora = plan.intents.find((intent) => intent.term === 'impressora');
  const mouse = plan.intents.find((intent) => intent.term === 'mouse');

  assert.deepEqual(teclado.queries, ['teclado mecanico', 'teclado sem fio', 'teclado gamer']);
  assert.equal(matchesFirstDiscoveryIntent(teclado, 'Teclado Para Notebook Lenovo Ideapad 100-15Iby'), false);
  assert.equal(matchesFirstDiscoveryIntent(teclado, 'Teclado Mecânico Gamer ABNT2'), true);

  assert.equal(matchesFirstDiscoveryIntent(impressora, 'Capa Para Impressora Hp Laserjet P1102'), false);
  assert.equal(matchesFirstDiscoveryIntent(impressora, 'Caneta 3D Impressora Com Refil'), false);
  assert.equal(matchesFirstDiscoveryIntent(impressora, 'Impressora Multifuncional Epson EcoTank'), true);

  assert.equal(matchesFirstDiscoveryIntent(mouse, 'Mouse Pad Grande Couro Preto'), false);
  assert.equal(matchesFirstDiscoveryIntent(mouse, 'Mouse Gamer Sem Fio 12000 DPI'), true);
});

test('5. regressão Casa 06h: 18 de 23 queries Amazon falhando torna a primeira descoberta insuficiente', () => {
  const assessment = assessFirstDiscoveryReadiness({
    affinity: 3,
    extracted: 80,
    afterRelevance: 32,
    afterQualityGate: 26,
    strongCandidates: 5,
    distinctEditorialFamilies: 3,
    coreFamiliesCovered: 2,
    queriesAttempted: 23,
    queriesSucceeded: 5,
  });

  assert.equal(assessment.ready, false);
  assert.ok(assessment.reasons.includes('source_health_degraded'));
  assert.ok(assessment.reasons.includes('strong_pool_too_small'));
  assert.ok(assessment.reasons.includes('core_coverage_too_low'));
});

test('6. regressão Beleza 08h: volume alto não compensa carteira concentrada', () => {
  const assessment = assessFirstDiscoveryReadiness({
    affinity: 3,
    extracted: 245,
    afterRelevance: 96,
    afterQualityGate: 67,
    strongCandidates: 7,
    distinctEditorialFamilies: 3,
    coreFamiliesCovered: 2,
    queriesAttempted: 15,
    queriesSucceeded: 15,
  });

  assert.equal(assessment.ready, false);
  assert.equal(assessment.reasons.includes('source_health_degraded'), false);
  assert.ok(assessment.reasons.includes('strong_pool_too_small'));
  assert.ok(assessment.reasons.includes('editorial_diversity_too_low'));
});

test('7. regressão Shopee Beleza: 7 relevantes de 60 denuncia precisão ruim da busca inicial', () => {
  const assessment = assessFirstDiscoveryReadiness({
    affinity: 3,
    extracted: 60,
    afterRelevance: 7,
    afterQualityGate: 7,
    strongCandidates: 7,
    distinctEditorialFamilies: 3,
    coreFamiliesCovered: 2,
  });

  assert.equal(assessment.ready, false);
  assert.ok(assessment.reasons.includes('retrieval_precision_too_low'));
});

test('8. regressão Informática 10h: muito volume bruto não autoriza encerrar com poucos achados fortes', () => {
  const assessment = assessFirstDiscoveryReadiness({
    affinity: 3,
    extracted: 565,
    afterRelevance: 277,
    afterQualityGate: 258,
    strongCandidates: 4,
    distinctEditorialFamilies: 3,
    coreFamiliesCovered: 2,
  });

  assert.equal(assessment.ready, false);
  assert.ok(assessment.reasons.includes('strong_pool_too_small'));
  assert.ok(assessment.reasons.includes('editorial_diversity_too_low'));
  assert.ok(assessment.reasons.includes('core_coverage_too_low'));
});

test('9. um pool inicial saudável pode encerrar sem segunda busca', () => {
  const assessment = assessFirstDiscoveryReadiness({
    affinity: 3,
    extracted: 180,
    afterRelevance: 72,
    afterQualityGate: 42,
    strongCandidates: 22,
    distinctEditorialFamilies: 5,
    coreFamiliesCovered: 4,
    queriesAttempted: 15,
    queriesSucceeded: 14,
  });

  assert.equal(assessment.ready, true);
  assert.deepEqual(assessment.reasons, []);
});
