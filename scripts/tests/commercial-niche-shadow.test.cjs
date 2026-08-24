'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  compareLegacyAndNicheProducts,
  runCommercialNicheShadowCycle,
} = require('../commercial-niche-shadow-runner.cjs');
const { COMMERCIAL_NICHE_IDS } = require('../commercial-niche-config.cjs');
const { buildNicheMarketplacePlan } = require('../commercial-niche-runtime-adapter.cjs');

test('1. Compara corretamente métricas entre legacy e niche sem persistência', () => {
  const legacy = [
    { sourceItemId: 'item-1', title: 'Air Fryer 4L' },
    { sourceItemId: 'item-2', title: 'Cafeteira Expresso' },
    { sourceItemId: 'item-3', title: 'Liquidificador 1000W' },
  ];

  const niche = [
    { sourceItemId: 'item-2', title: 'Cafeteira Expresso' },
    { sourceItemId: 'item-4', title: 'Organizador de Cozinha' },
  ];

  const comparison = compareLegacyAndNicheProducts(legacy, niche, {
    marketplace: 'Shopee',
    legacyScenarioId: 'casa_cozinha_editorial',
    nicheId: 'casa_cozinha_organizacao',
    affinity: 3,
    latencyMs: 120,
  });

  assert.equal(comparison.marketplace, 'Shopee');
  assert.equal(comparison.legacyCount, 3);
  assert.equal(comparison.nicheCount, 2);
  assert.equal(comparison.overlapCount, 1); // item-2
  assert.equal(comparison.onlyLegacyCount, 2); // item-1, item-3
  assert.equal(comparison.onlyNicheCount, 1); // item-4
  assert.equal(comparison.persisted, false);
  assert.equal(comparison.mode, 'shadow_comparison');
});

test('2. Executa ciclo shadow para cenário compatível com 3 marketplaces', async () => {
  const mockDiscover = async (marketplace, plan) => {
    return [
      { sourceItemId: `${marketplace}-p1`, title: `${plan.nicheName} Produto 1` },
      { sourceItemId: `${marketplace}-p2`, title: `${plan.nicheName} Produto 2` },
    ];
  };

  const result = await runCommercialNicheShadowCycle({
    legacyScenarioId: 'casa_cozinha_editorial',
    legacyResultByMarketplace: {
      Shopee: [{ sourceItemId: 'Shopee-p1', title: 'Antigo Produto' }],
      Amazon: [],
      'Mercado Livre': [],
    },
    marketplaces: ['Shopee', 'Amazon', 'Mercado Livre'],
    discoverNicheMarketplace: mockDiscover,
  });

  assert.equal(result.mode, 'shadow_compatible');
  assert.equal(result.nicheId, 'casa_cozinha_organizacao');
  assert.equal(result.comparisons.length, 3);

  const shopeeComp = result.comparisons.find((c) => c.marketplace === 'Shopee');
  assert.ok(shopeeComp);
  assert.equal(shopeeComp.legacyCount, 1);
  assert.equal(shopeeComp.nicheCount, 2);
  assert.equal(shopeeComp.overlapCount, 1);
  assert.equal(shopeeComp.persisted, false);
});

test('3. Cenário fora dos 7 nichos retorna modo legacy_only no ciclo shadow', async () => {
  const result = await runCommercialNicheShadowCycle({
    legacyScenarioId: 'esporte_editorial',
    marketplaces: ['Shopee', 'Amazon', 'Mercado Livre'],
  });

  assert.equal(result.mode, 'legacy_only');
  assert.equal(result.reason, 'legacy_scenario_outside_final_7_niches');
  assert.equal(result.comparisons.length, 0);
});

test('4. Validação completa de todos os 7 nichos nos 3 marketplaces', () => {
  for (const nicheId of COMMERCIAL_NICHE_IDS) {
    for (const marketplace of ['Shopee', 'Amazon', 'Mercado Livre']) {
      const plan = buildNicheMarketplacePlan(nicheId, marketplace);
      assert.ok(plan);
      assert.ok(plan.terms.all.length > 0, `Nicho ${nicheId} em ${marketplace} deve ter termos de busca`);
      assert.ok(plan.contract);
    }
  }
});
