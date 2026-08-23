'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runRadarVNext } = require('../oracle-trends-radar-vnext-pipeline.cjs');

test('FASE 11 HISTORICAL REPLAY: Full sanitized pool replay validation', async () => {
  const shopeePool = [
    {
      marketplace: 'Shopee',
      itemId: 'shp-mix-1',
      shopId: 'shop-mix-1',
      productName: 'Mini Mixer Elétrico Portátil Batedor Bebidas Café Leite',
      currentPrice: 10.5,
      oldPrice: 22.0,
      discountPercent: 52,
      sales: 22000,
      ratingStar: 4.8,
      commissionPercent: 15,
      sellerCommissionRate: 5,
      permalink: 'https://shopee.com.br/product/shop-mix-1/shp-mix-1',
      imageUrl: 'https://cf.shopee.com.br/file/mix1.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
    {
      marketplace: 'Shopee',
      itemId: 'shp-mix-2',
      shopId: 'shop-mix-2',
      productName: 'Misturador Mixer Portátil de Bebidas e Café a Pilha',
      currentPrice: 12.0,
      oldPrice: 24.0,
      discountPercent: 50,
      sales: 12000,
      ratingStar: 4.7,
      commissionPercent: 10,
      permalink: 'https://shopee.com.br/product/shop-mix-2/shp-mix-2',
      imageUrl: 'https://cf.shopee.com.br/file/mix2.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
    {
      marketplace: 'Shopee',
      itemId: 'shp-mix-3',
      shopId: 'shop-mix-3',
      productName: 'Mini Mixer Batedor Elétrico Espumador de Leite',
      currentPrice: 13.0,
      oldPrice: 25.0,
      discountPercent: 48,
      sales: 6000,
      ratingStar: 4.8,
      commissionPercent: 10,
      permalink: 'https://shopee.com.br/product/shop-mix-3/shp-mix-3',
      imageUrl: 'https://cf.shopee.com.br/file/mix3.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
    {
      marketplace: 'Shopee',
      itemId: 'shp-mix-4',
      shopId: 'shop-mix-4',
      productName: 'Mixer Misturador Elétrico Bebidas Portátil',
      currentPrice: 14.0,
      oldPrice: 25.0,
      discountPercent: 44,
      sales: 5000,
      ratingStar: 4.8,
      commissionPercent: 10,
      permalink: 'https://shopee.com.br/product/shop-mix-4/shp-mix-4',
      imageUrl: 'https://cf.shopee.com.br/file/mix4.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
  ];

  const mlPool = [
    {
      marketplace: 'Mercado Livre',
      itemId: 'MLB-PWB-1',
      productId: 'MLB-PWB-1',
      productName: 'Power Bank 20000mAh Carregador Portátil Indução Turbo',
      currentPrice: 78.0,
      oldPrice: 160.0,
      discountPercent: 51,
      sales: 8000,
      rating: 4.8,
      commissionPercent: 0,
      is_best_seller: true,
      permalink: 'https://mercadolivre.com.br/p/MLB-PWB-1',
      imageUrl: 'https://http2.mlstatic.com/pwb1.webp',
      provenance: 'mercadolivre_offers_ssr',
    },
    {
      marketplace: 'Mercado Livre',
      itemId: 'MLB-PWB-2',
      productId: 'MLB-PWB-2',
      productName: 'Carregador Portátil Power Bank 20.000 mAh Display Digital',
      currentPrice: 85.0,
      oldPrice: 170.0,
      discountPercent: 50,
      sales: 6000,
      rating: 4.8,
      commissionPercent: 0,
      permalink: 'https://mercadolivre.com.br/p/MLB-PWB-2',
      imageUrl: 'https://http2.mlstatic.com/pwb2.webp',
      provenance: 'mercadolivre_offers_ssr',
    },
    {
      marketplace: 'Mercado Livre',
      itemId: 'MLB-PWB-3',
      productId: 'MLB-PWB-3',
      productName: 'Bateria Externa Powerbank 20000 mAh Homologado Anatel',
      currentPrice: 89.0,
      oldPrice: 175.0,
      discountPercent: 49,
      sales: 4000,
      rating: 4.7,
      commissionPercent: 0,
      permalink: 'https://mercadolivre.com.br/p/MLB-PWB-3',
      imageUrl: 'https://http2.mlstatic.com/pwb3.webp',
      provenance: 'mercadolivre_offers_ssr',
    },
    {
      marketplace: 'Mercado Livre',
      itemId: 'MLB-PWB-4',
      productId: 'MLB-PWB-4',
      productName: 'Carregador Portatil Power Bank 20.000mAh Ultra Rapido',
      currentPrice: 92.0,
      oldPrice: 180.0,
      discountPercent: 48,
      sales: 3000,
      rating: 4.8,
      commissionPercent: 0,
      permalink: 'https://mercadolivre.com.br/p/MLB-PWB-4',
      imageUrl: 'https://http2.mlstatic.com/pwb4.webp',
      provenance: 'mercadolivre_offers_ssr',
    },
  ];

  const result = await runRadarVNext({
    run: { id: 'hist-replay-1', radar_date: '2026-08-22' },
    shopeeCollector: async () => shopeePool,
    mlCollector: async () => mlPool,
    recencyCollector: async () => ({ recentIdentityKeys: new Set(), runCount: 0 }),
    offersCollector: async () => new Set(),
    dryRun: true,
  });

  assert.equal(result.processed, true);
  assert.ok(result.products.length >= 3, 'Should select top opportunities from both marketplaces');

  const shopeeSelected = result.products.filter(p => p.marketplace === 'Shopee');
  const mlSelected = result.products.filter(p => p.marketplace === 'Mercado Livre');

  assert.ok(shopeeSelected.length > 0, 'Shopee products must be present');
  assert.ok(mlSelected.length > 0, 'ML products must be present');

  // Verify decisions
  for (const prod of result.products) {
    const direct = prod.direct_evidence[0];
    assert.equal(direct.strategy_version, 'commercial-opportunity-vnext/1');
    assert.ok(['PRIORIDADE', 'TESTAR', 'OBSERVAR', 'IGNORAR'].includes(direct.decision));
    assert.ok(typeof prod.commercial_score === 'number' && prod.commercial_score >= 0);
  }

  // Check health metrics
  assert.equal(result.sourceHealth.shopee_status, 'success');
  assert.equal(result.sourceHealth.mercado_livre_status, 'success');
  assert.ok(result.sourceHealth.benchmark_confidence_counts.MEDIUM >= 1);
});
