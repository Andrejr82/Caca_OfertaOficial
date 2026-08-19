'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RUNNER_CONTRACT_VERSION,
  normalizeText,
  findPendingTrendRadarRun,
  markTrendRadarRunRunning,
  collectShopeeMarketplaceCandidates,
  collectMercadoLivreMarketplaceCandidates,
  computeCandidateSalesVelocity,
  buildTrendRadarProductsFromCandidates,
  fetchRecentSnapshotItemsMap,
  persistTrendRadarSnapshot,
  processPendingTrendRadarRuns,
} = require('../oracle-trends-radar-runner.cjs');

test('findPendingTrendRadarRun identifies pending requested run for Oracle', async () => {
  const mockRuns = [
    {
      id: 'run-1',
      user_id: 'user-1',
      radar_date: '2026-08-16',
      status: 'building',
      source_health: { runtime: 'oracle', status: 'requested' },
    },
  ];

  const mockClient = {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: mockRuns, error: null }),
          }),
        }),
      }),
    }),
  };

  const pending = await findPendingTrendRadarRun(mockClient);
  assert.ok(pending);
  assert.equal(pending.id, 'run-1');
  assert.equal(pending.source_health.runtime, 'oracle');
  assert.equal(pending.source_health.status, 'requested');
});

test('collectShopeeMarketplaceCandidates uses broad official category discovery without fixed seeds authority', async () => {
  const capturedCalls = [];
  const mockCaller = async (operation, query, variables) => {
    capturedCalls.push({ operation, variables });
    return {
      status: 200,
      data: {
        data: {
          productOfferV2: {
            nodes: [
              {
                itemId: '1001',
                shopId: '2001',
                shopName: 'Loja Oficial Tech',
                productName: 'Teclado Mecânico RGB',
                productLink: 'https://shopee.com.br/product/2001/1001',
                offerLink: 'https://shope.ee/xyz1001',
                imageUrl: 'https://cf.shopee.com.br/img1001.jpg',
                priceMin: '129.90',
                priceMax: '159.90',
                ratingStar: '4.85',
                sales: '2400',
                priceDiscountRate: '18.5',
                commissionRate: '0.07',
                shopeeCommissionRate: '0.04',
                sellerCommissionRate: '0.03',
                shopType: [1, 4],
                productCatIds: [100644],
              },
            ],
            pageInfo: { page: 1, limit: 20, hasNextPage: false },
          },
        },
      },
    };
  };

  const candidates = await collectShopeeMarketplaceCandidates({
    request: mockCaller,
    categoryIds: [100644],
  });

  assert.ok(candidates.length >= 1);
  const candidate = candidates[0];
  assert.equal(candidate.marketplace, 'Shopee');
  assert.equal(candidate.itemId, '1001');
  assert.equal(candidate.shopId, '2001');
  assert.equal(candidate.productName, 'Teclado Mecânico RGB');
  assert.equal(candidate.sales, 2400);
  assert.equal(candidate.ratingStar, 4.85);
  assert.equal(candidate.currentPrice, 129.9);
  assert.equal(candidate.priceDiscountRate, 18.5);
  assert.equal(candidate.commissionRate, 7);
  assert.equal(candidate.sellerCommissionRate, 3);
  assert.deepEqual(candidate.shopType, [1, 4]);
  assert.equal(candidate.provenance, 'shopee_openapi_productOfferV2');
  assert.ok(capturedCalls.length > 0);
  // Verifies that category/broad parameters are sent without restricting to hardcoded product names
  assert.ok(capturedCalls[0].variables.productCatId !== undefined || capturedCalls[0].variables.sortType !== undefined);
});

test('computeCandidateSalesVelocity computes delta and window when previous history exists', () => {
  const candidate = {
    marketplace: 'Shopee',
    itemId: 'item-888',
    productName: 'Fone Bluetooth TWS Pro',
    sales: 1500,
    observedAt: '2026-08-16T12:00:00.000Z',
  };

  const previousMap = new Map([
    [
      'item-888',
      {
        itemId: 'item-888',
        sales: 1420,
        observedAt: '2026-08-15T12:00:00.000Z',
      },
    ],
  ]);

  const velocityInfo = computeCandidateSalesVelocity(candidate, previousMap);

  assert.equal(velocityInfo.velocity_status, 'computed');
  assert.equal(velocityInfo.sales_delta, 80);
  assert.equal(velocityInfo.sales_velocity, 80);
  assert.equal(velocityInfo.previous_sales, 1420);
  assert.equal(velocityInfo.current_sales, 1500);
  assert.ok(velocityInfo.observed_window);
  assert.equal(velocityInfo.observed_window.previous_observed_at, '2026-08-15T12:00:00.000Z');
  assert.equal(velocityInfo.observed_window.current_observed_at, '2026-08-16T12:00:00.000Z');
  assert.equal(velocityInfo.observed_window.window_hours, 24);
});

test('computeCandidateSalesVelocity handles missing history with insufficient_history and never invents growth', () => {
  const candidate = {
    marketplace: 'Shopee',
    itemId: 'item-new-999',
    productName: 'Item Recém Descoberto',
    sales: 50,
    observedAt: '2026-08-16T12:00:00.000Z',
  };

  const emptyPreviousMap = new Map();
  const velocityInfo = computeCandidateSalesVelocity(candidate, emptyPreviousMap);

  assert.equal(velocityInfo.velocity_status, 'insufficient_history');
  assert.equal(velocityInfo.sales_velocity, null);
  assert.equal(velocityInfo.sales_delta, null);
  assert.equal(velocityInfo.previous_sales, null);
  assert.equal(velocityInfo.current_sales, 50);
  assert.equal(velocityInfo.observed_window, null);
});

test('buildTrendRadarProductsFromCandidates ranks by sales_velocity first and absolute sales as fallback', () => {
  const shopeeCandidates = [
    {
      marketplace: 'Shopee',
      itemId: 'shopee-high-velocity',
      productName: 'Item de Alta Velocidade',
      currentPrice: 99.9,
      discountPercent: 20,
      sales: 600,
      ratingStar: 4.8,
      commissionPercent: 6,
      provenance: 'shopee_openapi_productOfferV2',
      observedAt: '2026-08-16T12:00:00.000Z',
    },
    {
      marketplace: 'Shopee',
      itemId: 'shopee-high-abs-sales',
      productName: 'Item Alto Volume Estável',
      currentPrice: 49.9,
      discountPercent: 10,
      sales: 5000,
      ratingStar: 4.9,
      commissionPercent: 5,
      provenance: 'shopee_openapi_productOfferV2',
      observedAt: '2026-08-16T12:00:00.000Z',
    },
  ];

  const previousMap = new Map([
    [
      'shopee-high-velocity',
      {
        itemId: 'shopee-high-velocity',
        sales: 400, // delta = +200
        observedAt: '2026-08-15T12:00:00.000Z',
      },
    ],
    [
      'shopee-high-abs-sales',
      {
        itemId: 'shopee-high-abs-sales',
        sales: 4990, // delta = +10
        observedAt: '2026-08-15T12:00:00.000Z',
      },
    ],
  ]);

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-test',
    shopeeCandidates,
    mlCandidates: [],
    previousItemsMap: previousMap,
    maxProducts: 10,
  });

  assert.equal(products.length, 2);
  // Priority 1 must be the higher scored item
  assert.equal(products[0].product_term, 'Item de Alta Velocidade');
  assert.equal(products[0].priority, 1);
  assert.equal(products[1].product_term, 'Item Alto Volume Estável');
  assert.equal(products[1].priority, 2);

  // Validate Commercial Opportunity Score V3 fields
  assert.ok(typeof products[0].commercial_score === 'number');
  assert.ok(products[0].commercial_score >= 0 && products[0].commercial_score <= 100);
  assert.ok(products[0].score_breakdown);
  assert.equal(typeof products[0].score_breakdown.marketplaceDemand, 'number');
  assert.equal(typeof products[0].score_breakdown.identityQuality, 'number');
  assert.equal(typeof products[0].score_breakdown.priceCompetitiveness, 'number');
  assert.equal(typeof products[0].score_breakdown.commissionPotential, 'number');
  assert.equal(typeof products[0].score_breakdown.visualPotential, 'number');
  assert.equal(typeof products[0].score_breakdown.internalHistory, 'number');
  assert.equal(typeof products[0].score_breakdown.reputation, 'number');

  // Breakdown sum strictly equals commercial_score
  const sumBreakdown = Object.values(products[0].score_breakdown).reduce((a, b) => a + b, 0);
  assert.equal(sumBreakdown, products[0].commercial_score);

  assert.ok(Array.isArray(products[0].determining_reasons));
  assert.ok(products[0].determining_reasons.length > 0);

  // Validate complete snapshot fields inside direct_evidence
  const evidence0 = products[0].direct_evidence[0];
  assert.equal(evidence0.provenance, 'shopee_openapi_productOfferV2');
  assert.equal(evidence0.temporal_metrics.velocity_status, 'computed');
  assert.equal(evidence0.temporal_metrics.sales_velocity, 200);
  assert.equal(evidence0.temporal_metrics.sales_delta, 200);
  assert.equal(evidence0.strategy_version, 'commercial-opportunity-v3');
  assert.ok(['PRIORIDADE', 'TESTAR', 'IGNORAR'].includes(evidence0.decision));
});

test('collectMercadoLivreMarketplaceCandidates marks insufficient_history when no temporal delta is available', () => {
  const mlCandidates = [
    {
      marketplace: 'Mercado Livre',
      itemId: 'MLB777',
      productName: 'Smart TV 55 4K',
      currentPrice: 2200,
      sales: 120,
      rating: 4.7,
      provenance: 'mercadolivre_official_intent',
      observedAt: '2026-08-16T12:00:00.000Z',
    },
  ];

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-ml',
    shopeeCandidates: [],
    mlCandidates,
    previousItemsMap: new Map(),
    maxProducts: 5,
  });

  assert.equal(products.length, 1);
  const evidence = products[0].direct_evidence[0];
  assert.equal(evidence.provenance, 'mercadolivre_official_intent');
  assert.equal(evidence.temporal_metrics.velocity_status, 'insufficient_history');
  assert.equal(evidence.temporal_metrics.sales_velocity, null);
});

test('processPendingTrendRadarRuns executes safe marketplace-first flow with 0 publish calls and real provenance', async () => {
  const mockRun = {
    id: 'run-abc',
    user_id: 'user-abc',
    radar_date: '2026-08-16',
    status: 'building',
    source_health: { runtime: 'oracle', status: 'requested' },
  };

  const insertedProducts = [];
  let updatedRun = null;

  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        const queryBuilder = {
          eq: () => queryBuilder,
          gte: () => queryBuilder,
          order: () => queryBuilder,
          limit: async () => ({ data: [mockRun], error: null }),
          then: (resolve) => resolve({ data: [], error: null }),
        };
        queryBuilder[Symbol.asyncIterator] = async function* () { yield { data: [], error: null }; };
        return {
          select: () => queryBuilder,
          update: (payload) => ({
            eq: async (col, val) => {
              updatedRun = payload;
              return { error: null };
            },
          }),
        };
      }
      if (table === 'trend_radar_products') {
        return {
          select: () => ({
            eq: () => ({
              then: (resolve) => resolve({ data: [], error: null }),
            }),
            in: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
              then: (resolve) => resolve({ data: [], error: null }),
            }),
          }),
          delete: () => ({
            eq: async () => ({ error: null }),
          }),
          insert: async (products) => {
            insertedProducts.push(...products);
            return { error: null };
          },
        };
      }
      if (table === 'offers') {
        return {
          select: () => ({
            eq: () => ({ range: async () => ({ data: [], error: null }) }),
            range: async () => ({ data: [], error: null }),
          }),
        };
      }
      return {};
    },
  };

  const mockShopeeCollector = async () => [
    {
      marketplace: 'Shopee',
      itemId: 'shopee-99',
      shopId: 'shop-1',
      productName: 'Air Fryer Digital 4L',
      currentPrice: 289.9,
      sales: 450,
      ratingStar: 4.8,
      priceDiscountRate: 20,
      commissionRate: 6,
      sellerCommissionRate: 2,
      shopType: [1],
      provenance: 'shopee_openapi_productOfferV2',
      observedAt: '2026-08-16T12:00:00.000Z',
    },
  ];

  const mockMlCollector = async () => [
    {
      marketplace: 'Mercado Livre',
      itemId: 'MLB88',
      productName: 'Fone Bluetooth Noise Cancelling',
      currentPrice: 199.9,
      sales: 300,
      rating: 4.7,
      provenance: 'mercadolivre_official_intent',
      observedAt: '2026-08-16T12:00:00.000Z',
    },
  ];

  const result = await processPendingTrendRadarRuns({
    client: mockClient,
    shopeeCollector: mockShopeeCollector,
    mlCollector: mockMlCollector,
    dryRun: false,
  });

  assert.ok(result);
  assert.equal(result.processed, true);
  assert.equal(result.runId, 'run-abc');
  assert.equal(result.publishCalls, 0);
  assert.equal(updatedRun.status, 'completed');
  assert.equal(updatedRun.source_health.google_trends_used, false);
  assert.equal(updatedRun.source_health.runtime, 'oracle');
});
