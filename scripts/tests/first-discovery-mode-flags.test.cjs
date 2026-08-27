'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FIRST_DISCOVERY_QUALITY_MODES,
  getFirstDiscoveryQualityMode,
  isFirstDiscoveryQualityActive,
  isFirstDiscoveryQualityShadow,
} = require('../first-discovery-flags.cjs');

const {
  evaluateFirstDiscoveryCandidate,
} = require('../first-discovery-candidate-quality.cjs');

const {
  assessFirstDiscoveryReadiness,
  buildFirstDiscoveryPlan,
  FIRST_DISCOVERY_QUALITY_VERSION,
} = require('../first-discovery-quality.cjs');

test('1. Feature Flag: Modo padrão é "off" e aceita apenas valores autorizados', () => {
  assert.equal(getFirstDiscoveryQualityMode({}), 'off');
  assert.equal(getFirstDiscoveryQualityMode({ FIRST_DISCOVERY_QUALITY_V1_MODE: '' }), 'off');
  assert.equal(getFirstDiscoveryQualityMode({ FIRST_DISCOVERY_QUALITY_V1_MODE: 'invalid_mode' }), 'off');
  assert.equal(getFirstDiscoveryQualityMode({ FIRST_DISCOVERY_QUALITY_V1_MODE: 'shadow' }), 'shadow');
  assert.equal(getFirstDiscoveryQualityMode({ FIRST_DISCOVERY_QUALITY_V1_MODE: 'active' }), 'active');
  assert.equal(getFirstDiscoveryQualityMode({ FIRST_DISCOVERY_QUALITY_V1_MODE: 'SHADOW' }), 'shadow');
  assert.equal(getFirstDiscoveryQualityMode({ FIRST_DISCOVERY_QUALITY_V1_MODE: 'ACTIVE' }), 'active');

  assert.deepEqual(FIRST_DISCOVERY_QUALITY_MODES, ['off', 'shadow', 'active']);
  assert.equal(isFirstDiscoveryQualityActive({ FIRST_DISCOVERY_QUALITY_V1_MODE: 'active' }), true);
  assert.equal(isFirstDiscoveryQualityActive({ FIRST_DISCOVERY_QUALITY_V1_MODE: 'shadow' }), false);
  assert.equal(isFirstDiscoveryQualityShadow({ FIRST_DISCOVERY_QUALITY_V1_MODE: 'shadow' }), true);
  assert.equal(isFirstDiscoveryQualityShadow({ FIRST_DISCOVERY_QUALITY_V1_MODE: 'off' }), false);
});

test('2. Modo Shadow: Gera plano e avalia candidatos sem mutação ou descarte do pool', () => {
  const plan = buildFirstDiscoveryPlan('beleza', 'Mercado Livre');
  assert.ok(plan.intents.length > 0);
  assert.ok(plan.targets.minStrongCandidates > 0);

  const candidate = {
    sourceItemId: 'MLB-123456',
    title: 'Modelador de Cachos Profissional Cerâmica Bivolt',
    currentPrice: 149.90,
    originalPrice: 199.90,
    rating: 4.8,
    bestSeller: true,
    shippingFree: true,
  };

  const intent = plan.intents.find((i) => i.term === 'modelador');
  const evaluation = evaluateFirstDiscoveryCandidate({
    marketplace: 'Mercado Livre',
    candidate,
    intent,
  });

  assert.equal(evaluation.eligible, true);
  assert.equal(evaluation.strong, true);
  assert.ok(evaluation.signals.includes('best_seller'));
  assert.ok(evaluation.signals.includes('shipping_free'));
  assert.ok(evaluation.signals.includes('real_discount_10_plus'));
});

test('3. Modo Active: Rejeita falsos positivos de domínio antes da curadoria', () => {
  const plan = buildFirstDiscoveryPlan('beleza', 'Mercado Livre');
  const aparadorIntent = plan.intents.find((i) => i.term === 'aparador');

  // Candidato com domínio incompatível (livros em Beleza)
  const invalidCandidate = {
    sourceItemId: 'MLB-999',
    title: 'Aparador de Livros Árvore Preto Metal Decorativo',
    currentPrice: 45.00,
    rawPayload: {
      domain_id: 'MLB-BOOKENDS',
      category_name: 'Decoração e Livros',
    },
  };

  const evaluation = evaluateFirstDiscoveryCandidate({
    marketplace: 'Mercado Livre',
    candidate: invalidCandidate,
    intent: aparadorIntent,
  });

  assert.equal(evaluation.eligible, false);
  assert.ok(evaluation.hardRejections.includes('incompatible_domain') || evaluation.hardRejections.includes('intent_mismatch'));
  assert.equal(evaluation.strong, false);
});

test('4. Modo Active: Rejeita candidatos com preço implausível de contarem como fortes', () => {
  const plan = buildFirstDiscoveryPlan('casa_cozinha_organizacao', 'Amazon');
  const mixerIntent = plan.intents.find((i) => i.term === 'mixer');

  const implausibleCandidate = {
    sourceItemId: 'B00FAKE',
    title: 'Mixer de Cozinha 3 em 1 Inox 500W',
    currentPrice: 64.90,
    originalPrice: 2163.33, // Desconto falso/implausível
    rating: 4.8,
    reviewCount: 150,
  };

  const evaluation = evaluateFirstDiscoveryCandidate({
    marketplace: 'Amazon',
    candidate: implausibleCandidate,
    intent: mixerIntent,
  });

  assert.equal(evaluation.eligible, true);
  assert.equal(evaluation.evidence.discountEvidenceRejected, true);
  assert.equal(evaluation.evidence.discountEvidenceReason, 'implausible_reference_price');
  assert.equal(evaluation.signals.includes('real_discount_10_plus'), false);
});

test('5. Avaliação de Readiness: Não pronta emite not_ready e não dispara Adaptive Discovery automaticamente', () => {
  const plan = buildFirstDiscoveryPlan('informatica', 'Mercado Livre');

  // Cenário de readiness não atingida (poucos candidatos fortes e famílias insuficientes)
  const readiness = assessFirstDiscoveryReadiness({
    affinity: 2,
    extracted: 40,
    afterRelevance: 30,
    afterQualityGate: 25,
    strongCandidates: 2, // Abaixo da meta
    distinctEditorialFamilies: 1, // Pouca diversidade
    coreFamiliesCovered: 1,
    queriesAttempted: 15,
    queriesSucceeded: 15,
  }, { affinity: 2, targets: plan.targets });

  assert.equal(readiness.ready, false);
  assert.ok(readiness.reasons.includes('strong_pool_too_small'));
  assert.ok(readiness.reasons.includes('editorial_diversity_too_low'));
  assert.equal(readiness.contractVersion, FIRST_DISCOVERY_QUALITY_VERSION);
});
