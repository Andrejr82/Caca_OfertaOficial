'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildNicheMarketplacePlan } = require('../commercial-niche-runtime-adapter.cjs');
const { COMMERCIAL_NICHE_IDS } = require('../commercial-niche-config.cjs');

test('1. Valida aplicação de regras de afinidade 3, 2 e 1 para todos os nichos', () => {
  for (const nicheId of COMMERCIAL_NICHE_IDS) {
    for (const marketplace of ['Amazon', 'Shopee', 'Mercado Livre']) {
      const plan = buildNicheMarketplacePlan(nicheId, marketplace);
      assert.ok(plan, `Plano deve existir para ${nicheId} no ${marketplace}`);
      
      if (plan.affinity === 3) {
        assert.equal(plan.rules.candidateLimit, 10);
        assert.equal(plan.rules.maxPagesPerTerm, 2);
        assert.equal(plan.terms.expansion.length, plan.contract.expansionProducts.length);
      } else if (plan.affinity === 2) {
        assert.equal(plan.rules.candidateLimit, 7);
        assert.equal(plan.rules.maxPagesPerTerm, 1);
        assert.equal(plan.terms.expansion.length, Math.ceil(plan.contract.expansionProducts.length * 0.5));
      } else if (plan.affinity === 1) {
        assert.equal(plan.rules.candidateLimit, 4);
        assert.equal(plan.rules.maxPagesPerTerm, 1);
        assert.equal(plan.terms.expansion.length, 0);
      }
    }
  }
});
