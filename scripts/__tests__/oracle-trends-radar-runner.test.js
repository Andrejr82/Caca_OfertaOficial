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

test('Coleta Shopee com paginação real busca múltiplas páginas por categoria e agrega resultados', async () => {
  const capturedCalls = [];
  const mockCaller = async (operation, query, variables) => {
    capturedCalls.push({ operation, variables });
    const p = variables.page || 1;
    return {
      status: 200,
      data: {
        data: {
          productOfferV2: {
            nodes: [
              {
                itemId: `item_p${p}_1`,
                shopId: 'shop_1',
                productName: `Produto Pag ${p}`,
                productLink: `https://shopee.com.br/product/shop_1/item_p${p}_1`,
                priceMin: '50.00',
                priceMax: '60.00',
                sales: '100',
              },
            ],
            pageInfo: { page: p, limit: 30, hasNextPage: p < 2 },
          },
        },
      },
    };
  };

  const candidates = await collectShopeeMarketplaceCandidates({
    request: mockCaller,
    categoryIds: [100010],
    maxPagesPerCategory: 2,
  });

  assert.equal(candidates.length, 2, 'Deve coletar candidatos de ambas as páginas');
  assert.equal(candidates[0].itemId, 'item_p1_1');
  assert.equal(candidates[1].itemId, 'item_p2_1');
  assert.equal(capturedCalls.length, 2, 'Deve ter feito 2 chamadas paginadas para a categoria');
  assert.equal(capturedCalls[0].variables.page, 1);
  assert.equal(capturedCalls[1].variables.page, 2);
});

test('Coleta Shopee interrompe paginação quando página vazia ou hasNextPage = false', async () => {
  const capturedCalls = [];
  const mockCaller = async (operation, query, variables) => {
    capturedCalls.push({ operation, variables });
    return {
      status: 200,
      data: {
        data: {
          productOfferV2: {
            nodes: [],
            pageInfo: { page: 1, limit: 30, hasNextPage: false },
          },
        },
      },
    };
  };

  const candidates = await collectShopeeMarketplaceCandidates({
    request: mockCaller,
    categoryIds: [100010],
    maxPagesPerCategory: 3,
  });

  assert.equal(candidates.length, 0);
  assert.equal(capturedCalls.length, 1, 'Deve interromper a paginação após página vazia');
});

test('Deduplicação de candidatos Shopee entre páginas e categorias por shopId + itemId', async () => {
  const mockCaller = async (operation, query, variables) => {
    return {
      status: 200,
      data: {
        data: {
          productOfferV2: {
            nodes: [
              {
                itemId: 'same_item_123',
                shopId: 'same_shop_456',
                productName: 'Produto Repetido',
                productLink: 'https://shopee.com.br/product/same_shop_456/same_item_123',
                priceMin: '40.00',
                priceMax: '40.00',
                sales: '50',
              },
            ],
            pageInfo: { page: variables.page, limit: 30, hasNextPage: true },
          },
        },
      },
    };
  };

  // Coleta em 2 categorias e 2 páginas por categoria (4 chamadas, mesmo produto em todas)
  const candidates = await collectShopeeMarketplaceCandidates({
    request: mockCaller,
    categoryIds: [100010, 100013],
    maxPagesPerCategory: 2,
  });

  assert.equal(candidates.length, 1, 'Deve conter apenas 1 candidato único deduplicado');
  assert.equal(candidates[0].itemId, 'same_item_123');
  assert.equal(candidates[0].shopId, 'same_shop_456');
});

test('Falha em uma categoria Shopee não aborta a coleta das demais categorias', async () => {
  const mockCaller = async (operation, query, variables) => {
    if (variables.productCatId === 999999) {
      throw new Error('Falha simulada na API Shopee para categoria com erro');
    }
    return {
      status: 200,
      data: {
        data: {
          productOfferV2: {
            nodes: [
              {
                itemId: 'item_cat_ok',
                shopId: 'shop_ok',
                productName: 'Produto Categoria Saudável',
                productLink: 'https://shopee.com.br/product/shop_ok/item_cat_ok',
                priceMin: '70.00',
                priceMax: '70.00',
                sales: '20',
              },
            ],
            pageInfo: { page: 1, limit: 30, hasNextPage: false },
          },
        },
      },
    };
  };

  const candidates = await collectShopeeMarketplaceCandidates({
    request: mockCaller,
    categoryIds: [999999, 100644],
    maxPagesPerCategory: 1,
  });

  assert.equal(candidates.length, 1, 'Deve prosseguir e coletar a categoria saudável');
  assert.equal(candidates[0].itemId, 'item_cat_ok');
});

test('Candidato Shopee válido sem vendas e sem comissão continua coletado', async () => {
  const mockCaller = async () => {
    return {
      status: 200,
      data: {
        data: {
          productOfferV2: {
            nodes: [
              {
                itemId: 'item_no_sales',
                shopId: 'shop_1',
                productName: 'Produto Sem Vendas e Sem Comissão',
                productLink: 'https://shopee.com.br/product/shop_1/item_no_sales',
                priceMin: '89.90',
                priceMax: '89.90',
                sales: null,
                ratingStar: null,
                commissionRate: null,
                sellerCommissionRate: null,
              },
            ],
            pageInfo: { page: 1, limit: 30, hasNextPage: false },
          },
        },
      },
    };
  };

  const candidates = await collectShopeeMarketplaceCandidates({
    request: mockCaller,
    categoryIds: [100010],
    maxPagesPerCategory: 1,
  });

  assert.equal(candidates.length, 1, 'Produto com preço válido e identidade deve ser coletado');
  assert.equal(candidates[0].itemId, 'item_no_sales');
  assert.equal(candidates[0].sales, 0);
  assert.equal(candidates[0].rating, null);
  assert.equal(candidates[0].commissionPercent, 0);
});

test('Campos ricos Shopee são preservados e isAMSOffer não restringe catálogo', async () => {
  const capturedVariables = [];
  const mockCaller = async (operation, query, variables) => {
    capturedVariables.push(variables);
    return {
      status: 200,
      data: {
        data: {
          productOfferV2: {
            nodes: [
              {
                itemId: 'item_rich',
                shopId: 'shop_rich',
                shopName: 'Loja Oficial Rich',
                productName: 'Fone Gamer 7.1 Pro',
                productLink: 'https://shopee.com.br/product/shop_rich/item_rich',
                offerLink: 'https://shope.ee/xyz_rich',
                imageUrl: 'https://cf.shopee.com.br/img_rich.jpg',
                priceMin: '199.90',
                priceMax: '249.90',
                priceDiscountRate: '20',
                officialOldPrice: '299.90',
                ratingStar: '4.92',
                sales: '5400',
                commissionRate: '0.08',
                shopeeCommissionRate: '0.05',
                sellerCommissionRate: '0.03',
                shopType: [1, 2],
              },
            ],
            pageInfo: { page: 1, limit: 40, hasNextPage: false },
          },
        },
      },
    };
  };

  const candidates = await collectShopeeMarketplaceCandidates({
    request: mockCaller,
    categoryIds: [100535],
    maxPagesPerCategory: 1,
  });

  assert.equal(candidates.length, 1);
  const c = candidates[0];
  assert.equal(c.itemId, 'item_rich');
  assert.equal(c.shopId, 'shop_rich');
  assert.equal(c.shopName, 'Loja Oficial Rich');
  assert.equal(c.currentPrice, 199.9);
  assert.equal(c.sales, 5400);
  assert.equal(c.ratingStar, 4.92);
  assert.equal(c.commissionPercent, 8);
  assert.equal(c.sellerCommissionRate, 3);
  assert.equal(c.permalink, 'https://shope.ee/xyz_rich');
  assert.equal(c.imageUrl, 'https://cf.shopee.com.br/img_rich.jpg');
  assert.deepEqual(c.shopType, [1, 2]);
  assert.equal(c.provenance, 'shopee_openapi_productOfferV2');
  assert.equal(capturedVariables[0].isAMSOffer, undefined, 'isAMSOffer não deve ser imposto como true por padrão');
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
      shopId: 'shop-1',
      productName: 'Item de Alta Velocidade',
      currentPrice: 150.0,
      discountPercent: 50,
      sales: 600,
      ratingStar: 4.8,
      commissionPercent: 10,
      permalink: 'https://shopee.com.br/product/1/shopee-high-velocity',
      imageUrl: 'https://cf.shopee.com.br/high-vel.jpg',
      provenance: 'shopee_openapi_productOfferV2',
      observedAt: '2026-08-16T12:00:00.000Z',
    },
    {
      marketplace: 'Shopee',
      itemId: 'shopee-high-abs-sales',
      shopId: 'shop-2',
      productName: 'Item Alto Volume Estável',
      currentPrice: 150.0,
      discountPercent: 50,
      sales: 5000,
      ratingStar: 4.9,
      commissionPercent: 10,
      permalink: 'https://shopee.com.br/product/2/shopee-high-abs-sales',
      imageUrl: 'https://cf.shopee.com.br/high-abs.jpg',
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

  // Validate Commercial Opportunity Score V4 fields
  assert.ok(typeof products[0].commercial_score === 'number');
  assert.ok(products[0].commercial_score >= 0 && products[0].commercial_score <= 100);
  assert.ok(products[0].score_breakdown);
  assert.equal(typeof products[0].score_breakdown.marketplaceDemand, 'number');
  assert.equal(typeof products[0].score_breakdown.economicReturn, 'number');
  assert.equal(typeof products[0].score_breakdown.internalConversion, 'number');
  assert.equal(typeof products[0].score_breakdown.reputation, 'number');
  assert.equal(typeof products[0].score_breakdown.offerCompetitiveness, 'number');
  assert.equal(typeof products[0].score_breakdown.identityTraceability, 'number');
  assert.equal(typeof products[0].score_breakdown.visualPotential, 'number');

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
  assert.equal(evidence0.strategy_version, 'commercial-opportunity-v4');
  assert.ok(['PRIORIDADE', 'TESTAR', 'IGNORAR'].includes(evidence0.decision));
});

test('collectMercadoLivreMarketplaceCandidates marks insufficient_history when no temporal delta is available', () => {
  const mlCandidates = [
    {
      marketplace: 'Mercado Livre',
      itemId: 'MLB777',
      productId: 'MLB777-PROD',
      productName: 'Smart TV 55 Polegadas 4K Ultra HD HDR Loja Oficial',
      currentPrice: 1200,
      discountPercent: 50,
      sales: 1500,
      ratingStar: 4.8,
      commissionPercent: 10,
      permalink: 'https://produto.mercadolivre.com.br/MLB777',
      imageUrl: 'https://http2.mlstatic.com/MLB777.jpg',
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

// ============================================================================
// TELEMETRIA DO FUNIL COMERCIAL POR MARKETPLACE
// ============================================================================

test('Run com 20 Shopee e 0 ML selecionados define marketplaces_selected contendo apenas Shopee', async () => {
  const mockRun = {
    id: 'run-shopee-only',
    user_id: 'user-t6-1',
    radar_date: '2026-08-20',
    status: 'building',
    source_health: { runtime: 'oracle', status: 'requested' },
  };

  let updatedRun = null;
  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        const qb = {
          eq: () => qb,
          gte: () => qb,
          order: () => qb,
          limit: async () => ({ data: [mockRun], error: null }),
          then: (resolve) => resolve({ data: [], error: null }),
        };
        qb[Symbol.asyncIterator] = async function* () { yield { data: [], error: null }; };
        return {
          select: () => qb,
          update: (payload) => ({
            eq: async () => {
              updatedRun = payload;
              return { error: null };
            },
          }),
        };
      }
      if (table === 'trend_radar_products') {
        return {
          select: () => ({
            eq: () => ({ then: (r) => r({ data: [], error: null }) }),
            in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }), then: (r) => r({ data: [], error: null }) }),
          }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async () => ({ error: null }),
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

  const mockShopeeCollector = async ({ page } = {}) => {
    if (page && page > 1) return [];
    const list = [];
    for (let i = 1; i <= 20; i++) {
      list.push({
        marketplace: 'Shopee',
        itemId: `shopee-item-${i}`,
        shopId: `shop-${i}`,
        productName: `Produto Categoria ${i} Modelo Exclusivo ${i}`,
        currentPrice: 150,
        oldPrice: 300,
        discountPercent: 50,
        sales: 5000,
        ratingStar: 4.9,
        commissionPercent: 15,
        permalink: `https://shopee.com.br/product/${i}/${i}`,
        imageUrl: `https://cf.shopee.com.br/img_${i}.jpg`,
        provenance: 'shopee_openapi_productOfferV2',
      });
    }
    return list;
  };

  const mockMlCollector = async () => [];

  const result = await processPendingTrendRadarRuns({
    client: mockClient,
    shopeeCollector: mockShopeeCollector,
    mlCollector: mockMlCollector,
    dryRun: false,
  });

  assert.equal(result.processed, true);
  assert.equal(result.productsCount, 20);
  assert.equal(result.shopeeProductsCount, 20);
  assert.equal(result.mercadoLivreProductsCount, 0);

  const health = updatedRun.source_health;
  assert.deepEqual(health.marketplaces_selected, ['Shopee'], 'Não pode ter Mercado Livre em marketplaces_selected quando 0 produtos ML foram selecionados');
  assert.deepEqual(health.selected_count_by_marketplace, { 'Shopee': 20, 'Mercado Livre': 0 });
  assert.equal(health.shopee_selected_count, 20);
  assert.equal(health.mercado_livre_selected_count, 0);
  assert.equal(health.shopee_products_selected, 20);
  assert.equal(health.mercado_livre_products_selected, 0);
});

test('Run com Shopee e Mercado Livre elegíveis e selecionados inclui ambos em marketplaces_selected', async () => {
  const mockRun = {
    id: 'run-mixed',
    user_id: 'user-t6-2',
    radar_date: '2026-08-20',
    status: 'building',
    source_health: { runtime: 'oracle', status: 'requested' },
  };

  let updatedRun = null;
  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        const qb = {
          eq: () => qb,
          gte: () => qb,
          order: () => qb,
          limit: async () => ({ data: [mockRun], error: null }),
          then: (resolve) => resolve({ data: [], error: null }),
        };
        qb[Symbol.asyncIterator] = async function* () { yield { data: [], error: null }; };
        return {
          select: () => qb,
          update: (payload) => ({
            eq: async () => {
              updatedRun = payload;
              return { error: null };
            },
          }),
        };
      }
      if (table === 'trend_radar_products') {
        return {
          select: () => ({
            eq: () => ({ then: (r) => r({ data: [], error: null }) }),
            in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }), then: (r) => r({ data: [], error: null }) }),
          }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async () => ({ error: null }),
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

  const mockShopeeCollector = async ({ page } = {}) => {
    if (page && page > 1) return [];
    return [
      {
        marketplace: 'Shopee',
        itemId: 'shopee-m-1',
        shopId: 'shop-m-1',
        productName: 'Teclado Mecânico RGB Shopee Modelo Pro',
        currentPrice: 180,
        oldPrice: 360,
        discountPercent: 50,
        sales: 5000,
        ratingStar: 4.9,
        commissionPercent: 15,
        permalink: 'https://shopee.com.br/product/1/1',
        imageUrl: 'https://cf.shopee.com.br/1.jpg',
        provenance: 'shopee_openapi_productOfferV2',
      },
    ];
  };

  const mockMlCollector = async ({ page } = {}) => {
    if (page && page > 1) return [];
    return [
      {
        marketplace: 'Mercado Livre',
        itemId: 'MLB-m-1',
        productId: 'MLB-m-prod-1',
        productName: 'Mouse Sem Fio Ergonômico Mercado Livre Pro',
        currentPrice: 120,
        oldPrice: 240,
        discountPercent: 50,
        sales: 3000,
        ratingStar: 4.8,
        commissionPercent: 12,
        permalink: 'https://produto.mercadolivre.com.br/MLB-m-1',
        imageUrl: 'https://http2.mlstatic.com/1.jpg',
        provenance: 'mercadolivre_official_intent',
      },
    ];
  };

  const result = await processPendingTrendRadarRuns({
    client: mockClient,
    shopeeCollector: mockShopeeCollector,
    mlCollector: mockMlCollector,
    dryRun: false,
  });

  assert.equal(result.processed, true);
  assert.equal(result.productsCount, 2);
  assert.equal(result.shopeeProductsCount, 1);
  assert.equal(result.mercadoLivreProductsCount, 1);

  const health = updatedRun.source_health;
  assert.ok(health.marketplaces_selected.includes('Shopee'));
  assert.ok(health.marketplaces_selected.includes('Mercado Livre'));
  assert.equal(health.marketplaces_selected.length, 2);
  assert.deepEqual(health.selected_count_by_marketplace, { 'Shopee': 1, 'Mercado Livre': 1 });
  assert.ok(health.marketplaces_with_eligible_products.includes('Shopee'));
  assert.ok(health.marketplaces_with_eligible_products.includes('Mercado Livre'));
});

test('Mercado Livre coletado com zero elegíveis aparece em scanned e candidates mas não em eligible ou selected', async () => {
  const mockRun = {
    id: 'run-ml-zero-eligible',
    user_id: 'user-t6-3',
    radar_date: '2026-08-20',
    status: 'building',
    source_health: { runtime: 'oracle', status: 'requested' },
  };

  let updatedRun = null;
  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        const qb = {
          eq: () => qb,
          gte: () => qb,
          order: () => qb,
          limit: async () => ({ data: [mockRun], error: null }),
          then: (resolve) => resolve({ data: [], error: null }),
        };
        qb[Symbol.asyncIterator] = async function* () { yield { data: [], error: null }; };
        return {
          select: () => qb,
          update: (payload) => ({
            eq: async () => {
              updatedRun = payload;
              return { error: null };
            },
          }),
        };
      }
      if (table === 'trend_radar_products') {
        return {
          select: () => ({
            eq: () => ({ then: (r) => r({ data: [], error: null }) }),
            in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }), then: (r) => r({ data: [], error: null }) }),
          }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async () => ({ error: null }),
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

  const mockShopeeCollector = async ({ page } = {}) => {
    if (page && page > 1) return [];
    return [
      {
        marketplace: 'Shopee',
        itemId: 'shopee-valid-1',
        shopId: 'shop-1',
        productName: 'Fone Bluetooth Top Shopee Modelo Pro',
        currentPrice: 150,
        oldPrice: 300,
        discountPercent: 50,
        sales: 5000,
        ratingStar: 4.8,
        commissionPercent: 15,
        permalink: 'https://shopee.com.br/product/1/1',
        imageUrl: 'https://cf.shopee.com.br/1.jpg',
        provenance: 'shopee_openapi_productOfferV2',
      },
    ];
  };

  // ML retorna produtos, mas todos com baixa viabilidade (rating < 3.5) ou inválidos
  const mockMlCollector = async ({ page } = {}) => {
    if (page && page > 1) return [];
    return [
      {
        marketplace: 'Mercado Livre',
        itemId: 'MLB-bad-1',
        productName: 'Produto Ruim ML',
        currentPrice: 10,
        rating: 2.0, // rating < 3.5 => low viability
        permalink: 'https://produto.mercadolivre.com.br/MLB-bad-1',
        provenance: 'mercadolivre_official_intent',
      },
      {
        marketplace: 'Mercado Livre',
        itemId: 'MLB-bad-2',
        productName: 'Produto Sem Preço ML',
        currentPrice: 0, // preço inválido
        permalink: 'https://produto.mercadolivre.com.br/MLB-bad-2',
        provenance: 'mercadolivre_official_intent',
      },
    ];
  };

  const result = await processPendingTrendRadarRuns({
    client: mockClient,
    shopeeCollector: mockShopeeCollector,
    mlCollector: mockMlCollector,
    dryRun: false,
  });

  assert.equal(result.processed, true);
  const health = updatedRun.source_health;

  assert.ok(health.marketplaces_scanned.includes('Mercado Livre'));
  assert.ok(health.marketplaces_with_candidates.includes('Mercado Livre'));
  assert.equal(health.mercado_livre_candidates_raw, 2);

  assert.equal(health.mercado_livre_eligible_count, 0);
  assert.equal(health.mercado_livre_selected_count, 0);
  assert.equal(health.marketplaces_with_eligible_products.includes('Mercado Livre'), false, 'ML com 0 elegíveis não deve estar em marketplaces_with_eligible_products');
  assert.equal(health.marketplaces_selected.includes('Mercado Livre'), false, 'ML com 0 selecionados não deve estar em marketplaces_selected');
});

test('Contadores de funil de telemetria fecham matematicamente e registram as 10 dimensões por marketplace', async () => {
  const mockRun = {
    id: 'run-funnel-check',
    user_id: 'user-t6-4',
    radar_date: '2026-08-20',
    status: 'building',
    source_health: { runtime: 'oracle', status: 'requested' },
  };

  let updatedRun = null;
  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        const qb = {
          eq: () => qb,
          gte: () => qb,
          order: () => qb,
          limit: async () => ({ data: [mockRun], error: null }),
          then: (resolve) => resolve({ data: [], error: null }),
        };
        qb[Symbol.asyncIterator] = async function* () { yield { data: [], error: null }; };
        return {
          select: () => qb,
          update: (payload) => ({
            eq: async () => {
              updatedRun = payload;
              return { error: null };
            },
          }),
        };
      }
      if (table === 'trend_radar_products') {
        return {
          select: () => ({
            eq: () => ({ then: (r) => r({ data: [], error: null }) }),
            in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }), then: (r) => r({ data: [], error: null }) }),
          }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async () => ({ error: null }),
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

  const mockShopeeCollector = async ({ page } = {}) => {
    if (page && page > 1) return [];
    return [
      // 1 Válido e elegível
      {
        marketplace: 'Shopee',
        itemId: 'shp-1',
        shopId: 'shop-1',
        productName: 'Teclado Gamer Mecânico Exclusivo Pro',
        currentPrice: 150,
        oldPrice: 300,
        discountPercent: 50,
        sales: 5000,
        ratingStar: 4.8,
        commissionPercent: 15,
        permalink: 'https://shopee.com.br/product/1/1',
        imageUrl: 'https://cf.shopee.com.br/1.jpg',
        provenance: 'shopee_openapi_productOfferV2',
      },
      // 1 Inválido (sem shopId)
      {
        marketplace: 'Shopee',
        itemId: 'shp-invalid',
        productName: 'Produto Sem ShopId',
        currentPrice: 100,
        permalink: 'https://shopee.com.br/product/0/0',
      },
    ];
  };

  const mockMlCollector = async ({ page } = {}) => {
    if (page && page > 1) return [];
    return [
      // 1 Válido e elegível
      {
        marketplace: 'Mercado Livre',
        itemId: 'ml-1',
        productId: 'ml-prod-1',
        productName: 'Monitor Gamer 144Hz UltraWide Pro',
        currentPrice: 800,
        oldPrice: 1600,
        discountPercent: 50,
        sales: 3000,
        ratingStar: 4.9,
        commissionPercent: 12,
        permalink: 'https://produto.mercadolivre.com.br/ml-1',
        imageUrl: 'https://http2.mlstatic.com/ml-1.jpg',
        provenance: 'mercadolivre_official_intent',
      },
      // 1 Inválido (sem link)
      {
        marketplace: 'Mercado Livre',
        itemId: 'ml-invalid',
        productName: 'Produto Sem Link',
        currentPrice: 200,
        permalink: '',
      },
    ];
  };

  const result = await processPendingTrendRadarRuns({
    client: mockClient,
    shopeeCollector: mockShopeeCollector,
    mlCollector: mockMlCollector,
    dryRun: false,
  });

  assert.equal(result.processed, true);
  const health = updatedRun.source_health;

  // 10 dimensões Shopee
  assert.equal(typeof health.shopee_candidates_raw, 'number');
  assert.equal(typeof health.shopee_candidates_unique, 'number');
  assert.equal(typeof health.shopee_invalid_excluded, 'number');
  assert.equal(typeof health.shopee_existing_offer_excluded, 'number');
  assert.equal(typeof health.shopee_recent_history_excluded, 'number');
  assert.equal(typeof health.shopee_semantic_duplicates_excluded, 'number');
  assert.equal(typeof health.shopee_low_viability_excluded, 'number');
  assert.equal(typeof health.shopee_commercial_decision_ignore_excluded, 'number');
  assert.equal(typeof health.shopee_eligible_count, 'number');
  assert.equal(typeof health.shopee_selected_count, 'number');

  // 10 dimensões Mercado Livre
  assert.equal(typeof health.mercado_livre_candidates_raw, 'number');
  assert.equal(typeof health.mercado_livre_candidates_unique, 'number');
  assert.equal(typeof health.mercado_livre_invalid_excluded, 'number');
  assert.equal(typeof health.mercado_livre_existing_offer_excluded, 'number');
  assert.equal(typeof health.mercado_livre_recent_history_excluded, 'number');
  assert.equal(typeof health.mercado_livre_semantic_duplicates_excluded, 'number');
  assert.equal(typeof health.mercado_livre_low_viability_excluded, 'number');
  assert.equal(typeof health.mercado_livre_commercial_decision_ignore_excluded, 'number');
  assert.equal(typeof health.mercado_livre_eligible_count, 'number');
  assert.equal(typeof health.mercado_livre_selected_count, 'number');

  // Consistência matemática
  assert.equal(health.shopee_invalid_excluded, 1);
  assert.equal(health.mercado_livre_invalid_excluded, 1);
  assert.equal(health.shopee_eligible_count, 1);
  assert.equal(health.mercado_livre_eligible_count, 1);
  assert.equal(health.total_products_selected, health.shopee_selected_count + health.mercado_livre_selected_count);
});
