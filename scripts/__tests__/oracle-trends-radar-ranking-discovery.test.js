'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { selectRadarVNext } = require('../../src/core/trends/radar-vnext-selector.cjs');
const { runRadarVNext } = require('../../scripts/oracle-trends-radar-vnext-pipeline.cjs');

const SAMPLE_FAMILIES = [
  'Fone Bluetooth TWS Sem Fio',
  'Smartwatch Relogio Inteligente',
  'Suporte Celular Veicular Mesa',
  'Camera Seguranca Wifi 360',
  'Mini Mixer Eletrico Portatil',
  'Video Game Stick Retrô',
  'Parafusadeira Furadeira Sem Fio',
  'Mochila Antifurto Impermeavel',
  'Mop Giratorio Limpeza',
  'Organizador Gavetas Divisorias',
];

function createCandidate(id, overrides = {}) {
  const familyName = SAMPLE_FAMILIES[id % SAMPLE_FAMILIES.length];
  return {
    marketplace: 'Shopee',
    itemId: String(id),
    shopId: String(100 + (id % 15)), // diverse stores
    productName: `${familyName} Modelo ${id}`,
    category: 'Marketplace Deals',
    currentPrice: 30.0 + (id % 20),
    oldPrice: 60.0,
    discountPercent: 50,
    sales: 1000,
    rating: 4.8,
    commissionRate: 10,
    sellerCommissionRate: 0,
    permalink: `https://shopee.com.br/product/shop/item${id}`,
    imageUrl: `https://cf.shopee.com.br/file/img${id}.jpg`,
    provenance: 'shopee_openapi_productOfferV2',
    evidenceStatus: 'verified',
    ...overrides,
  };
}

test('CENÁRIO A: 30 valid candidates with score 25-49 -> returns 20 selected, real scores preserved, none promoted', () => {
  const candidates = [];
  for (let i = 1; i <= 30; i++) {
    candidates.push(createCandidate(i, {
      currentPrice: 50.0 + i,
      sales: 10, // low sales
      rating: 4.0,
      commissionRate: 1,
    }));
  }

  const selected = selectRadarVNext(candidates, { maxProducts: 20 });
  assert.equal(selected.length, 20, 'Should return 20 best available candidates');

  for (const row of selected) {
    assert.ok(row.score.total < 50, 'Score should be preserved < 50');
    assert.equal(row.score.decision, 'IGNORAR', 'Decision must remain IGNORAR without artificial promotion');
  }

  // Verify ordering (highest score first)
  for (let i = 0; i < selected.length - 1; i++) {
    assert.ok(selected[i].score.total >= selected[i + 1].score.total, 'Must be sorted descending by score');
  }
});

test('CENÁRIO B: 10 >=65, 10 50-64, 30 <50 -> returns 20 (10 TESTAR+, 10 OBSERVAR), none <50 entered', () => {
  const candidates = [];
  // 10 strong (TESTAR/PRIORIDADE) across distinct families & stores
  for (let i = 1; i <= 10; i++) {
    const familyName = SAMPLE_FAMILIES[i % 5];
    candidates.push(createCandidate(100 + i, {
      shopId: `strong-store-${i}`,
      productName: `${familyName} Forte Alta Demanda ${i}`,
      currentPrice: 30.0 + i,
      oldPrice: 150.0,
      sales: 15000,
      rating: 4.9,
      commissionRate: 15,
    }));
  }
  // 10 moderate (OBSERVAR / 50-64) across distinct families & stores
  for (let i = 1; i <= 10; i++) {
    const familyName = SAMPLE_FAMILIES[5 + (i % 5)];
    candidates.push(createCandidate(200 + i, {
      shopId: `mod-store-${i}`,
      productName: `${familyName} Moderado Demanda Media ${i}`,
      currentPrice: 35.0 + i,
      sales: 5000,
      rating: 4.8,
      commissionRate: 10,
    }));
  }
  // 30 weak (<50)
  for (let i = 1; i <= 30; i++) {
    candidates.push(createCandidate(300 + i, {
      shopId: `weak-store-${i}`,
      currentPrice: 200.0,
      sales: 5,
      rating: 3.5,
      commissionRate: 0,
    }));
  }

  const selected = selectRadarVNext(candidates, { maxProducts: 20 });
  assert.equal(selected.length, 20);

  const strongCount = selected.filter(r => r.score.total >= 50).length;
  assert.equal(strongCount, 20, 'All 20 selected should be from the >=50 group');

  const weakCount = selected.filter(r => r.score.total < 50).length;
  assert.equal(weakCount, 0, 'No weak candidates (<50) should enter because 20 better exist');
});

test('CENÁRIO C: 5 >=50, 25 <50 -> returns 20 (5 >=50 + 15 best <50)', () => {
  const candidates = [];
  // 5 strong (>=50) across distinct families with velocity signal
  for (let i = 1; i <= 5; i++) {
    const familyName = SAMPLE_FAMILIES[i % SAMPLE_FAMILIES.length];
    candidates.push(createCandidate(100 + i, {
      shopId: `strong-store-${i}`,
      productName: `${familyName} Forte Alta Demanda ${i}`,
      currentPrice: 30.0 + i,
      oldPrice: 100.0,
      sales: 15000,
      rating: 4.9,
      commissionRate: 15,
      sellerCommissionRate: 5,
      velocityInfo: { velocity_status: 'computed', sales_velocity: 250 },
    }));
  }
  // 25 weak (<50)
  for (let i = 1; i <= 25; i++) {
    candidates.push(createCandidate(200 + i, {
      shopId: `weak-store-${i}`,
      currentPrice: 40.0 + i,
      sales: 20,
      rating: 4.0,
      commissionRate: 2,
    }));
  }

  const selected = selectRadarVNext(candidates, { maxProducts: 20 });
  assert.equal(selected.length, 20, 'Should return exactly 20 candidates');

  const strongCount = selected.filter(r => r.score.total >= 50).length;
  assert.equal(strongCount, 5, 'Must contain all 5 strong opportunities');

  const lowConfidenceCount = selected.filter(r => r.score.total < 50).length;
  assert.equal(lowConfidenceCount, 15, 'Must fill remaining 15 spots with best available lower confidence');
});

test('CENÁRIO D: 25 candidates, 5 fail integrity gate -> only 20 valid compete', () => {
  const candidates = [];
  // 20 valid candidates
  for (let i = 1; i <= 20; i++) {
    candidates.push(createCandidate(i, { currentPrice: 30.0 + i }));
  }
  // 5 invalid candidates (missing price, invalid image, missing link)
  candidates.push(createCandidate(901, { currentPrice: null, price: 0 }));
  candidates.push(createCandidate(902, { imageUrl: 'not-a-valid-url' }));
  candidates.push(createCandidate(903, { permalink: 'http-insecure-or-invalid' }));
  candidates.push(createCandidate(904, { marketplace: 'UnknownMarketplace' }));
  candidates.push(createCandidate(905, { itemId: '' }));

  const selected = selectRadarVNext(candidates, { maxProducts: 20 });
  assert.equal(selected.length, 20, 'Only the 20 valid candidates should be selected');

  for (const row of selected) {
    assert.ok(row.score.gates.integrity.passed, 'Every selected product must pass integrity gate');
    assert.ok(Number(row.candidate.itemId) <= 20, 'Invalid items must never be selected');
  }
});

test('CENÁRIO E: 8 valid candidates -> exactly 8 selected', () => {
  const candidates = [];
  for (let i = 1; i <= 8; i++) {
    candidates.push(createCandidate(i));
  }

  const selected = selectRadarVNext(candidates, { maxProducts: 20 });
  assert.equal(selected.length, 8, 'When 8 valid candidates exist, exactly 8 must be returned');
});

test('CENÁRIO F: 0 valid candidates -> 0 selected', () => {
  const candidates = [
    createCandidate(991, { currentPrice: 0, price: 0 }), // invalid price
    createCandidate(992, { imageUrl: '' }), // missing image
  ];

  const selected = selectRadarVNext(candidates, { maxProducts: 20 });
  assert.equal(selected.length, 0, 'When 0 valid candidates exist, exactly 0 must be returned');
});

test('CENÁRIO G: Shopee error + ML 100 valid -> Top 20 ML selected, snapshot DEGRADED', async () => {
  const mlPool = [];
  for (let i = 1; i <= 100; i++) {
    const familyName = SAMPLE_FAMILIES[i % SAMPLE_FAMILIES.length];
    mlPool.push({
      marketplace: 'Mercado Livre',
      itemId: `MLB-${i}`,
      productId: `MLB-${i}`,
      shopId: `seller-${i % 20}`,
      productName: `${familyName} Mercado Livre ${i}`,
      currentPrice: 80.0 + (i % 20),
      oldPrice: 160.0,
      discountPercent: 50,
      sales: 5000,
      rating: 4.8,
      commissionPercent: 0,
      permalink: `https://mercadolivre.com.br/p/MLB-${i}`,
      imageUrl: `https://http2.mlstatic.com/item${i}.webp`,
      provenance: 'mercadolivre_offers_ssr',
      evidenceStatus: 'verified',
    });
  }

  const result = await runRadarVNext({
    run: { id: 'degraded-run-1', radar_date: '2026-08-22' },
    shopeeCollector: async () => {
      const err = new Error('Shopee 503 Service Unavailable');
      err.code = 'SHOPEE_503';
      throw err;
    },
    mlCollector: async () => mlPool,
    recencyCollector: async () => ({ recentIdentityKeys: new Set(), runCount: 0 }),
    offersCollector: async () => new Set(),
    dryRun: true,
  });

  assert.equal(result.processed, true);
  assert.equal(result.products.length, 20, 'Should select top 20 ML products');
  assert.equal(result.sourceHealth.shopee_status, 'error');
  assert.equal(result.sourceHealth.mercado_livre_status, 'success');
  assert.equal(result.sourceHealth.status, 'degraded', 'Snapshot status must be degraded when a source fails');
  assert.ok(result.sourceHealth.valid_candidate_count >= 20);
  assert.equal(result.sourceHealth.selected_count, 20);
});
