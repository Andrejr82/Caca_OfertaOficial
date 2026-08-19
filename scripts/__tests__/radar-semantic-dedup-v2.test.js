'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deduplicateCatalogAndSemantic,
  applyFamilyDiversityCap,
} = require('../radar-semantic-dedup-v2.cjs');

test('deduplicateCatalogAndSemantic merges Mercado Livre products with same productId choosing the best candidate', () => {
  const candidates = [
    {
      marketplace: 'Mercado Livre',
      productId: 'MLB10001',
      itemId: 'MLB-item-1',
      productName: 'Smart TV 50 Polegadas 4K Crystal UHD',
      currentPrice: 2299.0,
      sales: 300,
      ratingStar: 4.8,
      commercialScore: 85,
    },
    {
      marketplace: 'Mercado Livre',
      productId: 'MLB10001',
      itemId: 'MLB-item-2',
      productName: 'Smart TV 50 Polegadas 4K Crystal UHD Seller B',
      currentPrice: 2499.0,
      sales: 50,
      ratingStar: 4.5,
      commercialScore: 70,
    },
  ];

  const result = deduplicateCatalogAndSemantic(candidates);
  assert.equal(result.uniqueCandidates.length, 1);
  assert.equal(result.excludedCatalogDuplicates.length, 1);
  assert.equal(result.uniqueCandidates[0].itemId, 'MLB-item-1');
  assert.equal(result.excludedCatalogDuplicates[0].itemId, 'MLB-item-2');
});

test('deduplicateCatalogAndSemantic eliminates semantically equivalent Shopee variants', () => {
  const candidates = [
    {
      marketplace: 'Shopee',
      shopId: '101',
      itemId: '201',
      productName: 'Bola Interativa Inteligente Para Gatos com LED Brinquedo Automático',
      currentPrice: 39.90,
      sales: 850,
      ratingStar: 4.9,
      commercialScore: 92,
    },
    {
      marketplace: 'Shopee',
      shopId: '102',
      itemId: '202',
      productName: 'Brinquedo Pet Bola Inteligente Interativa Gato LED Automática',
      currentPrice: 42.00,
      sales: 120,
      ratingStar: 4.6,
      commercialScore: 75,
    },
  ];

  const result = deduplicateCatalogAndSemantic(candidates);
  assert.equal(result.uniqueCandidates.length, 1);
  assert.equal(result.excludedSemanticDuplicates.length, 1);
  assert.equal(result.uniqueCandidates[0].itemId, '201');
  assert.equal(result.excludedSemanticDuplicates[0].itemId, '202');
});

test('deduplicateCatalogAndSemantic preserves genuinely different products in the same category', () => {
  const candidates = [
    {
      marketplace: 'Shopee',
      shopId: '101',
      itemId: '301',
      productName: 'Fritadeira Elétrica Air Fryer 4L Inox',
      currentPrice: 299.0,
      sales: 400,
      commercialScore: 88,
    },
    {
      marketplace: 'Shopee',
      shopId: '102',
      itemId: '302',
      productName: 'Liquidificador Turbo 1200W com Jarra de Vidro',
      currentPrice: 159.0,
      sales: 600,
      commercialScore: 86,
    },
    {
      marketplace: 'Shopee',
      shopId: '103',
      itemId: '303',
      productName: 'Cafeteira Elétrica Programável 30 Xícaras',
      currentPrice: 189.0,
      sales: 250,
      commercialScore: 80,
    },
  ];

  const result = deduplicateCatalogAndSemantic(candidates);
  assert.equal(result.uniqueCandidates.length, 3);
  assert.equal(result.excludedSemanticDuplicates.length, 0);
});

test('applyFamilyDiversityCap limits excessive concentration of a single family in Top 20', () => {
  const items = [];
  // 6 Fones TWS
  for (let i = 1; i <= 6; i++) {
    items.push({
      itemId: `tws-${i}`,
      productName: `Fone de Ouvido Bluetooth TWS Modelo ${i}`,
      marketplace: 'Shopee',
      commercialScore: 90 - i,
    });
  }
  // 3 Outros produtos distintos
  items.push({
    itemId: `mouse-1`,
    productName: `Mouse Sem Fio Ergonômico Recarregável`,
    marketplace: 'Shopee',
    commercialScore: 80,
  });
  items.push({
    itemId: `teclado-1`,
    productName: `Teclado Mecânico Compacto RGB`,
    marketplace: 'Shopee',
    commercialScore: 78,
  });

  const result = applyFamilyDiversityCap(items, { maxPerFamily: 2, targetCount: 20 });
  assert.equal(result.diversifiedProducts.length, 4); // 2 TWS + 1 Mouse + 1 Teclado
  assert.equal(result.excludedByDiversityCap.length, 4); // 4 TWS excedentes
  assert.equal(result.diversifiedProducts.filter(p => /tws/i.test(p.productName)).length, 2);
});
