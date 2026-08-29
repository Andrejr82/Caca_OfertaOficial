'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const ml = require('../mercadolivre-official-intents-v5.cjs');
const shopee = require('../shopee-native-discovery-v5.cjs');
const { EDITORIAL_SCENARIOS } = require('../editorial-scenario-config.cjs');

test('Mercado Livre expõe profundidade API-first ampliada sem remover gates', () => {
  assert.equal(ml.DEFAULT_MAX_PER_INTENT, 30);
  assert.equal(ml.MAX_DOMAINS_PER_INTENT, 5);
  assert.equal(ml.MAX_PRODUCTS_PER_DOMAIN, 20);
  assert.equal(ml.MAX_DISCOVERY_POOL, 120);
});

test('Shopee mantém paginação ampliada no contrato editorial', () => {
  assert.equal(shopee.DEFAULT_MAX_PAGES_PER_KEYWORD, 3);
  assert.equal(EDITORIAL_SCENARIOS.moda_editorial.maxPagesPerKeyword, 3);
});

test('Amazon expõe limites de cobertura ampliados para execução controlada', () => {
  const amazon = require('../amazon-native-top20-v5.cjs');
  assert.equal(amazon.DEFAULT_CATEGORY_LIMIT, 10);
  assert.equal(amazon.DEFAULT_SUBCATEGORY_LIMIT, 3);
  assert.equal(amazon.DEFAULT_MAX_PER_KEYWORD, 50);
});
