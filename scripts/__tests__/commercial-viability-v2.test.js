'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  COMMERCIAL_VIABILITY_STRATEGY_VERSION,
  calculateCommercialViabilityV2,
  isViableForRadar,
} = require('../commercial-viability-v2.cjs');

test('calculateCommercialViabilityV2 identifies HIGH viability on strong demand and commission', () => {
  const candidate = {
    marketplace: 'Shopee',
    itemId: 'item-100',
    shopId: 'shop-10',
    productName: 'Teclado Mecânico RGB Gamer',
    currentPrice: 150.0,
    sales: 450,
    ratingStar: 4.8,
    commissionPercent: 6.0,
    sellerCommissionRate: 2.0,
  };

  const result = calculateCommercialViabilityV2(candidate);
  assert.equal(result.classification, 'high');
  assert.equal(result.effectiveCommissionPercent, 8.0);
  assert.equal(result.estimatedCommissionPerSale, 12.0);
  assert.equal(isViableForRadar(result), true);
  assert.ok(result.reasons.length > 0);
});

test('calculateCommercialViabilityV2 identifies HIGH viability on high demand low ticket with viable commission', () => {
  const candidate = {
    marketplace: 'Shopee',
    itemId: 'item-101',
    productName: 'Suporte Celular Veicular Magnético',
    currentPrice: 22.0,
    sales: 1200,
    ratingStar: 4.7,
    commissionPercent: 10.0,
  };

  const result = calculateCommercialViabilityV2(candidate);
  assert.equal(result.classification, 'high');
  assert.equal(result.effectiveCommissionPercent, 10.0);
  assert.equal(result.estimatedCommissionPerSale, 2.2);
  assert.equal(isViableForRadar(result), true);
});

test('calculateCommercialViabilityV2 identifies MEDIUM viability on standard demand and verified pricing', () => {
  const candidate = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB100200',
    productName: 'Lixeira Inox com Pedal 5L',
    currentPrice: 49.9,
    oldPrice: 69.9,
    discountPercent: 28,
    sales: 80,
    ratingStar: 4.5,
    commissionPercent: 0,
  };

  const result = calculateCommercialViabilityV2(candidate);
  assert.equal(result.classification, 'medium');
  assert.equal(result.effectiveCommissionPercent, 0);
  assert.equal(result.estimatedCommissionPerSale, null);
  assert.equal(isViableForRadar(result), true);
});

test('calculateCommercialViabilityV2 identifies LOW viability on micro-ticket with negligible commission', () => {
  const candidate = {
    marketplace: 'Shopee',
    itemId: 'item-cheap',
    productName: 'Borracha Escolar Mini',
    currentPrice: 2.50,
    sales: 5,
    commissionPercent: 3.0, // R$ 0.075 por venda
  };

  const result = calculateCommercialViabilityV2(candidate);
  assert.equal(result.classification, 'low');
  assert.equal(isViableForRadar(result), false);
  assert.ok(result.reasons.some((r) => /micro_ticket|negligible|low_demand/i.test(r)));
});

test('calculateCommercialViabilityV2 identifies LOW viability on poor rating below 3.5', () => {
  const candidate = {
    marketplace: 'Shopee',
    itemId: 'item-bad-rating',
    productName: 'Cabo USB Tipo C Genérico',
    currentPrice: 25.0,
    sales: 40,
    ratingStar: 2.8,
    commissionPercent: 8.0,
  };

  const result = calculateCommercialViabilityV2(candidate);
  assert.equal(result.classification, 'low');
  assert.equal(isViableForRadar(result), false);
  assert.ok(result.reasons.some((r) => /poor_rating|reprovado_por_avaliacao/i.test(r)));
});

test('calculateCommercialViabilityV2 identifies INSUFFICIENT_DATA when price is missing or non-positive', () => {
  const candidate = {
    marketplace: 'Shopee',
    itemId: 'item-noprice',
    productName: 'Produto Sem Preço Válido',
    currentPrice: null,
    sales: 100,
  };

  const result = calculateCommercialViabilityV2(candidate);
  assert.equal(result.classification, 'insufficient_data');
  assert.equal(isViableForRadar(result), false);
});

test('calculateCommercialViabilityV2 uses sales_velocity ONLY when velocity_status is computed', () => {
  const candidateWithComputedVelocity = {
    marketplace: 'Shopee',
    itemId: 'item-velocity',
    productName: 'Fone Bluetooth TWS Pro',
    currentPrice: 89.9,
    sales: 300,
    ratingStar: 4.6,
    commissionPercent: 7.0,
    velocityInfo: {
      velocity_status: 'computed',
      sales_velocity: 150,
    },
  };

  const resultComputed = calculateCommercialViabilityV2(candidateWithComputedVelocity);
  assert.equal(resultComputed.diagnostic.velocity_used, true);
  assert.equal(resultComputed.diagnostic.sales_velocity, 150);

  const candidateWithUncomputedVelocity = {
    marketplace: 'Shopee',
    itemId: 'item-velocity-none',
    productName: 'Fone Bluetooth TWS Pro',
    currentPrice: 89.9,
    sales: 300,
    ratingStar: 4.6,
    commissionPercent: 7.0,
    velocityInfo: {
      velocity_status: 'insufficient_history',
      sales_velocity: null,
    },
  };

  const resultUncomputed = calculateCommercialViabilityV2(candidateWithUncomputedVelocity);
  assert.equal(resultUncomputed.diagnostic.velocity_used, false);
  assert.equal(resultUncomputed.diagnostic.sales_velocity, null);
});

test('calculateCommercialViabilityV2 never fabricates missing rating, commission or velocity', () => {
  const candidateBare = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB-bare',
    productName: 'Cadeira de Escritório Ergonômica',
    currentPrice: 350.0,
  };

  const result = calculateCommercialViabilityV2(candidateBare);
  assert.equal(result.diagnostic.rating_observed, null);
  assert.equal(result.diagnostic.commission_observed, null);
  assert.equal(result.diagnostic.sales_observed, null);
  assert.equal(result.diagnostic.sales_velocity, null);
  assert.equal(result.estimatedCommissionPerSale, null);
});
