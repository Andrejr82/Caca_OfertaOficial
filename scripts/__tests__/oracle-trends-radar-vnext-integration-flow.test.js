'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  processPendingTrendRadarRuns,
  isRadarVNextOfficialEnabled,
} = require('../oracle-trends-radar-runner-final.cjs');
const {
  COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION,
} = require('../../src/core/trends/commercial-opportunity-score-vnext.cjs');
const {
  COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION,
} = require('../../src/core/trends/commercial-opportunity-score-v4.cjs');

function createMockClient() {
  const state = {
    updatedRun: null,
    insertedProducts: [],
    deletedRunId: null,
  };

  const createQueryChain = (tableName) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      gte: () => chain,
      lte: () => chain,
      gt: () => chain,
      lt: () => chain,
      in: () => chain,
      is: () => chain,
      order: () => chain,
      range: () => chain,
      limit: async () => {
        if (tableName === 'trend_radar_runs') {
          return {
            data: [
              {
                id: 'test-run-123',
                user_id: 'test-user',
                radar_date: '2026-08-22',
                status: 'building',
                source_health: { runtime: 'oracle', status: 'requested' },
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      },
      delete: () => ({
        eq: async (col, val) => {
          state.deletedRunId = val;
          return { error: null };
        },
      }),
      insert: async (products) => {
        state.insertedProducts = products;
        return { error: null };
      },
      update: (payload) => ({
        eq: async (col, val) => {
          state.updatedRun = { ...(state.updatedRun || {}), ...payload, id: val };
          return { error: null };
        },
      }),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return chain;
  };

  return {
    from: (table) => createQueryChain(table),
    _state: state,
  };
}

function createHealthyShopeePool() {
  return [
    {
      marketplace: 'Shopee',
      itemId: 'shp-1',
      shopId: 'shop-1',
      productName: 'Power Bank 20000mAh Carregador Portátil Indução',
      currentPrice: 75.0,
      oldPrice: 150.0,
      discountPercent: 50,
      sales: 15000,
      ratingStar: 4.9,
      commissionPercent: 15,
      sellerCommissionRate: 5,
      permalink: 'https://shopee.com.br/product/shop-1/shp-1',
      imageUrl: 'https://cf.shopee.com.br/file/shp1.jpg',
    },
    {
      marketplace: 'Shopee',
      itemId: 'shp-2',
      shopId: 'shop-2',
      productName: 'Carregador Portátil Powerbank 20.000 mAh Display',
      currentPrice: 85.0,
      oldPrice: 160.0,
      discountPercent: 47,
      sales: 6000,
      ratingStar: 4.8,
      commissionPercent: 12,
      permalink: 'https://shopee.com.br/product/shop-2/shp-2',
      imageUrl: 'https://cf.shopee.com.br/file/shp2.jpg',
    },
    {
      marketplace: 'Shopee',
      itemId: 'shp-3',
      shopId: 'shop-3',
      productName: 'Power Bank 20000 mAh Bateria Externa Turbo',
      currentPrice: 89.0,
      oldPrice: 170.0,
      discountPercent: 48,
      sales: 4000,
      ratingStar: 4.8,
      commissionPercent: 10,
      permalink: 'https://shopee.com.br/product/shop-3/shp-3',
      imageUrl: 'https://cf.shopee.com.br/file/shp3.jpg',
    },
    {
      marketplace: 'Shopee',
      itemId: 'shp-4',
      shopId: 'shop-4',
      productName: 'Carregador Portátil 20000mAh Ultra Rápido',
      currentPrice: 92.0,
      oldPrice: 180.0,
      discountPercent: 49,
      sales: 3500,
      ratingStar: 4.7,
      commissionPercent: 10,
      permalink: 'https://shopee.com.br/product/shop-4/shp-4',
      imageUrl: 'https://cf.shopee.com.br/file/shp4.jpg',
    },
  ];
}

function createHealthyMlPool() {
  return [
    {
      marketplace: 'Mercado Livre',
      itemId: 'MLB-1',
      productId: 'MLB-1',
      productName: 'Power Bank 20.000 mAh Carregador Portátil Homologado Anatel',
      currentPrice: 82.0,
      oldPrice: 160.0,
      discountPercent: 49,
      sales: 5000,
      rating: 4.8,
      commissionPercent: 0,
      is_best_seller: true,
      permalink: 'https://mercadolivre.com.br/p/MLB-1',
      imageUrl: 'https://http2.mlstatic.com/mlb1.webp',
    },
  ];
}

test('SCENARIO 1: Shopee + ML healthy run produces VNext snapshot and selected opportunities', async () => {
  const client = createMockClient();
  const shopeePool = createHealthyShopeePool();
  const mlPool = createHealthyMlPool();

  const result = await processPendingTrendRadarRuns({
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
    client,
    shopeeCollector: async () => shopeePool,
    mlCollector: async () => mlPool,
    recencyCollector: async () => ({ recentIdentityKeys: new Set(), runCount: 0 }),
    offersCollector: async () => new Set(),
  });

  assert.equal(result.processed, true);
  const health = client._state.updatedRun.source_health;
  const summary = client._state.updatedRun.executive_summary;

  assert.equal(health.official_strategy, COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION);
  assert.equal(health.vnext_official, true);
  assert.equal(health.shopee_status, 'success');
  assert.equal(health.mercado_livre_status, 'success');
  assert.equal(summary.strategy_version, COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION);
  assert.equal(summary.generated_by, 'oracle_radar_commercial_opportunity_vnext_engine');
  assert.ok(client._state.insertedProducts.length > 0, 'Products should be selected');
});

test('SCENARIO 2: Shopee error + ML healthy marks shopee_status=error without crashing pipeline', async () => {
  const client = createMockClient();
  const mlPool = createHealthyMlPool();

  const result = await processPendingTrendRadarRuns({
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
    client,
    shopeeCollector: async () => {
      const err = new Error('Shopee API Timeout');
      err.code = 'SHOPEE_TIMEOUT';
      throw err;
    },
    mlCollector: async () => mlPool,
    recencyCollector: async () => ({ recentIdentityKeys: new Set(), runCount: 0 }),
    offersCollector: async () => new Set(),
  });

  assert.equal(result.processed, true);
  const health = client._state.updatedRun.source_health;
  assert.equal(health.shopee_status, 'error');
  assert.equal(health.shopee_error, 'Shopee API Timeout');
  assert.equal(health.mercado_livre_status, 'success');
  assert.equal(health.official_strategy, COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION);
});

test('SCENARIO 3: Shopee empty / 0 candidates marks shopee_status=empty', async () => {
  const client = createMockClient();
  const result = await processPendingTrendRadarRuns({
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
    client,
    shopeeCollector: async () => [],
    mlCollector: async () => createHealthyMlPool(),
    recencyCollector: async () => ({ recentIdentityKeys: new Set(), runCount: 0 }),
    offersCollector: async () => new Set(),
  });

  assert.equal(result.processed, true);
  const health = client._state.updatedRun.source_health;
  assert.equal(health.shopee_status, 'empty');
  assert.equal(health.shopee_candidates_raw, 0);
});

test('SCENARIO 4: ML without observed commission scores based on demand & benchmark', async () => {
  const client = createMockClient();
  const pool = [
    ...createHealthyShopeePool(),
    {
      marketplace: 'Mercado Livre',
      itemId: 'MLB-STRONG',
      productName: 'Power Bank 20000mAh Carregador Portátil Anatel',
      currentPrice: 70.0,
      oldPrice: 150.0,
      discountPercent: 53,
      sales: 10000,
      rating: 4.9,
      commissionPercent: 0,
      is_best_seller: true,
      permalink: 'https://mercadolivre.com.br/p/MLB-STRONG',
      imageUrl: 'https://http2.mlstatic.com/strong.webp',
    }
  ];

  const result = await processPendingTrendRadarRuns({
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
    client,
    shopeeCollector: async () => pool.filter(p => p.marketplace === 'Shopee'),
    mlCollector: async () => pool.filter(p => p.marketplace === 'Mercado Livre'),
    recencyCollector: async () => ({ recentIdentityKeys: new Set(), runCount: 0 }),
    offersCollector: async () => new Set(),
  });

  assert.equal(result.processed, true);
  const mlProd = client._state.insertedProducts.find(p => p.marketplace === 'Mercado Livre');
  assert.ok(mlProd, 'Strong ML product with competitive price & best seller should be selected');
  assert.ok(mlProd.commercial_score >= 50, 'Should achieve OBSERVAR or higher without commission');
});

test('SCENARIO 5: Benchmark HIGH when 5+ peers exist', async () => {
  const client = createMockClient();
  const pool = [
    ...createHealthyShopeePool(),
    {
      marketplace: 'Shopee',
      itemId: 'shp-5',
      shopId: 'shop-5',
      productName: 'Power Bank 20000mAh Bateria Portátil Turbo',
      currentPrice: 88.0,
      sales: 3000,
      commissionPercent: 10,
    },
    {
      marketplace: 'Shopee',
      itemId: 'shp-6',
      shopId: 'shop-6',
      productName: 'Carregador Portátil Power Bank 20.000 mAh Slim',
      currentPrice: 90.0,
      sales: 2000,
      commissionPercent: 10,
    }
  ];

  const result = await processPendingTrendRadarRuns({
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
    client,
    shopeeCollector: async () => pool,
    mlCollector: async () => [],
    recencyCollector: async () => ({ recentIdentityKeys: new Set(), runCount: 0 }),
    offersCollector: async () => new Set(),
  });

  assert.equal(result.processed, true);
  const health = client._state.updatedRun.source_health;
  assert.ok(health.benchmark_confidence_counts.HIGH >= 1, 'Should record HIGH confidence benchmark');
});

test('SCENARIO 6: Isolated item without peers receives NONE confidence and no artificial price score', async () => {
  const client = createMockClient();
  const isolated = [{
    marketplace: 'Shopee',
    itemId: 'iso-1',
    shopId: 'shop-iso',
    productName: 'Produto Único Raro Exótico Sem Comparáveis',
    currentPrice: 150.0,
    sales: 10,
    commissionPercent: 5,
    permalink: 'https://shopee.com.br/product/shop-iso/iso-1',
    imageUrl: 'https://cf.shopee.com.br/file/iso.jpg',
    provenance: 'shopee_openapi_productOfferV2',
    evidenceStatus: 'verified',
  }];

  const result = await processPendingTrendRadarRuns({
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
    client,
    shopeeCollector: async () => isolated,
    mlCollector: async () => [],
    recencyCollector: async () => ({ recentIdentityKeys: new Set(), runCount: 0 }),
    offersCollector: async () => new Set(),
  });

  assert.equal(result.processed, true);
  const health = client._state.updatedRun.source_health;
  assert.equal(health.benchmark_confidence_counts.NONE, 1);
  assert.equal(client._state.insertedProducts.length, 1);
  assert.equal(client._state.insertedProducts[0].selection_decision, 'IGNORAR');
  assert.ok(client._state.insertedProducts[0].commercial_score < 50);
});

test('SCENARIO 7: Empty snapshot preserves VNext metadata and diagnostic explanation when 0 valid candidates exist', async () => {
  const client = createMockClient();
  const weak = [{
    marketplace: 'Mercado Livre',
    itemId: 'weak-1',
    productName: 'Item Sem Preco Valido',
    currentPrice: 0,
    sales: null,
    commissionPercent: 0,
  }];

  const result = await processPendingTrendRadarRuns({
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
    client,
    shopeeCollector: async () => [],
    mlCollector: async () => weak,
    recencyCollector: async () => ({ recentIdentityKeys: new Set(), runCount: 0 }),
    offersCollector: async () => new Set(),
  });

  assert.equal(result.processed, true);
  const health = client._state.updatedRun.source_health;
  const summary = client._state.updatedRun.executive_summary;

  assert.equal(health.official_strategy, COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION);
  assert.equal(health.vnext_official, true);
  assert.equal(summary.strategy_version, COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION);
  assert.equal(summary.generated_by, 'oracle_radar_commercial_opportunity_vnext_engine');
  assert.equal(client._state.insertedProducts.length, 0);
  assert.equal(health.vnext_decision_counts.IGNORAR, 1);
});

test('SCENARIO 8: Flag OFF executes V4 rollback cleanly', async () => {
  const client = createMockClient();
  const pool = createHealthyShopeePool();

  const result = await processPendingTrendRadarRuns({
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '0' },
    client,
    shopeeCollector: async () => pool,
    mlCollector: async () => [],
    recencyCollector: async () => ({ recentIdentityKeys: new Set(), runCount: 0 }),
    offersCollector: async () => new Set(),
  });

  assert.equal(result.processed, true);
  const health = client._state.updatedRun.source_health;
  const summary = client._state.updatedRun.executive_summary;

  assert.equal(health.strategy_version, COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION);
  assert.equal(summary.strategy_version, COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION);
  assert.equal(summary.generated_by, 'oracle_radar_commercial_opportunity_v4_engine');
});
