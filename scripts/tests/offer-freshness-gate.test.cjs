'use strict';

const assert = require('node:assert/strict');
const { filterFreshCandidates, isMateriallyBetter } = require('../offer-freshness-gate.cjs');

const base = {
  sourceItemId: 'MLB-1',
  title: 'Jogo de Lençol Casal Algodão',
  currentPrice: 100,
  originalPrice: 120,
  marketplaceMetrics: { item_id: 'MLB-1' },
};
const recent = [{
  item_id: 'MLB-1',
  product_name: base.title,
  current_price: 100,
  old_price: 120,
  created_at: new Date().toISOString(),
}];

const blocked = filterFreshCandidates('Mercado Livre', [base], recent);
assert.equal(blocked.accepted.length, 0);
assert.equal(blocked.rejected[0].reason, 'cooldown_repeticao_historica');

const improved = filterFreshCandidates('Mercado Livre', [{ ...base, currentPrice: 89 }], recent);
assert.equal(improved.accepted.length, 1);
assert.equal(improved.rejected.length, 0);
assert.equal(isMateriallyBetter({ currentPrice: 90 }, { current_price: 100 }), true);

console.log('offer-freshness-gate: OK');
