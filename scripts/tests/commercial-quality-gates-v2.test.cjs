'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { qualityGate, scoreCandidate, nativeCommercialSignals } = require('../curation-policy.cjs');

function product(overrides = {}) {
  return {
    marketplace: 'Mercado Livre', sourceItemId: 'fixture-1', sourceUrl: 'https://example.com/product', imageUrl: 'https://example.com/image.jpg',
    title: 'Organizador Armário Prateleira Multiuso Empilhável Cromado', currentPrice: 59.9, originalPrice: 85.57, deterministicScore: 7,
    category: { name: 'Organizadores' }, marketplaceMetrics: { sourcePosition: 3 }, rawPayload: {}, intent: 'organizador de armário', ...overrides,
  };
}

test('ML consome rating e reviews nativos do payload', () => {
  const prod = product({ rawPayload: { rating: 4.9, review_count: 84, available_quantity: 9, official_store_id: 123 } });
  const signals = nativeCommercialSignals(prod);
  assert.equal(signals.rating, 4.9);
  assert.equal(signals.reviewCount, 84);
  assert.equal(signals.availableQuantity, 9);
});

test('ML bloqueia estoque zero e avaliação ruim com amostra material', () => {
  const noStock = qualityGate(product({ rawPayload: { available_quantity: 0, rating: 4.9, review_count: 30 } }));
  assert.equal(noStock.eligible, false);
  assert.ok(noStock.reasons.includes('MERCADO_LIVRE_SEM_ESTOQUE'));
  const lowRating = qualityGate(product({ rawPayload: { available_quantity: 5, rating: 4.2, review_count: 30 } }));
  assert.equal(lowRating.eligible, false);
  assert.ok(lowRating.reasons.includes('MERCADO_LIVRE_AVALIACAO_BAIXA'));
});

test('ML sem evidência comercial perde score sem hard-fail por campo ausente', () => {
  const weak = product({ originalPrice: null, marketplaceMetrics: { sourcePosition: 18 }, rawPayload: {}, currentPrice: 40 });
  const gate = qualityGate(weak);
  assert.equal(gate.eligible, true);
  assert.ok(gate.warnings.includes('MERCADO_LIVRE_EVIDENCIA_COMERCIAL_FRACA'));
  assert.ok(scoreCandidate(weak, gate) < scoreCandidate(product(), qualityGate(product())));
});

test('Amazon usa reviews como prova social quando disponíveis', () => {
  const base = product({ marketplace: 'Amazon', title: 'Organizador de armário empilhável', intent: 'casa_cozinha_editorial', originalPrice: null,
    marketplaceMetrics: { browseNodeEvidenceUrl: 'https://www.amazon.com.br/s?k=organizador%20de%20armario' }, currentPrice: 70 });
  const withReviews = { ...base, marketplaceMetrics: { ...base.marketplaceMetrics, rating: 4.8, reviewCount: 800 } };
  assert.ok(scoreCandidate(withReviews, qualityGate(withReviews)) > scoreCandidate(base, qualityGate(base)));
});
