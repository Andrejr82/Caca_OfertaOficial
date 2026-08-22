const test = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../oracle-trends-radar-engine.cjs');
const runnerFinal = require('../oracle-trends-radar-runner-final.cjs');
const {
  buildRadarVNextExplainability,
  COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION,
} = require('../../src/core/trends/commercial-opportunity-score-vnext.cjs');

function createCandidate(overrides = {}) {
  return {
    itemId: '101',
    shopId: '202',
    productName: 'Fone Bluetooth TWS Sem Fio Pro Mod 101',
    category: 'Audio',
    currentPrice: 20.00,
    sales: 5000,
    ratingStar: 4.8,
    marketplace: 'Shopee',
    discountPercent: 25,
    commissionRate: 8,
    commissionSource: 'observed',
    permalink: 'https://shopee.com.br/item101',
    imageUrl: 'https://img.shopee.com.br/101.jpg',
    provenance: 'shopee_openapi_productOfferV2',
    evidenceStatus: 'verified',
    ...overrides,
  };
}

test('A) Ausência Completa: buildRadarVNextExplainability({}) retorna null para todos os campos sem inventar valores', () => {
  const explain = buildRadarVNextExplainability({});

  assert.equal(explain.strategyVersion, null, 'strategyVersion não pode ser presumida');
  assert.equal(explain.total, null, 'total deve ser null');
  assert.equal(explain.decision, null, 'decision deve ser null');
  assert.equal(explain.rawDecision, null, 'rawDecision deve ser null');
  assert.equal(explain.breakdown, null, 'breakdown deve ser null');
  assert.equal(explain.benchmark, null, 'benchmark deve ser null');
  assert.equal(explain.economics.status, null, 'economics.status deve ser null');
  assert.equal(explain.economics.effectiveCommissionPercent, null, 'effectiveCommissionPercent deve ser null');
  assert.equal(explain.economics.estimatedCommissionPerSale, null, 'estimatedCommissionPerSale deve ser null');
  assert.equal(explain.marketplaceIdentity, null, 'marketplaceIdentity deve ser null');
  assert.equal(explain.commercialMetrics, null, 'commercialMetrics deve ser null');
});

test('B) Zeros Factuais: valores reais 0 são estritamente preservados e não viram null', () => {
  const productWithZeros = {
    commercial_score: 0,
    selection_decision: 'IGNORAR',
    direct_evidence: [
      {
        strategy_version: COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION,
        raw_decision: 'IGNORAR',
        benchmark: {
          peerCount: 0,
          peerConfidence: 'LOW',
          benchmarkStatus: 'unreliable',
          peerPriceMin: 0,
          peerPriceMedian: 0,
          peerPriceMax: 0,
          priceVsMedianPercent: 0,
        },
        economic_return: {
          status: 'observed',
          effectiveCommissionPercent: 0,
          estimatedCommissionPerSale: 0,
        },
      },
    ],
  };

  const explain = buildRadarVNextExplainability(productWithZeros);

  assert.equal(explain.total, 0, 'commercial_score 0 deve ser 0');
  assert.equal(explain.benchmark.peerCount, 0, 'peerCount 0 deve ser 0');
  assert.equal(explain.benchmark.peerPriceMin, 0, 'peerPriceMin 0 deve ser 0');
  assert.equal(explain.benchmark.peerPriceMedian, 0, 'peerPriceMedian 0 deve ser 0');
  assert.equal(explain.benchmark.peerPriceMax, 0, 'peerPriceMax 0 deve ser 0');
  assert.equal(explain.benchmark.priceVsMedianPercent, 0, 'priceVsMedianPercent 0 deve ser 0');
  assert.equal(explain.economics.effectiveCommissionPercent, 0, 'effectiveCommissionPercent 0 deve ser 0');
  assert.equal(explain.economics.estimatedCommissionPerSale, 0, 'estimatedCommissionPerSale 0 deve ser 0');
});

test('C) Null Factual: campos explicitamente null continuam null sem defaults inventados', () => {
  const productWithNulls = {
    commercial_score: null,
    direct_evidence: [
      {
        strategy_version: null,
        raw_decision: null,
        benchmark: {
          peerCount: null,
          peerConfidence: null,
          benchmarkStatus: null,
          peerPriceMin: null,
          peerPriceMedian: null,
          peerPriceMax: null,
          priceVsMedianPercent: null,
        },
        economic_return: {
          status: null,
          effectiveCommissionPercent: null,
          estimatedCommissionPerSale: null,
        },
      },
    ],
  };

  const explain = buildRadarVNextExplainability(productWithNulls);

  assert.equal(explain.strategyVersion, null);
  assert.equal(explain.total, null);
  assert.equal(explain.rawDecision, null);
  assert.equal(explain.benchmark.peerCount, null);
  assert.equal(explain.benchmark.peerConfidence, null);
  assert.equal(explain.benchmark.benchmarkStatus, null);
  assert.equal(explain.benchmark.peerPriceMin, null);
  assert.equal(explain.benchmark.peerPriceMedian, null);
  assert.equal(explain.benchmark.peerPriceMax, null);
  assert.equal(explain.benchmark.priceVsMedianPercent, null);
  assert.equal(explain.economics.status, null);
  assert.equal(explain.economics.effectiveCommissionPercent, null);
  assert.equal(explain.economics.estimatedCommissionPerSale, null);
});

test('D) Produto VNext Completo: preserva todos os dados factuais observados', () => {
  const pool = [
    createCandidate({ itemId: '101', currentPrice: 18.90 }),
    createCandidate({ itemId: '102', currentPrice: 24.90, sales: 1200 }),
    createCandidate({ itemId: '103', currentPrice: 22.50, sales: 1500 }),
    createCandidate({ itemId: '104', currentPrice: 26.00, sales: 800 }),
  ];

  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates: pool,
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
  });

  assert.ok(products.length > 0);
  const explain = buildRadarVNextExplainability(products[0]);

  assert.equal(explain.strategyVersion, COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION);
  assert.equal(explain.total, products[0].commercial_score);
  assert.equal(explain.decision, products[0].selection_decision);
  assert.equal(explain.rawDecision, products[0].direct_evidence[0].raw_decision);
  assert.deepEqual(explain.breakdown, products[0].score_breakdown);

  assert.equal(explain.benchmark.peerCount, 3);
  assert.equal(explain.benchmark.peerConfidence, 'MEDIUM');
  assert.equal(explain.benchmark.benchmarkStatus, 'authoritative');
  assert.equal(explain.benchmark.peerPriceMin, 22.50);
  assert.equal(explain.benchmark.peerPriceMedian, 24.90);
  assert.equal(explain.benchmark.peerPriceMax, 26.00);

  assert.equal(explain.economics.status, 'observed');
  assert.equal(explain.economics.effectiveCommissionPercent, 8);
  assert.equal(explain.economics.estimatedCommissionPerSale, 1.51);

  assert.equal(explain.marketplaceIdentity.itemId, '101');
  assert.equal(explain.marketplaceIdentity.shopId, '202');
});

test('E) Round-trip: persist payload preserva fatos idênticos na leitura de explainability', async () => {
  const pool = [
    createCandidate({ itemId: '401', currentPrice: 18.90 }),
    createCandidate({ itemId: '402', currentPrice: 24.90 }),
    createCandidate({ itemId: '403', currentPrice: 22.50 }),
    createCandidate({ itemId: '404', currentPrice: 26.00 }),
  ];

  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates: pool,
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
  });

  let insertedRows = null;
  const mockClient = {
    from: (table) => ({
      delete: () => ({ eq: async () => ({ error: null }) }),
      insert: async (rows) => {
        insertedRows = rows;
        return { error: null };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  };

  await engine.persistTrendRadarSnapshot({
    client: mockClient,
    run: { id: 'run-roundtrip-1', source_health: {} },
    products,
    dryRun: false,
  });

  const persistedProduct = insertedRows[0];
  const explain = buildRadarVNextExplainability(persistedProduct);

  assert.equal(explain.strategyVersion, COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION);
  assert.equal(explain.total, products[0].commercial_score);
  assert.equal(explain.decision, products[0].selection_decision);
  assert.equal(explain.benchmark.peerCount, 3);
  assert.equal(explain.economics.status, 'observed');
  assert.equal(explain.economics.effectiveCommissionPercent, 8);
  assert.equal(explain.economics.estimatedCommissionPerSale, 1.51);
});

test('F) Regressão V4: produto V4 lido por explainability retorna campos V4 sem inventar VNext', () => {
  const pool = [
    createCandidate({ itemId: '501', currentPrice: 120.00, sales: 5000, discountPercent: 35, commissionRate: 10 }),
  ];

  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates: pool,
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '0' },
  });

  assert.equal(products.length, 1);
  const explain = buildRadarVNextExplainability(products[0]);

  assert.equal(explain.strategyVersion, 'commercial-opportunity-v4');
  assert.equal(explain.benchmark, null, 'V4 não tem benchmark VNext');
  assert.equal(explain.economics.status, 'observed');
  assert.equal(explain.economics.effectiveCommissionPercent, 10);
});
