'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildFirstDiscoveryPlan } = require('../first-discovery-quality.cjs');
const {
  sanitizeDiscountEvidence,
  evaluateFirstDiscoveryCandidate,
} = require('../first-discovery-candidate-quality.cjs');

test('1. Amazon rejeita desconto artificial como evidência de força', () => {
  const discount = sanitizeDiscountEvidence({ current_price: 64.90, old_price: 2163.33 });
  assert.equal(discount.rejected, true);
  assert.equal(discount.validDiscountPercent, null);

  const plan = buildFirstDiscoveryPlan('beleza', 'Amazon');
  const serum = plan.intents.find((intent) => intent.term === 'sérum');
  const result = evaluateFirstDiscoveryCandidate({
    marketplace: 'Amazon',
    intent: serum,
    candidate: {
      product_name: 'Sérum Retinol 0,3% + Vitamina E Rn-0,3 com 30ml',
      current_price: 64.90,
      old_price: 2163.33,
      rating: 4.7,
      source_position: 18,
    },
  });

  assert.equal(result.eligible, true);
  assert.equal(result.strong, false);
  assert.equal(result.evidence.discountEvidenceRejected, true);
  assert.deepEqual(result.signals, ['rating_4_5_plus']);
});

test('2. Amazon preserva desconto plausível e reconhece produto com múltiplas evidências', () => {
  const plan = buildFirstDiscoveryPlan('beleza', 'Amazon');
  const machine = plan.intents.find((intent) => intent.term === 'máquina de cortar cabelo');
  const result = evaluateFirstDiscoveryCandidate({
    marketplace: 'Amazon',
    intent: machine,
    candidate: {
      product_name: 'Máquina De Cortar Cabelo Profissional Aparador Kemei Km-1995',
      current_price: 113.90,
      old_price: 157.00,
      rating: 4.5,
      source_position: 9,
    },
  });

  assert.equal(result.eligible, true);
  assert.equal(result.strong, true);
  assert.equal(result.evidence.discountEvidenceRejected, false);
  assert.ok(result.signals.includes('rating_4_5_plus'));
  assert.ok(result.signals.includes('real_discount_10_plus'));
  assert.ok(result.signals.includes('source_top_10'));
});

test('3. Mercado Livre não permite que aparador de livros seja forte em Beleza', () => {
  const plan = buildFirstDiscoveryPlan('beleza', 'Mercado Livre');
  const intent = plan.intents.find((item) => item.term === 'aparador');
  const result = evaluateFirstDiscoveryCandidate({
    marketplace: 'Mercado Livre',
    intent,
    candidate: {
      product_name: 'Aparador De Livros Árvore Preto',
      current_price: 51.26,
      old_price: 56.96,
      source_position: 2,
      shipping_free: true,
      officialStoreId: 123,
    },
  });

  assert.equal(result.eligible, false);
  assert.equal(result.strong, false);
  assert.ok(result.hardRejections.includes('intent_mismatch'));
});

test('4. Shopee usa força comercial real e comissão não conta como evidência', () => {
  const plan = buildFirstDiscoveryPlan('beleza', 'Shopee');
  const intent = plan.intents.find((item) => item.term === 'perfume');
  const result = evaluateFirstDiscoveryCandidate({
    marketplace: 'Shopee',
    intent,
    candidate: {
      product_name: 'Perfume Patriota Intenso 100ml - Eau De Parfum',
      current_price: 72.53,
      sales: 1388,
      rating: 4.9,
      commission_rate: 25,
      source_position: 16,
    },
  });

  assert.equal(result.eligible, true);
  assert.equal(result.strong, true);
  assert.deepEqual(result.signals, ['sales_300_plus', 'rating_4_7_plus']);
  assert.equal(result.commissionInfluencesStrength, false);
});

test('5. Informática rejeita peça de reposição mesmo que tenha boa posição comercial', () => {
  const plan = buildFirstDiscoveryPlan('informatica', 'Mercado Livre');
  const intent = plan.intents.find((item) => item.term === 'teclado');
  const result = evaluateFirstDiscoveryCandidate({
    marketplace: 'Mercado Livre',
    intent,
    candidate: {
      product_name: 'Teclado Para Notebook Lenovo Ideapad 100-15Iby, Com Teclado Numérico',
      current_price: 61.63,
      old_price: 64.88,
      source_position: 1,
      shipping_free: true,
      officialStoreId: 555,
    },
  });

  assert.equal(result.eligible, false);
  assert.equal(result.strong, false);
  assert.ok(result.hardRejections.includes('intent_mismatch'));
});
