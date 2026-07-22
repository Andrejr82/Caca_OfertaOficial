'use strict';

const assert = require('node:assert/strict');
const { INTENT_MAP, MARKETPLACES, getMarketplaceTerms } = require('../marketplace-intent-map.cjs');

assert.ok(Object.keys(INTENT_MAP).length >= 11);
for (const scenario of Object.values(INTENT_MAP)) {
  for (const marketplace of MARKETPLACES) {
    assert.ok(scenario.marketplaces[marketplace].terms.length > 0);
  }
}
assert.ok(getMarketplaceTerms('eletros_cozinha', 'Amazon').includes('cafeteira'));
assert.ok(getMarketplaceTerms('eletros_cozinha', 'Shopee').includes('cafeteira elétrica'));
assert.ok(getMarketplaceTerms('eletros_cozinha', 'Mercado Livre').includes('cafeteira elétrica'));
console.log('PASS matriz canônica de intenções por marketplace');
