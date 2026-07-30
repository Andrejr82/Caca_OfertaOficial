'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { classifyCandidate, buildClassificationCoverage } = require('../classification-coverage.cjs');

const base = {
  marketplace: 'Amazon',
  title: 'Air Fryer 5L',
  category: { name: 'Eletrodomésticos' },
  sourceUrl: 'https://example.com/product',
  imageUrl: 'https://example.com/image.jpg',
  currentPrice: 100,
};

test('prioriza domínio oficial sobre título', () => {
  const result = classifyCandidate({ ...base, rawPayload: { domain_id: 'MLB-AIR_FRYERS' }, title: 'Produto sem nome útil' }, 'Amazon');
  assert.equal(result.productType, 'air_fryer');
  assert.equal(result.source, 'domain:MLB-AIR_FRYERS');
  assert.equal(result.confidence, 1);
});

test('classifica por atributo antes de título', () => {
  const result = classifyCandidate({ ...base, title: 'Eletrodoméstico cozinha', attributes: [{ name: 'Tipo', value_name: 'air fryer' }] }, 'Amazon');
  assert.equal(result.productType, 'air_fryer');
  assert.equal(result.source, 'attributes');
});

test('retorna review_required para produto sem evidência', () => {
  const result = classifyCandidate({ ...base, category: {}, title: 'Produto especial' }, 'Amazon');
  assert.equal(result.status, 'review_required');
  assert.equal(result.productType, 'unknown');
});

test('cobertura exige 100% classificado para aprovação', () => {
  const products = [
    { ...base, classification: classifyCandidate(base, 'Amazon') },
    { ...base, category: {}, title: 'Produto especial', classification: classifyCandidate({ ...base, category: {}, title: 'Produto especial' }, 'Amazon') },
  ];
  const result = buildClassificationCoverage(products, 'Amazon');
  assert.equal(result.total_validos, 2);
  assert.equal(result.total_classificados, 1);
  assert.equal(result.cobertura_classificacao, 0.5);
  assert.equal(result.approved_for_publication, false);
});
