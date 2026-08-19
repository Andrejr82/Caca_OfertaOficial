'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_RECENCY_DAYS,
  getMarketplaceIdentityKey,
  filterCandidatesWithRecency,
  fetchCompletedRadarIdentityKeys,
} = require('../oracle-trends-radar-freshness.cjs');

test('getMarketplaceIdentityKey prioritizes Mercado Livre productId over itemId for catalog deduplication', () => {
  const candidateWithBoth = {
    marketplace: 'Mercado Livre',
    productId: 'MLB100200300',
    itemId: 'MLB999888777',
    productName: 'Smart TV 50 Polegadas 4K',
  };

  const key = getMarketplaceIdentityKey(candidateWithBoth);
  assert.equal(key, 'mercadolivre:catalog:mlb100200300');
});

test('getMarketplaceIdentityKey uses Mercado Livre itemId when productId is not present', () => {
  const candidateItemOnly = {
    marketplace: 'Mercado Livre',
    productId: '',
    itemId: 'MLB555444333',
    productName: 'Cadeira Gamer Ergonômica',
  };

  const key = getMarketplaceIdentityKey(candidateItemOnly);
  assert.equal(key, 'mercadolivre:item:mlb555444333');
});

test('getMarketplaceIdentityKey forms compound key for Shopee shopId + itemId', () => {
  const shopeeCandidate = {
    marketplace: 'Shopee',
    shopId: '123456',
    itemId: '789012',
    productName: 'Fone Bluetooth TWS',
  };

  const key = getMarketplaceIdentityKey(shopeeCandidate);
  assert.equal(key, 'shopee:shop:123456:item:789012');
});

test('filterCandidatesWithRecency blocks products seen within recency window but allows aged out products', () => {
  const recentBlockedKeys = new Set([
    'shopee:shop:10:item:100',
    'mercadolivre:catalog:mlb100',
  ]);

  const candidates = [
    { marketplace: 'Shopee', shopId: '10', itemId: '100', productName: 'Produto Recente Bloqueado' },
    { marketplace: 'Shopee', shopId: '10', itemId: '200', productName: 'Produto Fresco Elegível' },
    { marketplace: 'Mercado Livre', productId: 'MLB100', itemId: 'MLB999', productName: 'Catálogo ML Recente Bloqueado' },
    { marketplace: 'Mercado Livre', productId: 'MLB200', itemId: 'MLB888', productName: 'Catálogo ML Novo Elegível' },
  ];

  const result = filterCandidatesWithRecency(candidates, recentBlockedKeys);
  assert.equal(result.fresh.length, 2);
  assert.equal(result.excludedRecentHistory.length, 2);
  assert.equal(result.fresh[0].itemId, '200');
  assert.equal(result.fresh[1].productId, 'MLB200');
});

test('fetchCompletedRadarIdentityKeys respects recencyDays window and ignores older completed runs', async () => {
  const now = new Date('2026-08-19T12:00:00.000Z');
  const recentDate = new Date('2026-08-18T12:00:00.000Z').toISOString(); // 1 dia atrás (< 7 dias)
  const oldDate = new Date('2026-08-01T12:00:00.000Z').toISOString(); // 18 dias atrás (> 7 dias)

  const mockRuns = [
    { id: 'run-recent', created_at: recentDate, status: 'completed' },
    { id: 'run-old', created_at: oldDate, status: 'completed' },
  ];

  const mockProducts = [
    {
      radar_run_id: 'run-recent',
      marketplace: 'Shopee',
      direct_evidence: [{
        marketplace_identity: { shopId: '10', itemId: 'recent-1' }
      }],
    },
  ];

  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        return {
          select: () => {
            const queryObj = {
              eq: (f, v) => queryObj,
              gte: (f, v) => {
                queryObj._minDate = v;
                return queryObj;
              },
              order: async () => ({
                data: mockRuns.filter(r => !queryObj._minDate || r.created_at >= queryObj._minDate),
                error: null,
              }),
            };
            return queryObj;
          },
        };
      }
      if (table === 'trend_radar_products') {
        return {
          select: () => ({
            in: async (_field, runIds) => ({
              data: mockProducts.filter(p => runIds.includes(p.radar_run_id)),
              error: null
            })
          })
        };
      }
      return {};
    }
  };

  const result = await fetchCompletedRadarIdentityKeys(mockClient, 'user-1', {
    recencyDays: 7,
    now,
  });

  assert.equal(result.recencyDays, 7);
  assert.equal(result.runCount, 1);
  assert.ok(result.recentIdentityKeys.has('shopee:shop:10:item:recent-1'));
});
