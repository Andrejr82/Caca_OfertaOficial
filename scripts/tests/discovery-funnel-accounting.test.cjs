'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildDiscoveryLossMatrix, createDiscoveryFunnel } = require('../discovery-funnel-contract.cjs');
const { buildShopeeDimensionTelemetry } = require('../shopee-openapi-shadow-engine-v1.cjs');

test('fecha 100% da contabilidade de um fixture com perdas conhecidas', () => {
  const matrix = buildDiscoveryLossMatrix({
    counters: {
      extracted: 100,
      afterParse: 90,
      afterRelevance: 80,
      afterIdentityDedup: 75,
      afterQualityGate: 70,
      afterNovelty: 60,
      afterClassification: 50,
      queueSelected: 40,
      rpcSent: 40,
      inserted: 25,
      updated: 10,
      ignored: 3,
      failed: 2,
    },
    rejectionReasons: {
      parse_error: 10,
      irrelevant: 10,
      duplicate: 5,
      quality: 5,
      known: 10,
      unclassified: 10,
      queue_rejected: 10,
      rpc_ignored: 3,
      rpc_failed: 2,
    },
  });

  assert.equal(matrix.closed, true);
  assert.deepEqual(matrix.transitions.map((item) => item.dropped), [10, 10, 5, 5, 10, 10, 10, 0]);
  assert.deepEqual(matrix.terminal, { input: 40, accounted: 40, balanced: true });
  assert.equal(matrix.unaccounted, 0);
});

test('sinaliza saldo não contabilizado em vez de ocultar perda', () => {
  const matrix = buildDiscoveryLossMatrix({ counters: { extracted: 10, afterParse: 8 }, rejectionReasons: { parse_error: 1 } });
  assert.equal(matrix.closed, false);
  assert.equal(matrix.unaccounted, 1);
});

test('expõe a matriz fechada no snapshot do contrato existente', () => {
  const funnel = createDiscoveryFunnel({ marketplace: 'Amazon', scenario: 'informatica_editorial' });
  funnel.count('extracted', 2).count('afterParse', 1).count('afterRelevance', 1)
    .count('afterIdentityDedup', 1).count('afterQualityGate', 1).count('afterNovelty', 1)
    .count('afterClassification', 1).count('queueSelected', 1).count('rpcSent', 1)
    .count('inserted', 1).reject('parse_error', 1);
  const snapshot = funnel.snapshot();
  assert.equal(snapshot.lossMatrix.closed, true);
  assert.equal(snapshot.lossMatrix.transitions[0].dropped, 1);
});

test('preserva contadores por família e query no snapshot', () => {
  const funnel = createDiscoveryFunnel({ marketplace: 'Amazon', scenario: 'informatica_editorial' });
  funnel.setDimensionTelemetry({
    byFamily: { notebook: { extracted: 10, afterParse: 8 } },
    byQuery: { 'webcam para notebook': { extracted: 4, afterParse: 4 } },
  });
  const snapshot = funnel.snapshot();
  assert.deepEqual(snapshot.dimensionTelemetry.byFamily.notebook, { extracted: 10, afterParse: 8 });
  assert.deepEqual(snapshot.dimensionTelemetry.byQuery['webcam para notebook'], { extracted: 4, afterParse: 4 });
});

test('agrega evidências reais da Shopee por família e consulta', () => {
  const dimensions = buildShopeeDimensionTelemetry([
    {
      source: 'productOfferV2.certified.notebook', family: 'notebook', page: 1,
      requested: { keyword: 'notebook', productCatId: 100644 }, returned: 20,
      acceptedShopType: 18, acceptedSemantic: 12, status: 200,
    },
    {
      source: 'productOfferV2.certified.notebook', family: 'notebook', page: 2,
      requested: { keyword: 'notebook', productCatId: 100644 }, returned: 10,
      acceptedShopType: 9, acceptedSemantic: 7, status: 200, stopReason: 'has_next_page_false',
    },
    {
      source: 'productOfferV2.certified.mouse', family: 'mouse', page: 1,
      requested: { keyword: 'mouse', productCatId: 100644 }, returned: 0,
      acceptedShopType: 0, acceptedSemantic: 0, status: 500, stopReason: 'source_error',
    },
  ]);

  assert.deepEqual(dimensions.byFamily.notebook, {
    attempted: 2, extracted: 30, afterParse: 27, afterRelevance: 19,
    rejected: 11, errors: 0, pages: 2,
  });
  assert.equal(dimensions.byFamily.mouse.errors, 1);
  assert.equal(dimensions.byQuery.notebook.extracted, 30);
  assert.equal(dimensions.byQuery.mouse.errors, 1);
});
