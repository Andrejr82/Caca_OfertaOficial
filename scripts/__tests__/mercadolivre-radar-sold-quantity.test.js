'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runMercadoLivreOfficialIntentCoverage } = require('../mercadolivre-official-intents-v5.cjs');
const {
  normalizeMercadoLivreRadarProduct,
  buildTrendRadarProductsFromCandidates,
} = require('../oracle-trends-radar-engine.cjs');
const { calculateCommercialViabilityV2 } = require('../commercial-viability-v2.cjs');

test('normalizeItems maps sold_quantity and rating when present in ML official API payload', async () => {
  const mockFetch = async (url) => {
    if (url.includes('/domain_discovery/search')) {
      return {
        ok: true,
        json: async () => [{ domain_id: 'MLB-CELLPHONES', domain_name: 'Celulares', category_id: 'MLB1055', category_name: 'Celulares e Smartphones' }],
      };
    }
    if (url.includes('/highlights/MLB/category/')) {
      return {
        ok: true,
        json: async () => ({
          content: [{ id: 'MLB11111', type: 'PRODUCT' }],
        }),
      };
    }
    if (url.includes('/products/MLB11111/items')) {
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              item_id: 'MLB99999',
              price: 1200,
              original_price: 1500,
              sold_quantity: 450,
            },
          ],
        }),
      };
    }
    if (url.includes('/products/MLB11111')) {
      return {
        ok: true,
        json: async () => ({
          id: 'MLB11111',
          name: 'Smartphone Galaxy X',
          pictures: [{ url: 'https://http2.mlstatic.com/img.jpg' }],
          permalink: 'https://www.mercadolivre.com.br/p/MLB11111',
        }),
      };
    }
    if (url.includes('/items?ids=MLB99999')) {
      return {
        ok: true,
        json: async () => [
          {
            code: 200,
            body: {
              id: 'MLB99999',
              title: 'Smartphone Galaxy X 128GB',
              price: 1200,
              original_price: 1500,
              sold_quantity: 450,
              rating: 4.8,
              thumbnail: 'https://http2.mlstatic.com/thumb.jpg',
              permalink: 'https://produto.mercadolivre.com.br/MLB99999',
            },
          },
        ],
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const result = await runMercadoLivreOfficialIntentCoverage({
    keywords: ['celular'],
    accessToken: 'mock-token',
    fetchImpl: mockFetch,
    maxPerIntent: 5,
    delayMs: 0,
  });

  assert.ok(result.products.length >= 1);
  const p = result.products[0];
  assert.equal(p.item_id, 'MLB99999');
  assert.equal(p.product_id, 'MLB11111');
  assert.equal(p.sold_quantity, 450);
  assert.equal(p.rating, 4.8);
  assert.equal(p.current_price, 1200);
});

test('ML com sold_quantity > 0 propaga vendas até normalizeMercadoLivreRadarProduct e não vira insufficient_data', () => {
  const mlRawProduct = {
    item_id: 'MLB12345678',
    product_id: 'MLB987654',
    title: 'Smart TV 50 Polegadas 4K Ultra HD',
    category_name: 'Smart TVs',
    current_price: 2199.90,
    old_price: 2899.90,
    discount_percent: 24.14,
    sold_quantity: 350,
    rating: 4.85,
    product_url: 'https://www.mercadolivre.com.br/p/MLB987654',
    image_url: 'https://http2.mlstatic.com/tv.jpg',
  };

  const normalized = normalizeMercadoLivreRadarProduct(mlRawProduct);
  assert.equal(normalized.sales, 350);
  assert.equal(normalized.rating, 4.85);

  const viability = calculateCommercialViabilityV2(normalized);
  assert.equal(viability.isViable, true);
  assert.notEqual(viability.classification, 'insufficient_data');
  assert.ok(['high', 'medium'].includes(viability.classification));
});

test('ML com sold_quantity=0 ou null sem link continua fail-closed como insufficient_data', () => {
  const mlProductNoSales = {
    item_id: 'MLB888888',
    product_id: 'MLB777777',
    title: 'Produto Sem Vendas ML',
    current_price: 199.90,
    sold_quantity: null,
    rating: null,
    product_url: '', // sem link
  };

  const normalizedNullSales = normalizeMercadoLivreRadarProduct(mlProductNoSales);
  assert.equal(normalizedNullSales.sales, null);
  const viabilityNull = calculateCommercialViabilityV2(normalizedNullSales);
  assert.equal(viabilityNull.classification, 'insufficient_data');
  assert.equal(viabilityNull.isViable, false);

  const mlProductZeroSales = {
    item_id: 'MLB888889',
    product_id: 'MLB777778',
    title: 'Produto Zero Vendas ML',
    current_price: 199.90,
    sold_quantity: 0,
    rating: null,
    product_url: '', // sem link
  };

  const normalizedZeroSales = normalizeMercadoLivreRadarProduct(mlProductZeroSales);
  assert.equal(normalizedZeroSales.sales, 0);
  const viabilityZero = calculateCommercialViabilityV2(normalizedZeroSales);
  assert.equal(viabilityZero.classification, 'insufficient_data');
  assert.equal(viabilityZero.isViable, false);
});

test('TASK 2 (ML): ML com preço + identidade + link válido sem vendas é elegível (medium)', () => {
  const mlProductValid = {
    item_id: 'MLB999991',
    product_id: 'MLB999992',
    title: 'Produto ML Elegível Sem Vendas',
    current_price: 299.90,
    sold_quantity: null,
    rating: null,
    product_url: 'https://produto.mercadolivre.com.br/MLB999991',
  };

  const normalized = normalizeMercadoLivreRadarProduct(mlProductValid);
  assert.equal(normalized.sales, null);
  assert.equal(normalized.rating, null);
  assert.equal(normalized.commissionPercent, 0);

  const viability = calculateCommercialViabilityV2(normalized);
  assert.equal(viability.classification, 'medium');
  assert.equal(viability.isViable, true);
  assert.equal(viability.effectiveCommissionPercent, 0);
  assert.equal(viability.estimatedCommissionPerSale, null);
  assert.equal(viability.diagnostic.sales_observed, null);
  assert.equal(viability.diagnostic.rating_observed, null);
});

test('campos não observados na API do Mercado Livre permanecem null sem fallback inventado', () => {
  const sparseProduct = {
    item_id: 'MLB55555',
    title: 'Produto Parcial',
    current_price: 80.00,
  };

  const normalized = normalizeMercadoLivreRadarProduct(sparseProduct);
  assert.equal(normalized.sales, null);
  assert.equal(normalized.rating, null);
  assert.equal(normalized.ratingStar, null);
  assert.equal(normalized.oldPrice, null);
  assert.equal(normalized.commissionPercent, 0);
});
