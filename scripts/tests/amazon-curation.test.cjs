'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { qualityGate, scoreCandidate } = require('../curation-policy.cjs');

function amazonProduct(overrides = {}) {
  return {
    marketplace: 'Amazon',
    sourceItemId: 'B08F2XQ36M',
    sourceUrl: 'https://www.amazon.com.br/dp/B08F2XQ36M',
    imageUrl: 'https://example.com/image.jpg',
    title: 'Smart TV Samsung 55 4K',
    currentPrice: 2099,
    originalPrice: null,
    deterministicScore: 8,
    category: { name: 'Televisores' },
    marketplaceMetrics: {},
    ...overrides,
  };
}

test('Amazon: Com desconto real', () => {
  const prod = amazonProduct({ originalPrice: 2500 });
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, true);
  assert.equal(gate.warnings.includes('DADOS_COMERCIAIS_INDISPONIVEIS'), false);
  const score = scoreCandidate(prod, gate);
  assert.ok(score > 0);
});

test('Amazon: Com preço anterior maior', () => {
  const prod = amazonProduct({ originalPrice: 2400 });
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, true);
  assert.equal(gate.warnings.includes('DADOS_COMERCIAIS_INDISPONIVEIS'), false);
});

test('Amazon: Prime identificado', () => {
  const prod = amazonProduct({ marketplaceMetrics: { prime: true } });
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, true);
  assert.equal(gate.warnings.includes('DADOS_COMERCIAIS_INDISPONIVEIS'), false);
});

test('Amazon: Com cupom', () => {
  const prod = amazonProduct({ marketplaceMetrics: { coupon: true } });
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, true);
});

test('Amazon: Com promoção', () => {
  const prod = amazonProduct({ marketplaceMetrics: { promotion: true, verifiedPromotion: true } });
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, true);
});

test('Amazon: Sem dados comerciais, estruturalmente válida', () => {
  const prod = amazonProduct(); // default is originalPrice=null, metrics={}
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, true);
  assert.equal(gate.warnings.includes('DADOS_COMERCIAIS_INDISPONIVEIS'), true);
});

test('Amazon: Sem dados comerciais e penalizada no score', () => {
  process.env.AMAZON_MISSING_COMMERCIAL_DATA_PENALTY = '-8';
  const prod = amazonProduct({ currentPrice: 50 }); // IMPULSE tier
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, true);
  assert.equal(gate.warnings.includes('DADOS_COMERCIAIS_INDISPONIVEIS'), true);
  const score = scoreCandidate(prod, gate);
  
  // Base score = 8 * 4 = 32. 
  // Trust score = 0.
  // Shipping = 0.
  // Penalty = -8.
  // Expected score = 24.
  assert.equal(score, 24);
});

test('Amazon: Com preço inválido', () => {
  const prod = amazonProduct({ currentPrice: -10 });
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.includes('PRECO_INVALIDO'));
});

test('Amazon: Imagem inválida', () => {
  const prod = amazonProduct({ imageUrl: 'http://example.com/image.jpg' }); // Not HTTPS
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.includes('IMAGEM_INVALIDA'));
});

test('Amazon: URL inválida', () => {
  const prod = amazonProduct({ sourceUrl: 'http://example.com' });
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.includes('LINK_INVALIDO'));
});

test('Amazon: Dados disponíveis e ausência de vantagem comprovada', () => {
  // Discount is 0 (original == current) AND no prime/coupon.
  const prod = amazonProduct({ originalPrice: 2099, currentPrice: 2099 });
  const gate = qualityGate(prod);
  // Must be rejected by AMAZON_SEM_VANTAGEM_COMPROVADA because data IS available (originalPrice != null).
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.includes('AMAZON_SEM_VANTAGEM_COMPROVADA'));
});

test('Amazon: Alto Valor sem vantagem com dados disponíveis', () => {
  const prod = amazonProduct({ originalPrice: 2099, currentPrice: 2099 }); // Tier HIGH
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.includes('ALTO_VALOR_SEM_VANTAGEM'));
});
