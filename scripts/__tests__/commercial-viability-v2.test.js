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
    permalink: 'https://produto.mercadolivre.com.br/MLB100200',
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
    permalink: 'https://produto.mercadolivre.com.br/MLB-bare',
  };

  const result = calculateCommercialViabilityV2(candidateBare);
  assert.equal(result.diagnostic.rating_observed, null);
  assert.equal(result.diagnostic.commission_observed, null);
  assert.equal(result.diagnostic.sales_observed, null);
  assert.equal(result.diagnostic.sales_velocity, null);
  assert.equal(result.estimatedCommissionPerSale, null);
});

test('calculateCommercialViabilityV2 retorna insufficient_data para Shopee com preço válido mas sem demanda, comissão ou velocity observadas', () => {
  // Shopee sem vendas, comissão ou velocidade continua fail-closed
  const candidateShopeeNoEvidence = {
    marketplace: 'Shopee',
    itemId: 'shopee-no-evidence',
    productName: 'Organizador Plástico Multiuso',
    currentPrice: 89.9,
    permalink: 'https://shopee.com.br/product/1/shopee-no-evidence',
  };

  const result = calculateCommercialViabilityV2(candidateShopeeNoEvidence);
  assert.equal(result.classification, 'insufficient_data');
  assert.equal(result.isViable, false);
  assert.equal(isViableForRadar(result), false);
  assert.ok(
    result.reasons.some((r) => /evidência|demanda|comissão|velocidade/i.test(r)),
    'Razão deve mencionar ausência de evidência'
  );
});

test('TASK 2 (ML): Mercado Livre com preço + identidade + link válido é elegível (medium) sem vendas/comissão/rating', () => {
  const candidateMl = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB123456789',
    productName: 'Cadeira de Escritório Ergonômica',
    currentPrice: 350.0,
    permalink: 'https://produto.mercadolivre.com.br/MLB123456789',
  };

  const result = calculateCommercialViabilityV2(candidateMl);
  assert.equal(result.classification, 'medium', 'ML com preço, itemId e link deve ser medium (elegível)');
  assert.equal(result.isViable, true);
  assert.equal(isViableForRadar(result), true);
  assert.equal(result.effectiveCommissionPercent, 0, 'Comissão não observada permanece 0%');
  assert.equal(result.estimatedCommissionPerSale, null, 'Comissão estimada permanece null');
  assert.equal(result.diagnostic.sales_observed, null, 'Vendas ausentes permanecem null');
  assert.equal(result.diagnostic.rating_observed, null, 'Rating ausente permanece null');
  assert.equal(result.diagnostic.commission_observed, null);
  assert.equal(result.diagnostic.sales_velocity, null);
  assert.equal(result.diagnostic.velocity_used, false);
});

test('TASK 2 (ML): Mercado Livre com productId e link válido (sem itemId) também é elegível', () => {
  const candidateMlProduct = {
    marketplace: 'Mercado Livre',
    productId: 'MLB987654',
    productName: 'Notebook Gamer RTX 4060',
    currentPrice: 4500.0,
    permalink: 'https://www.mercadolivre.com.br/p/MLB987654',
  };

  const result = calculateCommercialViabilityV2(candidateMlProduct);
  assert.equal(result.classification, 'medium');
  assert.equal(result.isViable, true);
  assert.equal(isViableForRadar(result), true);
});

test('TASK 2 (ML): Mercado Livre com preço inválido continua bloqueado', () => {
  const candidateZero = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB123',
    currentPrice: 0,
    permalink: 'https://produto.mercadolivre.com.br/MLB123',
  };
  const resultZero = calculateCommercialViabilityV2(candidateZero);
  assert.equal(resultZero.classification, 'insufficient_data');
  assert.equal(resultZero.isViable, false);

  const candidateNull = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB123',
    currentPrice: null,
    permalink: 'https://produto.mercadolivre.com.br/MLB123',
  };
  const resultNull = calculateCommercialViabilityV2(candidateNull);
  assert.equal(resultNull.classification, 'insufficient_data');
  assert.equal(resultNull.isViable, false);

  const candidateNegative = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB123',
    currentPrice: -10,
    permalink: 'https://produto.mercadolivre.com.br/MLB123',
  };
  const resultNeg = calculateCommercialViabilityV2(candidateNegative);
  assert.equal(resultNeg.classification, 'insufficient_data');
  assert.equal(resultNeg.isViable, false);
});

test('TASK 2 (ML): Mercado Livre sem identidade válida (sem itemId e sem productId) continua bloqueado', () => {
  const candidateNoId = {
    marketplace: 'Mercado Livre',
    productName: 'Produto Sem Identidade',
    currentPrice: 100.0,
    permalink: 'https://produto.mercadolivre.com.br/item',
  };

  const result = calculateCommercialViabilityV2(candidateNoId);
  assert.equal(result.classification, 'insufficient_data');
  assert.equal(result.isViable, false);
  assert.ok(result.reasons.some((r) => /identidade/i.test(r)));
});

test('TASK 2 (ML): Mercado Livre com link ausente ou inválido continua bloqueado', () => {
  const candidateNoLink = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB123',
    productName: 'Produto Sem Link',
    currentPrice: 100.0,
    permalink: '',
  };
  const resultNoLink = calculateCommercialViabilityV2(candidateNoLink);
  assert.equal(resultNoLink.classification, 'insufficient_data');
  assert.equal(resultNoLink.isViable, false);

  const candidateInvalidLink = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB123',
    productName: 'Produto Link Inválido',
    currentPrice: 100.0,
    permalink: 'not-a-valid-http-url',
  };
  const resultInvalidLink = calculateCommercialViabilityV2(candidateInvalidLink);
  assert.equal(resultInvalidLink.classification, 'insufficient_data');
  assert.equal(resultInvalidLink.isViable, false);
});

test('TASK 2 (Shopee): Shopee não regride e continua funcionando normalmente', () => {
  const shopeeHigh = {
    marketplace: 'Shopee',
    itemId: 'shopee-high',
    currentPrice: 150.0,
    sales: 500,
    ratingStar: 4.9,
    commissionPercent: 10.0,
    permalink: 'https://shopee.com.br/product/1/shopee-high',
  };
  const resHigh = calculateCommercialViabilityV2(shopeeHigh);
  assert.equal(resHigh.classification, 'high');
  assert.equal(resHigh.isViable, true);

  const shopeeLowRating = {
    marketplace: 'Shopee',
    itemId: 'shopee-low-rating',
    currentPrice: 150.0,
    sales: 500,
    ratingStar: 2.5,
    commissionPercent: 10.0,
    permalink: 'https://shopee.com.br/product/1/shopee-low-rating',
  };
  const resLow = calculateCommercialViabilityV2(shopeeLowRating);
  assert.equal(resLow.classification, 'low');
  assert.equal(resLow.isViable, false);
});

