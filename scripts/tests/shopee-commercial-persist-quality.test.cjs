'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { controlledCandidateQuality, selectControlledPersistCandidates } = require('../shopee-openapi-v1-controlled-persist.cjs');
const p = (overrides={}) => ({ itemId: String(overrides.itemId || '1'), ratingStar: 4.8, sales: 1200, priceMin: 49.9, priceMax: 59.9, priceRangeAmbiguous: true, safeForPublication: true, ...overrides });
test('bloqueia rating abaixo de 4.7', () => assert.equal(controlledCandidateQuality(p({ ratingStar: 4.6 })).eligible, false));
test('bloqueia vendas abaixo de 100', () => assert.equal(controlledCandidateQuality(p({ sales: 44 })).eligible, false));
test('bloqueia faixa extrema de preço ambígua', () => assert.deepEqual(controlledCandidateQuality(p({ priceMin: 10.8, priceMax: 39.5 })).reasons, ['extreme_price_range']));
test('mantém variação de preço normal', () => assert.equal(controlledCandidateQuality(p()).eligible, true));
test('preenche o limite com os próximos candidatos qualificados', () => {
  const rows = [p({ itemId:'1', ratingStar:4.6 }), p({ itemId:'2', sales:50 }), p({ itemId:'3' }), p({ itemId:'4' }), p({ itemId:'5' })];
  const selected = selectControlledPersistCandidates(rows, { maxNewCandidates:2 });
  assert.deepEqual(selected.map((x)=>x.itemId), ['3','4']);
});
