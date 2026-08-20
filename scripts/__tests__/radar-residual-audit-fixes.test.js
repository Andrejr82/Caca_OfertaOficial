'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const runner = require('../oracle-trends-radar-runner-final.cjs');

test('Shopee preserva commissionRate total e não soma sellerCommissionRate novamente', () => {
  const commission = runner.resolveShopeeCommission({
    commissionRate: 73,
    shopeeCommissionRate: 3,
    sellerCommissionRate: 70,
  });

  assert.equal(commission.effectiveCommissionPercent, 73);
  assert.equal(commission.commissionSource, 'commissionRate_total');
});

test('Shopee usa componentes oficiais quando commissionRate total não está disponível', () => {
  const commission = runner.resolveShopeeCommission({
    commissionRate: null,
    shopeeCommissionRate: 4,
    sellerCommissionRate: 1,
  });

  assert.equal(commission.effectiveCommissionPercent, 5);
  assert.equal(commission.commissionSource, 'official_components');
});

test('Shopee rejeita comissão efetiva acima de 100%', () => {
  const commission = runner.resolveShopeeCommission({
    commissionRate: null,
    shopeeCommissionRate: 70,
    sellerCommissionRate: 40,
  });

  assert.equal(commission.effectiveCommissionPercent, null);
  assert.equal(commission.commissionSource, 'unknown');
});

test('coletor Shopee não entrega comissão duplicada ao score', async () => {
  const request = async () => ({
    data: {
      data: {
        productOfferV2: {
          nodes: [{
            itemId: 'item-1',
            shopId: 'shop-1',
            productName: 'Produto comissão total',
            priceMin: 100,
            priceMax: 100,
            ratingStar: 4.9,
            sales: 100,
            priceDiscountRate: 20,
            commissionRate: 73,
            shopeeCommissionRate: 3,
            sellerCommissionRate: 70,
            offerLink: 'https://example.com/produto',
            imageUrl: 'https://example.com/image.jpg',
            shopType: [],
          }],
          pageInfo: { hasNextPage: false },
        },
      },
    },
  });

  const candidates = await runner.collectShopeeMarketplaceCandidatesSafe({
    request,
    categoryIds: [100010],
    maxPagesPerCategory: 1,
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].commissionRate, 73);
  assert.equal(candidates[0].sellerCommissionRate, 0);
  assert.equal(candidates[0].sellerCommissionRateObserved, 70);
  assert.equal(candidates[0].shopeeCommissionRate, 3);
  assert.equal(candidates[0].commissionSource, 'commissionRate_total');
});

test('produto final expõe selection_decision no campo dedicado para persistência', () => {
  const products = runner.buildTrendRadarProductsFromCandidates({
    radarRunId: '00000000-0000-0000-0000-000000000001',
    shopeeCandidates: [{
      marketplace: 'Shopee',
      itemId: 'item-selection',
      shopId: 'shop-selection',
      productName: 'Câmera digital oferta comercial',
      currentPrice: 99,
      oldPrice: 199,
      discountPercent: 50,
      priceDiscountRate: 50,
      sales: 1500,
      ratingStar: 4.9,
      commissionRate: 15,
      sellerCommissionRate: 0,
      permalink: 'https://example.com/camera',
      imageUrl: 'https://example.com/camera.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    }],
    mlCandidates: [],
    maxProducts: 20,
  });

  assert.equal(products.length, 1);
  assert.equal(products[0].selection_decision, 'TESTAR');
  assert.equal(products[0].direct_evidence[0].selection_decision, 'TESTAR');
});
