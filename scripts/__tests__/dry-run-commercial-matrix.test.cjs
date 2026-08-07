'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  classifyCommercialIntent,
  scoreCommercialOffer,
  generateSafeCopy,
} = require('../dry-run-commercial-matrix.cjs');

test('classifies a practical home product and scores Shopee evidence without inventing claims', () => {
  const product = {
    title: 'Organizador de gaveta ajustável',
    price: 39.9,
    category: 'Organização',
    imageUrl: 'https://example.test/image.jpg',
    rating: 4.8,
    sales: 1200,
    discountPercent: 20,
    shopType: [1],
    affiliateUrl: 'https://example.test/offer',
  };

  assert.equal(classifyCommercialIntent(product), 'casa_organizada_antes_depois');
  const result = scoreCommercialOffer(product, 'Shopee', 'casa_organizada_antes_depois');
  assert.ok(result.score >= 60);
  assert.ok(result.reasons.some((reason) => /avaliação|vendas/i.test(reason)));
  assert.match(generateSafeCopy(product, 'Shopee', result).telegram, /Preço pode mudar a qualquer momento/);
});

test('keeps Mercado Livre copy conservative when runtime has no proof of freight, ratings, or sales', () => {
  const product = {
    title: 'Suporte para notebook em alumínio',
    price: 79.9,
    category: 'Informática',
    imageUrl: 'https://example.test/image.jpg',
    affiliateUrl: 'https://example.test/ml',
  };

  const result = scoreCommercialOffer(product, 'Mercado Livre', 'upgrade_trabalho_estudo');
  const copy = generateSafeCopy(product, 'Mercado Livre', result).whatsapp;
  assert.match(copy, /Suporte para notebook em alumínio/);
  assert.doesNotMatch(copy, /mais vendido|menor preço|loja oficial|frete grátis|cupom/i);
});

test('prioritizes audio semantics over the generic organizer keyword caixa', () => {
  assert.equal(classifyCommercialIntent({ title: 'Caixa de som Bluetooth portátil', category: 'Áudio' }), 'audio_e_gadget_visual');
});
