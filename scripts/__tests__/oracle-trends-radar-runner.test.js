'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RUNNER_CONTRACT_VERSION,
  normalizeText,
  findPendingTrendRadarRun,
  markTrendRadarRunRunning,
  buildTrendRadarProductsFromCandidates,
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

test('buildTrendRadarProductsFromCandidates combines Shopee and Mercado Livre marketplace-first', () => {
  const shopeeCandidates = [
    {
      marketplace: 'Shopee',
      itemId: 'shopee-1',
      productName: 'Fone Bluetooth Sem Fio TWS',
      currentPrice: 59.9,
      oldPrice: 89.9,
      discountPercent: 33,
      sales: 500,
      rating: 4.8,
      commissionPercent: 8,
      permalink: 'https://shopee.com.br/product/1/1',
      imageUrl: 'https://cf.shopee.com.br/img1.jpg',
      category: 'Áudio',
    },
    {
      marketplace: 'Shopee',
      itemId: 'shopee-2',
      productName: 'Air Fryer Fritadeira Sem Óleo 4L',
      currentPrice: 299.9,
      oldPrice: 399.9,
      discountPercent: 25,
      sales: 1200,
      rating: 4.9,
      commissionPercent: 6,
      permalink: 'https://shopee.com.br/product/1/2',
      imageUrl: 'https://cf.shopee.com.br/img2.jpg',
      category: 'Eletroportáteis',
    },
  ];

  const mlCandidates = [
    {
      marketplace: 'Mercado Livre',
      itemId: 'MLB123',
      productName: 'Smart TV 50 Polegadas 4K UHD',
      currentPrice: 1999.0,
      oldPrice: 2499.0,
      discountPercent: 20,
      sales: 350,
      rating: 4.7,
      commissionPercent: 0,
      permalink: 'https://www.mercadolivre.com.br/p/MLB123',
      imageUrl: 'https://http2.mlstatic.com/img3.jpg',
      category: 'Eletrônicos',
    },
  ];

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-123',
    shopeeCandidates,
    mlCandidates,
    maxProducts: 20,
  });

  assert.equal(products.length, 3);
  assert.equal(products[0].priority, 1);
  assert.equal(products[0].is_focus, true);
  assert.equal(products[0].marketplace, 'Shopee');
  assert.equal(products[0].evidence_status, 'verified');
  assert.ok(products[0].direct_evidence.length > 0);
  assert.equal(products[0].direct_evidence[0].marketplace_identity.itemId, 'shopee-1');

  assert.equal(products[1].priority, 2);
  assert.equal(products[1].is_focus, true);
  assert.equal(products[1].marketplace, 'Mercado Livre');
  assert.equal(products[1].direct_evidence[0].marketplace_identity.itemId, 'MLB123');

  assert.equal(products[2].priority, 3);
  assert.equal(products[2].is_focus, true);
  assert.equal(products[2].marketplace, 'Shopee');
});

test('processPendingTrendRadarRuns executes safe marketplace-first flow with 0 publish calls', async () => {
  let productsDeleted = false;
  let productsInserted = [];
  let runUpdated = null;

  const mockRun = {
    id: 'run-abc',
    user_id: 'user-1',
    radar_date: '2026-08-16',
    status: 'building',
    source_health: { runtime: 'oracle', status: 'requested' },
  };

  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: [mockRun], error: null }),
              }),
            }),
          }),
          update: (payload) => ({
            eq: async (col, val) => {
              runUpdated = payload;
              return { error: null };
            },
          }),
        };
      }
      if (table === 'trend_radar_products') {
        return {
          delete: () => ({
            eq: async () => {
              productsDeleted = true;
              return { error: null };
            },
          }),
          insert: async (rows) => {
            productsInserted = rows;
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const mockShopeeCollector = async () => [
    {
      marketplace: 'Shopee',
      itemId: 'shopee-1',
      productName: 'Teclado Mecânico RGB Gamer',
      currentPrice: 129.9,
      sales: 300,
      rating: 4.8,
      permalink: 'https://shopee.com.br/product/1/1',
      imageUrl: 'https://cf.shopee.com.br/kb.jpg',
    },
  ];

  const mockMlCollector = async () => [
    {
      marketplace: 'Mercado Livre',
      itemId: 'mlb-1',
      productName: 'Mouse Gamer 12000 DPI',
      currentPrice: 89.9,
      sales: 450,
      rating: 4.9,
      permalink: 'https://mercadolivre.com.br/p/mlb-1',
      imageUrl: 'https://http2.mlstatic.com/mouse.jpg',
    },
  ];

  const result = await processPendingTrendRadarRuns({
    client: mockClient,
    shopeeCollector: mockShopeeCollector,
    mlCollector: mockMlCollector,
    dryRun: false,
  });

  assert.equal(result.processed, true);
  assert.equal(result.googleTrendsUsed, false);
  assert.equal(result.publishCalls, 0);
  assert.equal(result.postsWrites, 0);
  assert.equal(result.offersWrites, 0);
  assert.equal(result.productsCount, 2);
  assert.equal(productsDeleted, true);
  assert.equal(productsInserted.length, 2);
  assert.equal(runUpdated.status, 'completed');
  assert.equal(runUpdated.source_health.google_trends_used, false);
  assert.equal(runUpdated.source_health.runtime, 'oracle');
});
