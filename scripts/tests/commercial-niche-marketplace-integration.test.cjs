'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { getMarketplaceScenarioContract } = require('../marketplace-scenario-contracts.cjs');
const { resolveNichePlanFromLegacyScenario } = require('../commercial-niche-runtime-adapter.cjs');

const CASES = [
  ['casa_cozinha_editorial', 'casa_cozinha_organizacao'],
  ['beleza_editorial', 'beleza'],
  ['moda_editorial', 'moda'],
  ['eletrodomesticos_editorial', 'eletrodomesticos'],
  ['informatica_editorial', 'informatica'],
  ['ferramentas_editorial', 'ferramentas'],
  ['pet_editorial', 'pet'],
];

const MARKETPLACES = ['Shopee', 'Amazon', 'Mercado Livre'];

for (const [scenarioId, nicheId] of CASES) {
  for (const marketplace of MARKETPLACES) {
    test(`${scenarioId} -> ${nicheId} / ${marketplace}`, () => {
      const plan = resolveNichePlanFromLegacyScenario(scenarioId, [marketplace]);
      assert.equal(plan.mode, 'niche_mapped');
      assert.equal(plan.nicheId, nicheId);

      const expected = plan.plans[marketplace];
      const contract = getMarketplaceScenarioContract(scenarioId, marketplace);

      assert.ok(contract, 'contrato deve existir');
      assert.equal(contract.source, 'commercial_niche_contract');
      assert.equal(contract.commercialNiche.id, nicheId);
      assert.equal(contract.commercialNiche.affinity, expected.affinity);
      assert.equal(contract.commercialNiche.candidateLimit, expected.rules.candidateLimit);
      assert.equal(contract.commercialNiche.maxPagesPerTerm, expected.rules.maxPagesPerTerm);
      assert.deepEqual(contract.keywords, expected.terms.all);
      assert.deepEqual(contract.allowedProductTerms, expected.contract.guardrails.allowedProductTerms);

      for (const blocked of expected.contract.guardrails.blockedProductTerms) {
        assert.ok(contract.blockedProductTerms.includes(blocked), `blocked ausente: ${blocked}`);
      }

      if (marketplace === 'Shopee') {
        assert.deepEqual(contract.apiCategories, expected.contract.shopeeApiCategories);
      }
      if (marketplace === 'Amazon') {
        assert.deepEqual(contract.browseNodeIds, expected.contract.amazonBrowseNodes);
      }
      if (marketplace === 'Mercado Livre') {
        assert.deepEqual(contract.apiCategories, []);
      }
    });
  }
}

test('organizacao_editorial também converge para o macro nicho Casa/Cozinha/Organização', () => {
  const resolved = resolveNichePlanFromLegacyScenario('organizacao_editorial', MARKETPLACES);
  assert.equal(resolved.mode, 'niche_mapped');
  assert.equal(resolved.nicheId, 'casa_cozinha_organizacao');
});

test('cenários fora dos 7 nichos permanecem legacy_only', () => {
  for (const id of ['celulares_editorial', 'esporte_editorial', 'tv_audio_editorial', 'moveis_editorial', 'grandes_ofertas_editorial', 'cupons_aprovados_editorial']) {
    const resolved = resolveNichePlanFromLegacyScenario(id, MARKETPLACES);
    assert.equal(resolved.mode, 'legacy_only', id);
  }
});
