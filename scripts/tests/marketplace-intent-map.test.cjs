'use strict';

const assert = require('node:assert/strict');
const { INTENT_MAP, MARKETPLACES, getMarketplaceTerms } = require('../marketplace-intent-map.cjs');

assert.equal(Object.keys(INTENT_MAP).length, 14);
for (const scenario of Object.values(INTENT_MAP)) {
  for (const marketplace of MARKETPLACES) {
    assert.ok(scenario.marketplaces[marketplace].terms.length > 0);
  }
}
assert.ok(getMarketplaceTerms('casa_cozinha_editorial', 'Amazon').includes('cafeteira'));
assert.ok(getMarketplaceTerms('casa_cozinha_editorial', 'Shopee').includes('cafeteira'));
assert.ok(getMarketplaceTerms('casa_cozinha_editorial', 'Mercado Livre').includes('cafeteira'));
console.log('PASS matriz canônica de intenções por marketplace');
