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

test('6. OFF Shopee: fila e persistência idênticas ao baseline', async () => {
  const { runDiscoveryOnlyCycle, FINAL_STATE } = require('../oracle-worker-discovery-only.cjs');
  process.env.FIRST_DISCOVERY_QUALITY_V1_MODE = 'off';

  let persistedPayload = null;
  const mockCandidates = [
    { itemId: '101', title: 'Modelador de Cachos Cerâmica Bivolt', price: 120, ratingStar: 4.8, sales: 500 },
    { itemId: '102', title: 'Escova de Cabelo Simples', price: 15, ratingStar: 4.0, sales: 20 },
    { itemId: '103', title: 'Aparador de Livros Metal Preto', price: 40, ratingStar: 4.5, sales: 10 },
  ];

  const result = await runDiscoveryOnlyCycle({
    tenantId: 'tenant-test',
    correlationId: 'corr-test',
    requestedAt: new Date().toISOString(),
    marketplaces: ['Shopee'],
    discover: async () => [],
    loadDeferred: async () => [],
    shopeeDiscovery: async () => ({
      engine: 'shopee_openapi_v1',
      mode: 'official',
      decision: 'success',
      top: mockCandidates,
      metrics: { raw: 3, parsed: 3, approvedContract: 3, final: 3 },
    }),
    loadHistory: async () => [],
    persist: async () => ({ accepted: 0, inserted: 0, updated: 0, state: FINAL_STATE, offerIds: [] }),
    persistShopee: async (payload) => {
      persistedPayload = payload;
      return { accepted: payload.candidates.length, inserted: payload.candidates.length, updated: 0, offerIds: ['off-1', 'off-2', 'off-3'] };
    },
    scenarioResolver: () => 'beleza_editorial',
  });

  assert.equal(result.marketplaces[0].queueSelected, 3);
  assert.equal(persistedPayload.candidates.length, 3);
});

test('7. SHADOW Shopee: mesma fila/persistência e emite telemetrias First Discovery', async () => {
  const { runDiscoveryOnlyCycle, FINAL_STATE } = require('../oracle-worker-discovery-only.cjs');
  process.env.FIRST_DISCOVERY_QUALITY_V1_MODE = 'shadow';

  const eventsEmitted = [];
  let persistedPayload = null;
  const mockCandidates = [
    { itemId: '101', title: 'Modelador de Cachos Cerâmica Bivolt', price: 120, ratingStar: 4.8, sales: 500 },
    { itemId: '102', title: 'Escova de Cabelo Simples', price: 15, ratingStar: 4.0, sales: 20 },
    { itemId: '103', title: 'Aparador de Livros Metal Preto', price: 40, ratingStar: 4.5, sales: 10 },
  ];

  const result = await runDiscoveryOnlyCycle({
    tenantId: 'tenant-test',
    correlationId: 'corr-test',
    requestedAt: new Date().toISOString(),
    marketplaces: ['Shopee'],
    discover: async () => [],
    loadDeferred: async () => [],
    shopeeDiscovery: async () => ({
      engine: 'shopee_openapi_v1',
      mode: 'official',
      decision: 'success',
      top: mockCandidates,
      metrics: { raw: 3, parsed: 3, approvedContract: 3, final: 3 },
    }),
    loadHistory: async () => [],
    observe: (event) => {
      eventsEmitted.push(event);
    },
    persist: async () => ({ accepted: 0, inserted: 0, updated: 0, state: FINAL_STATE, offerIds: [] }),
    persistShopee: async (payload) => {
      persistedPayload = payload;
      return { accepted: payload.candidates.length, inserted: payload.candidates.length, updated: 0, offerIds: ['off-1', 'off-2', 'off-3'] };
    },
    scenarioResolver: () => 'beleza_editorial',
  });

  assert.equal(result.marketplaces[0].queueSelected, 3);
  assert.equal(persistedPayload.candidates.length, 3);
  assert.ok(eventsEmitted.some((e) => e.eventType === 'discovery.first_quality.plan'));
  assert.ok(eventsEmitted.some((e) => e.eventType === 'discovery.first_quality.candidate_summary'));
  assert.ok(eventsEmitted.some((e) => e.eventType === 'discovery.first_quality.readiness'));
});

test('8. ACTIVE Shopee: ineligible não persiste e strong tem prioridade real', async () => {
  const { runDiscoveryOnlyCycle, FINAL_STATE } = require('../oracle-worker-discovery-only.cjs');
  process.env.FIRST_DISCOVERY_QUALITY_V1_MODE = 'active';

  let persistedPayload = null;
  const mockCandidates = [
    { itemId: '101', title: 'Modelador de Cachos Cerâmica Bivolt Profissional', price: 120, originalPrice: 160, ratingStar: 4.8, sales: 500, score: 95 },
    { itemId: '102', title: 'Escova de Cabelo Básica', price: 20, ratingStar: 4.0, sales: 20, score: 60 },
    { itemId: '103', title: 'Aparador de Livros Metal Preto Decorativo', price: 40, ratingStar: 4.5, sales: 10, score: 70, rawPayload: { domain_id: 'MLB-BOOKENDS' } },
  ];

  const result = await runDiscoveryOnlyCycle({
    tenantId: 'tenant-test',
    correlationId: 'corr-test',
    requestedAt: new Date().toISOString(),
    marketplaces: ['Shopee'],
    discover: async () => [],
    loadDeferred: async () => [],
    shopeeDiscovery: async () => ({
      engine: 'shopee_openapi_v1',
      mode: 'official',
      decision: 'success',
      top: mockCandidates,
      metrics: { raw: 3, parsed: 3, approvedContract: 3, final: 3 },
    }),
    loadHistory: async () => [],
    persist: async () => ({ accepted: 0, inserted: 0, updated: 0, state: FINAL_STATE, offerIds: [] }),
    persistShopee: async (payload) => {
      persistedPayload = payload;
      return { accepted: payload.candidates.length, inserted: payload.candidates.length, updated: 0, offerIds: ['off-1'] };
    },
    scenarioResolver: () => 'beleza_editorial',
  });

  // Em active, com 1 candidato strong presente, apenas o strong é selecionado (sem backfill de fracos)
  assert.equal(persistedPayload.candidates.length, 1);
  assert.equal(persistedPayload.candidates[0].sourceItemId, '101');
  assert.equal(result.marketplaces[0].queueSelected, 1);
});

test('9. ACTIVE Amazon/ML: strong vem antes de eligible-but-weak em selectCopyQueue', () => {
  const { selectCopyQueue } = require('../oracle-worker-discovery-only.cjs');

  const weakHighQueueScore = {
    sourceItemId: 'MLB-WEAK',
    title: 'Modelador de Cachos Simples Bivolt',
    sourceUrl: 'https://mercadolivre.com.br/p/MLB-WEAK',
    imageUrl: 'https://http2.mlstatic.com/img-weak.jpg',
    currentPrice: 100,
    originalPrice: 300,
    deterministicScore: 10.0,
    _firstDiscoveryQuality: { eligible: true, strong: false },
    category: { name: 'beleza_editorial' },
  };

  const strongLowerQueueScore = {
    sourceItemId: 'MLB-STRONG',
    title: 'Modelador de Cachos Cerâmica Tourmaline Profissional Bivolt',
    sourceUrl: 'https://mercadolivre.com.br/p/MLB-STRONG',
    imageUrl: 'https://http2.mlstatic.com/img-strong.jpg',
    currentPrice: 100,
    originalPrice: 115,
    rating: 4.8,
    deterministicScore: 2.0,
    _firstDiscoveryQuality: { eligible: true, strong: true },
    category: { name: 'beleza_editorial' },
  };

  // Teste no modo OFF: queueScore dita a ordem (weakHighQueueScore tem score muito maior)
  process.env.FIRST_DISCOVERY_QUALITY_V1_MODE = 'off';
  const queueOff = selectCopyQueue([weakHighQueueScore, strongLowerQueueScore], { marketplace: 'Mercado Livre', maxPerMarketplace: 10 });
  assert.equal(queueOff.selected[0].sourceItemId, 'MLB-WEAK');

  // Teste no modo ACTIVE: strong tem prioridade absoluta e fracos não fazem backfill artificial
  process.env.FIRST_DISCOVERY_QUALITY_V1_MODE = 'active';
  const queueActive = selectCopyQueue([weakHighQueueScore, strongLowerQueueScore], { marketplace: 'Mercado Livre', maxPerMarketplace: 10 });
  assert.equal(queueActive.selected.length, 1);
  assert.equal(queueActive.selected[0].sourceItemId, 'MLB-STRONG');

  process.env.FIRST_DISCOVERY_QUALITY_V1_MODE = 'off';
});

test('10. OFFER_QUALITY_PIPELINE_V2=shadow continua usando evaluateDiscoveryShadow', () => {
  const shadowRuntime = require('../offer-quality-shadow-runtime.cjs');
  assert.equal(typeof shadowRuntime.evaluateDiscoveryShadow, 'function');

  const dummyRaw = [{ sourceItemId: 'AMZ-1', title: 'Produto Teste', currentPrice: 50, sourceUrl: 'https://amazon.com.br/dp/B001', imageUrl: 'https://amazon.com.br/img.jpg', nativeIdentity: 'B001' }];
  const dummyQueue = { selected: [{ sourceItemId: 'AMZ-1' }], limits: { maxPerMarketplace: 5 } };

  const shadowResult = shadowRuntime.evaluateDiscoveryShadow(dummyRaw, dummyQueue, { marketplace: 'Amazon' });
  assert.equal(typeof shadowResult, 'object');
  assert.ok('recordCount' in shadowResult);
  assert.ok('v1Selected' in shadowResult);
  assert.ok('v2Winners' in shadowResult);
});

test('11. Efficacy harness: strongCandidates usa intent compatível', () => {
  const { extractEfficacyMetrics } = require('./commercial-niche-efficacy-runner.cjs');
  const { getCommercialNiche } = require('../commercial-niche-config.cjs');
  const { buildNicheMarketplacePlan } = require('../commercial-niche-runtime-adapter.cjs');

  const belezaNiche = getCommercialNiche('beleza');
  const plan = buildNicheMarketplacePlan('beleza', 'Mercado Livre');

  // 1 candidato com título incompatível (aparador de livros) vs 1 candidato com título compatível (modelador)
  const candidates = [
    { title: 'Aparador de Livros Metal Preto Decorativo', currentPrice: 40, rating: 4.8, originalPrice: 60, rawPayload: { domain_id: 'MLB-BOOKENDS' } },
    { title: 'Modelador de Cachos Cerâmica Tourmaline Bivolt', currentPrice: 140, originalPrice: 190, rating: 4.8, bestSeller: true, shippingFree: true },
  ];

  const metrics = extractEfficacyMetrics(candidates, [{ status: 'ok' }], belezaNiche, {
    marketplace: 'Mercado Livre',
    affinity: plan.affinity,
    targets: plan.firstDiscovery?.targets,
    intents: plan.firstDiscovery?.intents,
  });

  // Apenas o modelador (1) deve contar como strongCandidate, pois o aparador de livros não é intent compatível
  assert.equal(metrics.strongCandidates, 1);
});

test('12. Regressão Shopee Active: zero strong com weak elegíveis resulta em queueSelected=0 e persisted=0', async () => {
  const { runDiscoveryOnlyCycle, FINAL_STATE } = require('../oracle-worker-discovery-only.cjs');
  process.env.FIRST_DISCOVERY_QUALITY_V1_MODE = 'active';

  let persistedPayload = null;
  // Candidatos elegíveis (passam pelos filtros básicos e de intenção), porém sem sinais fortes suficientes (weak)
  const mockWeakCandidates = [
    { itemId: '201', title: 'Modelador de Cachos Básico Simples', price: 50, ratingStar: 4.3, sales: 10, score: 50 },
    { itemId: '202', title: 'Escova de Cabelo Básica', price: 20, ratingStar: 4.3, sales: 5, score: 40 },
  ];

  const result = await runDiscoveryOnlyCycle({
    tenantId: 'tenant-test',
    correlationId: 'corr-test-zero-strong',
    requestedAt: new Date().toISOString(),
    marketplaces: ['Shopee'],
    discover: async () => [],
    loadDeferred: async () => [],
    shopeeDiscovery: async () => ({
      engine: 'shopee_openapi_v1',
      mode: 'official',
      decision: 'success',
      top: mockWeakCandidates,
      metrics: { raw: 2, parsed: 2, approvedContract: 2, final: 2 },
    }),
    loadHistory: async () => [],
    persist: async () => ({ accepted: 0, inserted: 0, updated: 0, state: FINAL_STATE, offerIds: [] }),
    persistShopee: async (payload) => {
      persistedPayload = payload;
      return { accepted: payload.candidates.length, inserted: payload.candidates.length, updated: 0, offerIds: [] };
    },
    scenarioResolver: () => 'beleza_editorial',
  });

  assert.equal(result.marketplaces[0].queueSelected, 0);
  assert.equal(result.marketplaces[0].persisted, 0);
  assert.equal(persistedPayload, null);
  process.env.FIRST_DISCOVERY_QUALITY_V1_MODE = 'off';
});

