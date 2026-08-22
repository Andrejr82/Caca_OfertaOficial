'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  processPendingTrendRadarRuns,
  isRadarVNextOfficialEnabled,
} = require('../oracle-trends-radar-runner-final.cjs');
const engine = require('../oracle-trends-radar-engine.cjs');
const {
  COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION,
} = require('../../src/core/trends/commercial-opportunity-score-vnext.cjs');
const {
  COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION,
} = require('../../src/core/trends/commercial-opportunity-score-v4.cjs');

function createMockCandidatePool() {
  return {
    shopeeCandidates: [
      {
        marketplace: 'Shopee',
        itemId: 'shp-101',
        shopId: 'shop-1',
        productName: 'Jogo de Lençol 400 fios toque Suave Casal 03 Peças',
        currentPrice: 13.0,
        oldPrice: 30.0,
        discountPercent: 50,
        sales: 12000,
        ratingStar: 4.9,
        rating: 4.9,
        commissionRate: 15,
        commissionPercent: 15,
        sellerCommissionRate: 5,
        permalink: 'https://shopee.com.br/product/shop-1/shp-101',
        imageUrl: 'https://cf.shopee.com.br/file/shp101.jpg',
        provenance: 'shopee_openapi_productOfferV2',
      },
      {
        marketplace: 'Shopee',
        itemId: 'shp-101-peer1',
        shopId: 'shop-3',
        productName: 'Jogo de Lençol 400 fios Micropercal Casal 3 Peças',
        currentPrice: 16.0,
        oldPrice: 30.0,
        discountPercent: 46,
        sales: 3000,
        ratingStar: 4.7,
        rating: 4.7,
        commissionRate: 10,
        commissionPercent: 10,
        permalink: 'https://shopee.com.br/product/shop-3/shp-101-peer1',
        imageUrl: 'https://cf.shopee.com.br/file/shp101peer1.jpg',
        provenance: 'shopee_openapi_productOfferV2',
      },
      {
        marketplace: 'Shopee',
        itemId: 'shp-101-peer2',
        shopId: 'shop-4',
        productName: 'Jogo de Lençol 400 fios Conforto Casal 3 Peças',
        currentPrice: 18.0,
        oldPrice: 32.0,
        discountPercent: 43,
        sales: 2500,
        ratingStar: 4.8,
        rating: 4.8,
        commissionRate: 10,
        commissionPercent: 10,
        permalink: 'https://shopee.com.br/product/shop-4/shp-101-peer2',
        imageUrl: 'https://cf.shopee.com.br/file/shp101peer2.jpg',
        provenance: 'shopee_openapi_productOfferV2',
      },
      {
        marketplace: 'Shopee',
        itemId: 'shp-101-peer3',
        shopId: 'shop-5',
        productName: 'Jogo de Lençol 400 fios Percal Casal 3 Peças',
        currentPrice: 19.0,
        oldPrice: 35.0,
        discountPercent: 45,
        sales: 4000,
        ratingStar: 4.9,
        rating: 4.9,
        commissionRate: 10,
        commissionPercent: 10,
        permalink: 'https://shopee.com.br/product/shop-5/shp-101-peer3',
        imageUrl: 'https://cf.shopee.com.br/file/shp101peer3.jpg',
        provenance: 'shopee_openapi_productOfferV2',
      },
      {
        marketplace: 'Shopee',
        itemId: 'shp-102',
        shopId: 'shop-2',
        productName: 'Mini Mixer Elétrico Portátil Batedor de Ovos e Leite',
        currentPrice: 12.0,
        oldPrice: 20.0,
        discountPercent: 40,
        sales: 1500,
        ratingStar: 4.5,
        rating: 4.5,
        commissionRate: 8,
        commissionPercent: 8,
        sellerCommissionRate: 0,
        permalink: 'https://shopee.com.br/product/shop-2/shp-102',
        imageUrl: 'https://cf.shopee.com.br/file/shp102.jpg',
        provenance: 'shopee_openapi_productOfferV2',
      },
    ],
    mlCandidates: [
      {
        marketplace: 'Mercado Livre',
        itemId: 'MLB9001',
        productId: 'MLB9001',
        productName: 'Compressor Portátil Digital Automotivo Multifuncional',
        currentPrice: 65.0,
        oldPrice: 150.0,
        discountPercent: 56,
        sales: null,
        ratingStar: null,
        rating: null,
        commissionPercent: 0,
        permalink: 'https://www.mercadolivre.com.br/p/MLB9001',
        imageUrl: 'https://http2.mlstatic.com/mlb9001.webp',
        provenance: 'mercadolivre_offers_ssr',
      },
      {
        marketplace: 'Mercado Livre',
        itemId: 'MLB9002',
        productId: 'MLB9002',
        productName: 'Produto Fraco Desconhecido Sem Demanda',
        currentPrice: 200.0,
        oldPrice: 200.0,
        discountPercent: 0,
        sales: null,
        ratingStar: 1.0,
        rating: 1.0,
        commissionPercent: 0,
        permalink: 'https://www.mercadolivre.com.br/p/MLB9002',
        imageUrl: 'https://http2.mlstatic.com/mlb9002.webp',
        provenance: 'mercadolivre_offers_ssr',
      },
    ],
  };
}

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

  const client = {
    from: (table) => createQueryChain(table),
    _state: state,
  };

  return client;
}

test('INTEGRATION TEST 1: Full flow with TRENDS_RADAR_VNEXT_OFFICIAL=1 produces VNext snapshot and metadata', async () => {
  const client = createMockClient();
  const pool = createMockCandidatePool();

  const result = await processPendingTrendRadarRuns({
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1', TRENDS_RADAR_DEDICATED_RUNTIME: '1' },
    dedicatedRuntime: true,
    client,
    shopeeCollector: async () => pool.shopeeCandidates,
    mlCollector: async () => pool.mlCandidates,
    recencyCollector: async () => ({ recentIdentityKeys: new Set(), runCount: 0 }),
    offersCollector: async () => new Set(),
    historyCollector: async () => ({ recentIdentityKeys: new Set(), runCount: 0 }),
  });

  assert.equal(result.processed, true, 'Run should be processed');
  
  const updatedRun = client._state.updatedRun;
  assert.ok(updatedRun, 'Run should be updated in database');
  
  const health = updatedRun.source_health || {};
  const summary = updatedRun.executive_summary || {};

  // 1. Check strategy metadata
  assert.equal(health.official_strategy, COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION, 'official_strategy should be VNext');
  assert.equal(health.vnext_official, true, 'vnext_official flag should be true');
  assert.equal(health.strategy_version, COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION, 'strategy_version should be VNext');
  assert.equal(summary.strategy_version, COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION, 'summary strategy_version should be VNext');
  assert.equal(summary.generated_by, 'oracle_radar_commercial_opportunity_vnext_engine', 'generated_by should be VNext engine');
  assert.equal(health.viability_version, null, 'viability_version should be null in VNext');

  // 2. Check VNext diagnostics
  assert.ok(health.vnext_decision_counts, 'vnext_decision_counts must be present');
  assert.ok(health.benchmark_confidence_counts, 'benchmark_confidence_counts must be present');
  assert.ok(health.candidate_pool_count >= 4, 'candidate_pool_count must be recorded');
  console.log('DEBUG TEST 1 HEALTH:', JSON.stringify(health, null, 2));
  assert.ok(health.vnext_scored_count >= 4, 'vnext_scored_count must be recorded');

  // 3. Products should be VNext materialized
  assert.ok(client._state.insertedProducts.length > 0, 'Should have selected valid VNext products');
  const firstProd = client._state.insertedProducts[0];
  assert.equal(firstProd.direct_evidence[0].strategy_version, COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION);
  assert.ok(['PRIORIDADE', 'TESTAR', 'OBSERVAR'].includes(firstProd.direct_evidence[0].decision));
});

test('INTEGRATION TEST 2: Empty candidate selection under VNext Official preserves VNext metadata and diagnostic breakdown', async () => {
  const client = createMockClient();

  // Weak candidates only -> all IGNORAR (<50)
  const weakPool = [
    {
      marketplace: 'Mercado Livre',
      itemId: 'MLB-WEAK-1',
      productName: 'Produto Sem Demanda e Sem Avaliação',
      currentPrice: 50.0,
      oldPrice: 50.0,
      discountPercent: 0,
      sales: null,
      ratingStar: null,
      rating: null,
      commissionPercent: 0,
      permalink: 'https://www.mercadolivre.com.br/p/MLB-WEAK-1',
      imageUrl: 'https://http2.mlstatic.com/weak1.webp',
      provenance: 'mercadolivre_offers_ssr',
    },
  ];

  const result = await processPendingTrendRadarRuns({
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1', TRENDS_RADAR_DEDICATED_RUNTIME: '1' },
    dedicatedRuntime: true,
    client,
    shopeeCollector: async () => [],
    mlCollector: async () => weakPool,
    recencyCollector: async () => ({ recentIdentityKeys: new Set(), runCount: 0 }),
    offersCollector: async () => new Set(),
  });

  assert.equal(result.processed, true);
  assert.equal(client._state.insertedProducts.length, 0, 'No products should be inserted');

  const updatedRun = client._state.updatedRun;
  const health = updatedRun.source_health || {};
  const summary = updatedRun.executive_summary || {};

  assert.equal(health.official_strategy, COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION, 'Empty run must still have VNext official_strategy');
  assert.equal(health.vnext_official, true, 'Empty run must still have vnext_official = true');
  assert.equal(health.strategy_version, COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION, 'Empty run must NOT fall back to V4 strategy_version');
  assert.equal(summary.strategy_version, COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION, 'Empty run summary must NOT fall back to V4');
  assert.equal(summary.generated_by, 'oracle_radar_commercial_opportunity_vnext_engine', 'Empty run generated_by must be VNext');
  assert.equal(health.vnext_decision_counts?.IGNORAR, 1, 'vnext_decision_counts should explain why 0 were selected');
});

test('INTEGRATION TEST 3: Flag OFF preserves legacy V4 strategy and viability metadata', async () => {
  const client = createMockClient();
  const pool = createMockCandidatePool();

  const result = await processPendingTrendRadarRuns({
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '0', TRENDS_RADAR_DEDICATED_RUNTIME: '1' },
    dedicatedRuntime: true,
    client,
    shopeeCollector: async () => pool.shopeeCandidates,
    mlCollector: async () => pool.mlCandidates,
    recencyCollector: async () => ({ recentIdentityKeys: new Set(), runCount: 0 }),
    offersCollector: async () => new Set(),
  });

  assert.equal(result.processed, true);
  const updatedRun = client._state.updatedRun;
  const health = updatedRun.source_health || {};
  const summary = updatedRun.executive_summary || {};

  assert.equal(health.strategy_version, COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION, 'Flag OFF should use V4');
  assert.equal(summary.strategy_version, COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION, 'Flag OFF summary should be V4');
  assert.equal(summary.generated_by, 'oracle_radar_commercial_opportunity_v4_engine', 'Flag OFF generated_by should be V4 engine');
});
