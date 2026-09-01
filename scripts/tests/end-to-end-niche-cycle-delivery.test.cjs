'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runDiscoveryOnlyCycle } = require('../oracle-worker-discovery-only.cjs');
const { filterNovelNormalizedProducts, resolvePersistedOfferIds, persistDiscoveryIngestionV1 } = require('../oracle-scraper.cjs');
const { filterFreshCandidates } = require('../offer-freshness-gate.cjs');
const { evaluateFirstDiscoveryCandidate } = require('../first-discovery-candidate-quality.cjs');
const { controlledCandidateQuality, selectControlledPersistCandidates } = require('../shopee-openapi-v1-controlled-persist.cjs');

test('1. filterNovelNormalizedProducts preserva conhecidos como revalidados sem descartar', async () => {
  const candidates = [
    { marketplace: 'Mercado Livre', sourceItemId: 'MLB-101', title: 'Fritadeira Air Fryer Britânia 5L 1500W', currentPrice: 299 },
    { marketplace: 'Mercado Livre', sourceItemId: 'MLB-102', title: 'Liquidificador Turbo 1000W', currentPrice: 149 },
  ];

  const result = await filterNovelNormalizedProducts('Mercado Livre', candidates);
  assert.equal(result.length, 2, 'Todos os produtos devem ser mantidos');
  for (const product of result) {
    assert.equal(typeof product.isKnown, 'boolean');
    assert.equal(typeof product.isNovel, 'boolean');
    assert.equal(typeof product.isRevalidated, 'boolean');
    assert.equal(product.isKnown, !product.isNovel);
    assert.equal(product.isRevalidated, product.isKnown);
  }
});

test('2. offer-freshness-gate revalida produtos históricos em vez de descartar', () => {
  const recentHistory = [
    { item_id: '12345', product_name: 'Smartphone Samsung Galaxy', current_price: 1200, created_at: new Date().toISOString() },
  ];
  const incoming = [
    { sourceItemId: '12345', title: 'Smartphone Samsung Galaxy 128GB', currentPrice: 1150, originalPrice: 1400 },
  ];

  const result = filterFreshCandidates('Shopee', incoming, recentHistory);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].isKnown, true);
  assert.equal(result.accepted[0].isRevalidated, true);
  assert.equal(result.rejected.length, 0);
});

test('3. evaluateFirstDiscoveryCandidate avalia rating comercial como sinal sem hard-rejection', () => {
  const result = evaluateFirstDiscoveryCandidate({
    marketplace: 'Shopee',
    intent: { term: 'ventilador', queries: ['ventilador de coluna'] },
    candidate: {
      product_name: 'Ventilador de Coluna 40cm Turbo Silencioso',
      current_price: 159.90,
      old_price: 199.90,
      rating: 4.1,
      sales: 450,
      source_position: 5,
    },
  });

  assert.equal(result.eligible, true, 'Deve ser tecnicamente elegível');
  assert.equal(result.hardRejections.length, 0, 'Não deve ter hard rejections');
  assert.ok(result.signals.includes('sales_300_plus'));
  assert.ok(!result.signals.includes('rating_4_7_plus'), 'Rating < 4.7 não ganha sinal de rating');
});

test('4. controlledCandidateQuality preserva produtos Shopee com rating e vendas normais', () => {
  const candidate = {
    itemId: '998877',
    productName: 'Mop Giratório com Balde Centrifuga Inox',
    ratingStar: 4.5,
    sales: 80,
    priceMin: 69.90,
    priceMax: 79.90,
    priceRangeAmbiguous: false,
    safeForPublication: true,
  };

  const quality = controlledCandidateQuality(candidate);
  assert.equal(quality.eligible, true);
  assert.ok(quality.warnings.includes('rating_below_4_7'));
  assert.ok(quality.warnings.includes('sales_below_100'));
});

test('5. Ciclo Discovery-Only entrega até 10 produtos por marketplace combinando novos e conhecidos', async () => {
  // 10 produtos Shopee de 10 famílias distintas: 5 novos e 5 conhecidos
  const shopeePool = Array.from({ length: 15 }, (_, i) => ({
    itemId: String(1000 + i),
    shopId: String(2000 + i),
    productName: `Shopee Produto Casa ${i} Alta Qualidade`,
    price: 50 + i * 5,
    originalPrice: 80 + i * 5,
    offerLink: `https://shopee.com.br/product/${2000 + i}/${1000 + i}`,
    imageUrl: `https://cf.shopee.com.br/file/img_${i}.jpg`,
    curatedFamily: `familia_${i}`,
    productCatIds: ['100010'],
    score: 90 - i,
    ratingStar: 4.8,
    sales: 300 + i * 20,
    marketplaceMetrics: { rating: 4.8, sales: 300 + i * 20, discount: 30 },
  }));

  // Histórico com 5 produtos conhecidos
  const history = [
    { shopee_item_id: '1000', shopee_shop_id: '2000', product_name: 'Shopee Produto Casa 0 Alta Qualidade', status: 'approved', current_price: 50, old_price: 80, created_at: '2026-08-20T00:00:00.000Z', posts: [] },
    { shopee_item_id: '1001', shopee_shop_id: '2001', product_name: 'Shopee Produto Casa 1 Alta Qualidade', status: 'approved', current_price: 55, old_price: 85, created_at: '2026-08-20T00:00:00.000Z', posts: [] },
    { shopee_item_id: '1002', shopee_shop_id: '2002', product_name: 'Shopee Produto Casa 2 Alta Qualidade', status: 'approved', current_price: 60, old_price: 90, created_at: '2026-08-20T00:00:00.000Z', posts: [] },
    { shopee_item_id: '1003', shopee_shop_id: '2003', product_name: 'Shopee Produto Casa 3 Alta Qualidade', status: 'approved', current_price: 65, old_price: 95, created_at: '2026-08-20T00:00:00.000Z', posts: [] },
    { shopee_item_id: '1004', shopee_shop_id: '2004', product_name: 'Shopee Produto Casa 4 Alta Qualidade', status: 'approved', current_price: 70, old_price: 100, created_at: '2026-08-20T00:00:00.000Z', posts: [] },
  ];

  let persistedPayload = null;
  let metadataPayload = null;

  const result = await runDiscoveryOnlyCycle({
    tenantId: 'tenant-test',
    correlationId: 'test-cycle-10-products',
    requestedAt: new Date().toISOString(),
    marketplaces: ['Shopee'],
    discover: async () => [],
    shopeeDiscovery: async () => ({
      engine: 'shopee_openapi_v1',
      mode: 'official',
      decision: 'official',
      top: shopeePool.slice(0, 10),
      candidatePool: shopeePool,
      metrics: { raw: 15, parsed: 15, approvedContract: 15, scoreable: 15, final: 10 },
    }),
    persistShopee: async (payload) => {
      persistedPayload = payload;
      return {
        accepted: payload.candidates.length,
        inserted: 5,
        updated: 5,
        rpcSent: payload.candidates.length,
        offerIds: payload.candidates.map((c, idx) => `offer-id-${idx + 1}`),
      };
    },
    persist: async () => ({ accepted: 0 }),
    persistV2Metadata: async (meta) => { metadataPayload = meta; },
    loadHistory: async () => history,
    scenarioResolver: () => 'casa_cozinha_editorial',
    scenarioRuntimeResolver: () => ({ scenarioId: 'casa_cozinha_editorial', runtime: 'test' }),
  });

  const summary = result.marketplaces[0];
  assert.equal(summary.persisted, 10, 'Deve persistir 10 produtos na Shopee');
  assert.equal(persistedPayload.candidates.length, 10, '10 candidatos elegíveis enviados para persistência');

  const knownCount = persistedPayload.candidates.filter((c) => c.isKnown).length;
  const novelCount = persistedPayload.candidates.filter((c) => c.isNovel).length;
  assert.equal(knownCount, 5, 'Deve conter 5 produtos conhecidos revalidados');
  assert.equal(novelCount, 5, 'Deve conter 5 produtos novos');
  assert.equal(knownCount + novelCount, 10, 'Total de novos + conhecidos deve ser 10');
});
