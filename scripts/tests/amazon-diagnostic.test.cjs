'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildAmazonDiagnostic, evaluateAmazonProductDiagnostics } = require('../amazon-diagnostic.cjs');

const scenario = {
  id: 'informatica_editorial',
  allowedProductTerms: ['webcam', 'notebook', 'ssd', 'scanner', 'switch'],
  blockedProductTerms: ['suporte para notebook', 'suporte para SSD'],
};

test('exposes separate initial/final score, accessory decision and queue position', () => {
  const product = {
    asin: 'B000000001',
    title: 'Suporte para notebook',
    price: 49.9,
    original_price: 79.9,
    initial_score: 8.25,
    score: 8.25,
    rank: 3,
    node_id: '1234567',
    marketplaceMetrics: { rating: 4.7, reviewCount: 42 },
  };

  const result = evaluateAmazonProductDiagnostics(product, scenario, 1);

  assert.equal(result.score_initial, 8.25);
  assert.equal(result.score_final, 8.25);
  assert.deepEqual(result.accessory_decision, {
    status: 'rejected',
    matched_terms: ['suporte para notebook'],
  });
  assert.equal(result.review_count, 42);
  assert.equal(result.final_queue_position, 1);
});

test('builds intention-level funnel diagnostics and preserves missing review evidence explicitly', () => {
  const report = buildAmazonDiagnostic({
    scenario,
    queries: [{ keyword: 'webcam para notebook', collected: 2, valid: 1, discarded: 1, status: 'ok' }],
    products: [{
      asin: 'B000000002', title: 'Webcam para notebook', price: 99, original_price: null,
      score: 6.5, rank: 1, node_id: '1234567', marketplaceMetrics: { rating: 4.8, reviewCount: null },
    }],
    raw_products: 2,
    duplicates: 1,
  });

  assert.equal(report.funnel.raw_products, 2);
  assert.equal(report.funnel.valid_products, 1);
  assert.equal(report.funnel.discarded_products, 1);
  assert.equal(report.funnel.duplicates, 1);
  assert.equal(report.products[0].review_count, null);
  assert.equal(report.products[0].review_evidence_status, 'unavailable');
  assert.equal(report.products[0].classification.status, 'classified');
  assert.equal(report.products[0].final_queue_position, 1);
});
